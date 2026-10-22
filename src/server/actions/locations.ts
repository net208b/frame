'use server';

import {
  fail,
  NOT_CONFIGURED_MESSAGE,
  ok,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer, getViewerSuspension } from '@/lib/auth';
import { isDemoMode, LOCATION_POLICY } from '@/lib/config';
import { getLocations } from '@/lib/data/repository';
import { boundingBoxAround, evaluateLocationSubmission } from '@/lib/geo';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { parseForm } from '@/lib/validation';
import { locationSubmissionSchema } from '@/lib/validation/location';
import type { LocationSummary, SubmissionSignal } from '@/types/domain';

/**
 * Proposing a place.
 *
 * The one thing this module will not do is create a place. A member proposing
 * somewhere writes a row in `location_submissions` with status `pending`, and a
 * moderator decides. Every automated check here produces a *signal* stored
 * alongside the row: a coordinate that falls inside its country's bounding box
 * is not evidence that the place exists, that it is accessible, or that anybody
 * may photograph it, and treating it as evidence is how a map ends up pointing
 * strangers at somebody's front door.
 */

/** A day, for the submission limit in LOCATION_POLICY. */
const DAY_SECONDS = 24 * 60 * 60;

/** How many approved places the duplicate scan reads around a proposed point. */
const NEARBY_SCAN_LIMIT = 50;

interface NearbyRow {
  id: string | null;
  name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Approved places close enough to the proposed point to be worth comparing.
 *
 * A bounding box rather than a radius, because that is what PostgREST can
 * filter on without PostGIS in the query path; `evaluateLocationSubmission`
 * then applies the real circular radius, so the box only has to be a superset.
 * A failure here is not fatal: losing the duplicate signal makes the
 * moderator's job harder, and refusing the submission would make it impossible.
 */
async function nearbyApprovedLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  latitude: number,
  longitude: number,
): Promise<Array<{ id: string; label: string; latitude: number; longitude: number }>> {
  const box = boundingBoxAround(latitude, longitude, LOCATION_POLICY.duplicateRadiusMetres);

  const { data, error } = await supabase
    .from('locations')
    .select('id, name, city, latitude, longitude')
    .eq('status', 'approved')
    .gte('latitude', box.south)
    .lte('latitude', box.north)
    .gte('longitude', box.west)
    .lte('longitude', box.east)
    .limit(NEARBY_SCAN_LIMIT);

  if (error) {
    console.error(
      `FRAME locations: the duplicate scan around ${latitude},${longitude} failed — ${error.message}`,
    );
    return [];
  }

  const candidates: Array<{ id: string; label: string; latitude: number; longitude: number }> = [];
  for (const row of (data ?? []) as NearbyRow[]) {
    const { id, name, latitude: rowLatitude, longitude: rowLongitude } = row;
    if (!id || !name || typeof rowLatitude !== 'number' || typeof rowLongitude !== 'number') {
      continue;
    }
    candidates.push({
      id,
      label: row.city ? `${name}, ${row.city}` : name,
      latitude: rowLatitude,
      longitude: rowLongitude,
    });
  }
  return candidates;
}

/**
 * Record a proposed place for review.
 *
 * Order, which is the same order every write action in FRAME follows:
 * capability, identity, authorisation, rate limit, validation, write.
 */
export async function submitLocation(input: unknown): Promise<ActionResult<{ submissionId: string }>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) {
    return fail('Sign in to propose a place.', 'unauthenticated');
  }

  // A suspended account is treated as signed out for every write path: the
  // suspension is the decision, and row-level security should not be the only
  // thing enforcing it.
  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    return fail(
      suspension.reason
        ? `This account is suspended, so it cannot propose places. ${suspension.reason}`
        : 'This account is suspended, so it cannot propose places.',
      'forbidden',
    );
  }

  const verdict = await checkRateLimit(
    `location:submit:day:${viewer.id}`,
    LOCATION_POLICY.maxSubmissionsPerDay,
    DAY_SECONDS,
  );
  if (!verdict.allowed) {
    return fail(
      `FRAME accepts ${LOCATION_POLICY.maxSubmissionsPerDay} proposed places per account per day, so that each one gets read properly. You can propose another in ${Math.ceil(verdict.retryAfterSeconds / 60)} minutes.`,
      'rate_limited',
    );
  }

  const parsed = parseForm(input, locationSubmissionSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);
  const submission = parsed.data;

  const supabase = await createClient();

  const signals: SubmissionSignal[] = evaluateLocationSubmission({
    latitude: submission.latitude,
    longitude: submission.longitude,
    countryCode: submission.countryCode,
    existingNearby: await nearbyApprovedLocations(
      supabase,
      submission.latitude,
      submission.longitude,
    ),
  });

  const { data, error } = await supabase
    .from('location_submissions')
    .insert({
      proposed_name: submission.proposedName,
      city: submission.city,
      country: submission.country,
      country_code: submission.countryCode,
      latitude: submission.latitude,
      longitude: submission.longitude,
      note: submission.note,
      submitted_by: viewer.id,
      photograph_id: submission.photographId ?? null,
      // Advisory only. There is deliberately no path from a clean set of
      // signals to an approved location.
      signals,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    return fail(
      'That place could not be recorded for review. Nothing was saved, so you can try again.',
      'unknown',
    );
  }

  const submissionId = (data as { id: string }).id;

  // The moderation queue is the only surface a pending submission appears on.
  revalidateLocalisedPath('/moderation');

  return ok(
    { submissionId },
    'Your proposed place is queued for review. A moderator reads every one before it appears on the map.',
  );
}

/**
 * Approved places matching a search, for the picker in the upload wizard.
 *
 * A read, not a write, so it carries no rate limit: it returns exactly the
 * approved locations the public `/locations` index already lists, and it reads
 * through the repository so demo mode answers from the bundled dataset instead
 * of failing.
 */
export async function searchApprovedLocations(
  query: string,
): Promise<ActionResult<LocationSummary[]>> {
  const search = typeof query === 'string' ? query.trim() : '';
  if (search.length < 2) {
    return ok([]);
  }

  try {
    const page = await getLocations({ search, page: 1 });
    const matches: LocationSummary[] = page.items.map((location) => ({
      id: location.id,
      slug: location.slug,
      name: location.name,
      city: location.city,
      country: location.country,
      countryCode: location.countryCode,
      photographCount: location.photographCount,
      translations: location.translations,
    }));
    return ok(matches);
  } catch (error) {
    console.error(
      `FRAME locations: searching approved locations for "${search}" failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return fail(
      'Places could not be searched just now. You can still propose a new place, or carry on and add the place later.',
      'unknown',
    );
  }
}
