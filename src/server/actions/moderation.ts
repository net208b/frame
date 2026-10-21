'use server';

import { z } from 'zod';

import { fail, NOT_CONFIGURED_MESSAGE, ok, type ActionResult } from '@/lib/action-result';
import { getViewer, getViewerSuspension, isModerator, type Viewer } from '@/lib/auth';
import { isDemoMode, serverEnv } from '@/lib/config';
import { storageKeys } from '@/lib/images/variants';
import { storageDriver } from '@/lib/storage';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { parseForm } from '@/lib/validation';
import { identifier } from '@/lib/validation/fields';
import {
  MODERATION_LIMITS,
  moderationDecisionSchema,
  reportResolutionSchema,
  submissionDecisionSchema,
  suspendAccountSchema,
  uploadActionSchema,
} from '@/lib/validation/moderation';
import { PIN_PRECISIONS, type ModerationAction, type ModerationDecision } from '@/types/domain';

/**
 * Moderation decisions.
 *
 * Four commitments, in this order, on every action in this file:
 *
 * 1. Capability. Demo mode has no database, so a decision cannot be recorded
 *    and the action says so instead of reporting a success that did not happen.
 * 2. Identity and authorisation, re-read from the session on the server. The
 *    `/moderation` layout also checks, but that check is a courtesy to the
 *    reader: these functions are a public HTTP endpoint and are the only thing
 *    standing between a crafted request and a member's photograph.
 * 3. Rate limit, keyed on the moderator's account.
 * 4. Validation, then the write, then the audit row, then revalidation.
 *
 * Nothing here writes `profiles.role`. A moderation tool that can grant
 * moderation is not a moderation tool, and the schema's
 * `profiles_guard_privileged_columns` trigger would refuse it anyway — but the
 * column simply never appears in an update payload below, so the refusal never
 * has to happen.
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ModerationSubjectType = ModerationAction['subjectType'];

/* ------------------------------------------------------------------------ */
/* Messages                                                                  */
/* ------------------------------------------------------------------------ */

const NOT_SIGNED_IN = 'Sign in as a moderator to record a decision.';

/**
 * Deliberately the same sentence for "you are not a moderator" and "there is
 * no such queue item for you": a non-moderator learns nothing about what the
 * moderation tools can do from a refusal.
 */
const NOT_A_MODERATOR = 'This account cannot record moderation decisions.';

const SUSPENDED =
  'This account is suspended, so it cannot record moderation decisions. The suspension reason is on your profile.';

const REASON_REQUIRED =
  'This decision is shown to the member, so it needs a reason. Nothing was changed.';

/* ------------------------------------------------------------------------ */
/* Authorisation                                                             */
/* ------------------------------------------------------------------------ */

type Authorisation = { ok: true; viewer: Viewer } | { ok: false; refusal: ActionResult<never> };

/**
 * The moderator check, as a value rather than a redirect.
 *
 * `requireModerator()` in @/lib/auth answers with `notFound()`, which is right
 * for a route — a probe cannot tell `/moderation` from a URL that does not
 * exist — but wrong for an action, where an expected refusal has to travel back
 * as an `ActionResult` the form can render. This reads the same session through
 * the same cached helpers and applies the same three rules: signed in, not
 * suspended, role moderator or admin.
 */
async function authoriseModerator(): Promise<Authorisation> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, refusal: fail(NOT_SIGNED_IN, 'unauthenticated') };

  // A suspended account is treated as signed out for every write, whatever its
  // role, so a compromised moderator account can be stopped by suspending it.
  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) return { ok: false, refusal: fail(SUSPENDED, 'forbidden') };

  if (!isModerator(viewer)) return { ok: false, refusal: fail(NOT_A_MODERATOR, 'forbidden') };

  return { ok: true, viewer };
}

/* ------------------------------------------------------------------------ */
/* Rate limiting                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Two windows, under two different bucket names.
 *
 * `checkRateLimit` records one hit per call against the bucket it is given, so
 * two windows sharing a bucket would charge every decision twice and halve
 * both limits. The figures are generous for a person working a queue and still
 * bound a script that has got hold of a moderator session.
 */
const BURST = { limit: 30, windowSeconds: 60 } as const;
const SUSTAINED = { limit: 400, windowSeconds: 3600 } as const;

async function guardRate(viewerId: string): Promise<ActionResult<never> | null> {
  const burst = await checkRateLimit(`moderation:burst:${viewerId}`, BURST.limit, BURST.windowSeconds);
  if (!burst.allowed) {
    return fail(
      `That is more decisions than this tool accepts in a minute. Try again in ${burst.retryAfterSeconds} seconds — nothing was changed.`,
      'rate_limited',
    );
  }

  const sustained = await checkRateLimit(
    `moderation:sustained:${viewerId}`,
    SUSTAINED.limit,
    SUSTAINED.windowSeconds,
  );
  if (!sustained.allowed) {
    return fail(
      `The hourly moderation limit has been reached. Try again in ${sustained.retryAfterSeconds} seconds — nothing was changed.`,
      'rate_limited',
    );
  }

  return null;
}

/* ------------------------------------------------------------------------ */
/* Postgres errors                                                           */
/* ------------------------------------------------------------------------ */

interface QueryError {
  code?: string | null;
  message?: string | null;
}

function errorOf(value: unknown): QueryError {
  if (typeof value !== 'object' || value === null) return {};
  const candidate = value as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === 'string' ? candidate.code : null,
    message: typeof candidate.message === 'string' ? candidate.message : null,
  };
}

/**
 * Turn a Postgres failure into a refusal a moderator can act on.
 *
 * The constraints in `supabase/migrations` are part of the product, not
 * plumbing — `photographs_removed_needs_reason` and
 * `location_submissions_rejection_needs_reason` exist because the brief
 * requires a member to be told why. When one of them fires it means this file
 * has a bug, so the message says which operation failed rather than printing a
 * raw database string at somebody mid-decision.
 */
function failFromQuery(error: unknown, operation: string): ActionResult<never> {
  const { code, message } = errorOf(error);
  console.error(`FRAME moderation: ${operation} failed${code ? ` (${code})` : ''} — ${message ?? 'no message'}`);

  switch (code) {
    case '42501':
      return fail(NOT_A_MODERATOR, 'forbidden');
    case '22P02':
      return fail('That queue item reference is not valid, so nothing was changed.', 'validation');
    case 'P0002':
      return fail('That item is no longer in the queue, so nothing was changed.', 'not_found');
    case '23505':
      return fail('That decision has already been recorded.', 'conflict');
    case '23514':
      return fail(
        `The database refused this decision because it was incomplete: ${operation}. Nothing was changed.`,
        'conflict',
      );
    default:
      return fail(`${operation} could not be completed. Nothing was changed.`, 'unknown');
  }
}

/* ------------------------------------------------------------------------ */
/* The audit trail                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Append the decision to `moderation_actions`.
 *
 * PostgREST cannot wrap two statements in one transaction, so the subject write
 * and this insert are two round trips. The order is deliberate: the subject is
 * changed first and the audit row written immediately after, because an audit
 * trail that records decisions whose effect was then refused would be worse
 * than one that is briefly incomplete — it would be wrong.
 *
 * The insert is retried once, and a caller that still cannot write it reports
 * the gap rather than swallowing it. Closing the window properly needs a
 * SECURITY DEFINER function per decision, the way
 * `approve_location_submission` already does it; that is recorded as a
 * follow-up rather than papered over here.
 */
async function recordAuditRow(
  supabase: SupabaseClient,
  input: {
    decision: ModerationDecision;
    subjectType: ModerationSubjectType;
    subjectId: string;
    reason: string | null;
    moderatorId: string;
  },
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const row = {
    decision: input.decision,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    reason: input.reason,
    // RLS requires this to equal auth.uid(), so a moderator can only ever sign
    // their own decisions.
    moderator_id: input.moderatorId,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase.from('moderation_actions').insert(row);
    if (!error) return { ok: true };
    if (attempt === 1) return { ok: false, error };
  }

  return { ok: false, error: null };
}

/** The message for the one case where the decision stood but the record did not. */
function auditGapMessage(decision: ModerationDecision, subject: string): string {
  return `The decision was applied but could not be written to the audit trail. Record it by hand: ${decision} on ${subject}.`;
}

/* ------------------------------------------------------------------------ */
/* Shared preamble                                                           */
/* ------------------------------------------------------------------------ */

type Preamble =
  | { ok: true; viewer: Viewer; supabase: SupabaseClient }
  | { ok: false; refusal: ActionResult<never> };

/** Capability, identity, authorisation, rate limit — in that order, every time. */
async function begin(): Promise<Preamble> {
  if (isDemoMode()) return { ok: false, refusal: fail(NOT_CONFIGURED_MESSAGE, 'not_configured') };

  const authorisation = await authoriseModerator();
  if (!authorisation.ok) return { ok: false, refusal: authorisation.refusal };

  const limited = await guardRate(authorisation.viewer.id);
  if (limited) return { ok: false, refusal: limited };

  return { ok: true, viewer: authorisation.viewer, supabase: await createClient() };
}

/** The decisions a member is told about, which therefore cannot be unexplained. */
const NEGATIVE_DECISIONS: ReadonlySet<ModerationDecision> = new Set<ModerationDecision>([
  'reject',
  'request_changes',
  'remove_content',
  'suspend_account',
]);

/**
 * The reason check, repeated here on purpose.
 *
 * The zod schemas already refuse a negative decision with no reason, and so do
 * two database constraints. This is the third place, because the brief names it
 * as a rule of the product rather than a detail of a form, and because it
 * narrows `string | null` to `string` for the writes below.
 */
function requireReason(
  decision: ModerationDecision,
  reason: string | null,
): { ok: true; reason: string | null } | { ok: false; refusal: ActionResult<never> } {
  if (!NEGATIVE_DECISIONS.has(decision)) return { ok: true, reason };
  if (reason === null || reason.trim().length === 0) {
    return { ok: false, refusal: fail(REASON_REQUIRED, 'validation', { reason: REASON_REQUIRED }) };
  }
  return { ok: true, reason };
}

/* ------------------------------------------------------------------------ */
/* Row readers                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The client is untyped on purpose (see @/lib/supabase/server), so every row
 * read back here is parsed rather than asserted. A shape that does not match
 * is a deployment whose schema has drifted, and that is worth an honest error.
 */
const nullableText = z.string().nullish();

const photographRowSchema = z.object({
  slug: z.string().min(1),
  owner_id: z.string().min(1),
  status: z.string().min(1),
  published_at: nullableText,
  rights_confirmed_at: nullableText,
  category: nullableText,
  image_width: z.number().nullish(),
  image_height: z.number().nullish(),
});

const reportRowSchema = z.object({
  subject_type: z.string().min(1),
  subject_id: z.string().min(1),
  status: z.string().min(1),
});

const profileRowSchema = z.object({
  username: z.string().min(1),
  role: z.string().min(1),
  is_suspended: z.boolean().nullish(),
});

const slugRowSchema = z.object({ slug: z.string().min(1) });

/** The owner's handle, used only to revalidate their profile page. */
async function usernameOf(supabase: SupabaseClient, profileId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', profileId)
    .maybeSingle();

  if (error || !data) return null;
  const parsed = z.object({ username: z.string().min(1) }).safeParse(data);
  return parsed.success ? parsed.data.username : null;
}

/* ------------------------------------------------------------------------ */
/* Location submissions                                                     */
/* ------------------------------------------------------------------------ */

const SUBMISSION_STATUS: Record<'reject' | 'request_changes', string> = {
  reject: 'rejected',
  request_changes: 'changes_requested',
};

/**
 * Approve, reject, or ask for changes on a proposed place.
 *
 * Approval goes through `approve_location_submission`, which creates the
 * location, links the submission and writes the audit row inside one
 * transaction, and which is idempotent — a double-clicked Approve is one
 * decision, not two places.
 */
export async function decideSubmission(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { viewer, supabase } = started;

  const parsed = parseForm(input, submissionDecisionSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { submissionId, decision, pinPrecision } = parsed.data;
  const checked = requireReason(decision, parsed.data.reason);
  if (!checked.ok) return checked.refusal;
  const reason = checked.reason;

  if (decision === 'approve') {
    const { data, error } = await supabase.rpc('approve_location_submission', {
      p_submission_id: submissionId,
      p_moderator: viewer.id,
    });
    if (error) return failFromQuery(error, 'approving the location submission');

    const locationId = typeof data === 'string' && data.length > 0 ? data : null;
    if (!locationId) {
      return fail(
        'The place was approved but its new record could not be read back. Reload the queue before deciding again.',
        'unknown',
      );
    }

    // The coordinate-privacy decision is taken once, here, and the function
    // above does not carry it — so it is a second write. Both flags are only
    // ever read through publishableCoordinates(), which reduces precision and
    // never widens it.
    // How the place is pinned (0033). The default is the point as submitted;
    // written whatever it is, so the choice made here is the one on the row.
    {
      const { error: precisionError } = await supabase
        .from('locations')
        .update({ pin_precision: pinPrecision })
        .eq('id', locationId);
      if (precisionError) {
        return fail(
          'The place was approved but its pin precision could not be saved. Set it from the console.',
          'unknown',
        );
      }
    }

    const { data: slugRow } = await supabase
      .from('locations')
      .select('slug')
      .eq('id', locationId)
      .maybeSingle();
    const slug = slugRowSchema.safeParse(slugRow);

    revalidateLocalisedPath('/moderation');
    revalidateLocalisedPath('/locations');
    revalidateLocalisedPath('/map');
    if (slug.success) revalidateLocalisedPath(`/locations/${slug.data.slug}`);

    return ok<void>(undefined, 'The place is approved and published.');
  }

  // Rejection and a request for changes both keep the submission row: the
  // member reads the reason and sends a new proposal, and both attempts stay
  // on the record. `.eq('status', 'pending')` is the concurrency guard — a
  // submission another moderator has already decided matches nothing.
  if (reason === null) return fail(REASON_REQUIRED, 'validation', { reason: REASON_REQUIRED });

  const { data, error } = await supabase
    .from('location_submissions')
    .update({
      status: SUBMISSION_STATUS[decision],
      rejection_reason: reason,
      resolved_at: new Date().toISOString(),
      resolved_by: viewer.id,
    })
    .eq('id', submissionId)
    .eq('status', 'pending')
    .select('id');

  if (error) return failFromQuery(error, 'recording the decision on the location submission');
  if (!Array.isArray(data) || data.length === 0) {
    return fail(
      'That submission has already been decided or is no longer pending. Reload the queue.',
      'conflict',
    );
  }

  const audit = await recordAuditRow(supabase, {
    decision,
    subjectType: 'location_submission',
    subjectId: submissionId,
    reason,
    moderatorId: viewer.id,
  });

  revalidateLocalisedPath('/moderation');
  revalidateLocalisedPath('/locations');

  if (!audit.ok) {
    return fail(auditGapMessage(decision, `location submission ${submissionId}`), 'unknown');
  }

  return ok<void>(
    undefined,
    decision === 'reject'
      ? 'The submission is rejected and the member can read your reason.'
      : 'Changes have been requested and the member can read your reason.',
  );
}

/* ------------------------------------------------------------------------ */
/* Reports                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Subject types a moderator can actually act on through row-level security.
 *
 * 0007 gives moderators an UPDATE policy on `photographs` and `locations` and
 * none on `collections` or `profiles` content, so "remove the content" is
 * genuinely unavailable for a collection. The queue does not offer it, and this
 * refuses it again rather than reporting a removal that row-level security
 * would have blocked.
 */
const REMOVABLE_SUBJECTS: ReadonlySet<string> = new Set(['photograph', 'location']);

export async function resolveReport(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { viewer, supabase } = started;

  const parsed = parseForm(input, reportResolutionSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { reportId, decision } = parsed.data;
  const checked = requireReason(decision, parsed.data.reason);
  if (!checked.ok) return checked.refusal;
  const reason = checked.reason;

  const { data: reportRow, error: readError } = await supabase
    .from('reports')
    .select('subject_type, subject_id, status')
    .eq('id', reportId)
    .maybeSingle();

  if (readError) return failFromQuery(readError, 'reading the report');
  if (!reportRow) return fail('That report no longer exists.', 'not_found');

  const report = reportRowSchema.safeParse(reportRow);
  if (!report.success) {
    return fail('That report could not be read, so nothing was changed.', 'unknown');
  }
  if (report.data.status === 'actioned' || report.data.status === 'dismissed') {
    return fail('That report has already been resolved. Reload the queue.', 'conflict');
  }

  const subjectType = report.data.subject_type;
  const subjectId = report.data.subject_id;

  // Revalidation targets, filled in by the removal below when it knows them.
  let photographSlug: string | null = null;
  let ownerUsername: string | null = null;
  let locationSlug: string | null = null;
  let filesWithdrawn = true;

  if (decision === 'remove_content') {
    if (!REMOVABLE_SUBJECTS.has(subjectType)) {
      return fail(
        `FRAME has no moderator write path over a ${subjectType}, so this report cannot be resolved by removing the content. Nothing was changed.`,
        'forbidden',
      );
    }
    if (reason === null) return fail(REASON_REQUIRED, 'validation', { reason: REASON_REQUIRED });

    if (subjectType === 'photograph') {
      const { data: photographRow, error: photographReadError } = await supabase
        .from('photographs')
        .select('slug, owner_id, status, published_at, rights_confirmed_at, category, image_width, image_height')
        .eq('id', subjectId)
        .maybeSingle();

      if (photographReadError) return failFromQuery(photographReadError, 'reading the reported photograph');
      const photograph = photographRow ? photographRowSchema.safeParse(photographRow) : null;
      if (!photograph?.success) {
        return fail('The reported photograph no longer exists, so there is nothing to remove.', 'not_found');
      }

      const { error: removeError } = await supabase
        .from('photographs')
        .update({ status: 'removed', removed_reason: reason })
        .eq('id', subjectId);

      if (removeError) return failFromQuery(removeError, 'removing the reported photograph');

      filesWithdrawn = await withdrawPhotographFiles(subjectId, photograph.data.owner_id);
      photographSlug = photograph.data.slug;
      ownerUsername = await usernameOf(supabase, photograph.data.owner_id);
    } else {
      const { data: locationRow, error: locationReadError } = await supabase
        .from('locations')
        .update({ status: 'rejected' })
        .eq('id', subjectId)
        .select('slug');

      if (locationReadError) return failFromQuery(locationReadError, 'removing the reported place');
      if (!Array.isArray(locationRow) || locationRow.length === 0) {
        return fail('The reported place no longer exists, so there is nothing to remove.', 'not_found');
      }
      const parsedSlug = slugRowSchema.safeParse(locationRow[0]);
      locationSlug = parsedSlug.success ? parsedSlug.data.slug : null;
    }

    const subjectAudit = await recordAuditRow(supabase, {
      decision: 'remove_content',
      subjectType: subjectType === 'photograph' ? 'photograph' : 'location',
      subjectId,
      reason,
      moderatorId: viewer.id,
    });

    if (!subjectAudit.ok) {
      revalidateAfterReport({ photographSlug, ownerUsername, locationSlug });
      return fail(auditGapMessage('remove_content', `${subjectType} ${subjectId}`), 'unknown');
    }
  }

  const { data: resolvedRows, error: resolveError } = await supabase
    .from('reports')
    .update({
      status: decision === 'dismiss' ? 'dismissed' : 'actioned',
      resolved_at: new Date().toISOString(),
      resolved_by: viewer.id,
    })
    .eq('id', reportId)
    .in('status', ['open', 'reviewing'])
    .select('id');

  if (resolveError) return failFromQuery(resolveError, 'closing the report');
  if (!Array.isArray(resolvedRows) || resolvedRows.length === 0) {
    revalidateAfterReport({ photographSlug, ownerUsername, locationSlug });
    return fail(
      'Another moderator resolved this report first. Any content change you made still stands — reload the queue.',
      'conflict',
    );
  }

  const audit = await recordAuditRow(supabase, {
    decision,
    subjectType: toReportSubject(subjectType),
    subjectId,
    reason,
    moderatorId: viewer.id,
  });

  revalidateAfterReport({ photographSlug, ownerUsername, locationSlug });

  if (!audit.ok) return fail(auditGapMessage(decision, `report ${reportId}`), 'unknown');

  return ok<void>(
    undefined,
    decision === 'dismiss'
      ? 'The report is dismissed and closed.'
      : decision === 'remove_content'
        ? `The content is removed and the report is closed.${filesWithdrawn ? '' : FILES_STILL_SERVED}`
        : // `moderation_actions` has no member SELECT policy, so this note
          // reaches moderators and nobody else.
          'The report is closed and your note is in the moderation trail. The owner has not been told.',
  );
}

const REPORT_SUBJECTS: ReadonlySet<string> = new Set(['photograph', 'location', 'profile', 'collection']);

/**
 * Take a removed photograph's files out of storage.
 *
 * Marking the row `removed` takes the photograph off every page, but the
 * bucket is public-read and serves its files without consulting the row, so
 * the addresses that were public while it was up — in caches, in shares, in
 * image search — kept working. A photograph removed for a privacy complaint
 * has to stop being served, not merely stop being linked.
 *
 * Removal is final (0012: a removed photograph cannot be resubmitted), so
 * nothing is lost that the product could have restored. It runs with the
 * service role because the files belong to the member and the policies only
 * let an owner delete their own. A failure does not undo the decision, which
 * is already recorded; it is reported so the moderator knows the files are
 * still there.
 */
async function withdrawPhotographFiles(photographId: string, ownerId: string): Promise<boolean> {
  try {
    const keys = storageKeys(photographId, ownerId);
    await storageDriver().remove(
      [keys.original, keys.thumb, keys.grid, keys.display, keys.full],
      { asService: true },
    );
    return true;
  } catch (error) {
    console.error(
      `FRAME moderation: removing the files of photograph ${photographId} failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

const FILES_STILL_SERVED =
  ' Its image files could not be deleted, so their old addresses may still serve them — check the storage logs.';

/** Narrow a stored subject type, defaulting to the one the audit table allows. */
function toReportSubject(value: string): ModerationSubjectType {
  return REPORT_SUBJECTS.has(value) ? (value as ModerationSubjectType) : 'photograph';
}

function revalidateAfterReport(paths: {
  photographSlug: string | null;
  ownerUsername: string | null;
  locationSlug: string | null;
}): void {
  revalidateLocalisedPath('/moderation');
  if (paths.photographSlug) {
    revalidateLocalisedPath(`/photographs/${paths.photographSlug}`);
    revalidateLocalisedPath('/discover');
  }
  if (paths.ownerUsername) revalidateLocalisedPath(`/photographers/${paths.ownerUsername}`);
  if (paths.locationSlug) {
    revalidateLocalisedPath(`/locations/${paths.locationSlug}`);
    revalidateLocalisedPath('/locations');
    revalidateLocalisedPath('/map');
  }
}

/* ------------------------------------------------------------------------ */
/* Uploads under review                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Keep, hold, or remove an upload the review queue has flagged.
 *
 * `approve` publishes, which the `photographs_publishable` constraint only
 * allows once the row carries a rights confirmation, a category and its pixel
 * dimensions. Those are read first so a missing one is explained here rather
 * than arriving as a check violation.
 */
export async function actOnUpload(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { viewer, supabase } = started;

  const parsed = parseForm(input, uploadActionSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { photographId, decision } = parsed.data;
  const checked = requireReason(decision, parsed.data.reason);
  if (!checked.ok) return checked.refusal;
  const reason = checked.reason;

  const { data: row, error: readError } = await supabase
    .from('photographs')
    .select('slug, owner_id, status, published_at, rights_confirmed_at, category, image_width, image_height')
    .eq('id', photographId)
    .maybeSingle();

  if (readError) return failFromQuery(readError, 'reading the upload');
  const photograph = row ? photographRowSchema.safeParse(row) : null;
  if (!photograph?.success) return fail('That upload no longer exists.', 'not_found');

  const current = photograph.data;
  const update: Record<string, string | null> = {};

  if (decision === 'approve') {
    const missing: string[] = [];
    if (!current.rights_confirmed_at) missing.push('a confirmation from the uploader that the work is theirs');
    if (!current.category) missing.push('a category');
    if (current.image_width === null || current.image_width === undefined) missing.push('its pixel width');
    if (current.image_height === null || current.image_height === undefined) missing.push('its pixel height');

    if (missing.length > 0) {
      return fail(
        `This upload cannot be published yet: it is missing ${missing.join(', ')}. Ask the member to finish it, or hold it under review. Nothing was changed.`,
        'conflict',
      );
    }

    update.status = 'published';
    update.published_at = current.published_at ?? new Date().toISOString();
    update.removed_reason = null;
  } else if (decision === 'remove_content') {
    if (reason === null) return fail(REASON_REQUIRED, 'validation', { reason: REASON_REQUIRED });
    update.status = 'removed';
    update.removed_reason = reason;
  } else {
    // `request_changes`. There is no "changes requested" publication status and
    // no member-readable note column on a photograph, so the durable effect is
    // that the photograph stays unpublished; the reason goes to the audit trail,
    // which members cannot read. The queue copy says so rather than implying a
    // message the product does not send.
    if (reason === null) return fail(REASON_REQUIRED, 'validation', { reason: REASON_REQUIRED });
    update.status = 'under_review';
  }

  const { error: writeError } = await supabase.from('photographs').update(update).eq('id', photographId);
  if (writeError) return failFromQuery(writeError, 'recording the decision on the upload');

  const filesWithdrawn =
    decision === 'remove_content' ? await withdrawPhotographFiles(photographId, current.owner_id) : true;

  const audit = await recordAuditRow(supabase, {
    decision,
    subjectType: 'photograph',
    subjectId: photographId,
    reason,
    moderatorId: viewer.id,
  });

  // A request for changes reaches the member as a notice (0032): what to fix
  // and where to reply. Until this, the reason went only to the audit trail,
  // which members cannot read, and the photograph simply stayed unpublished.
  let noticeSent = decision !== 'request_changes';
  if (decision === 'request_changes' && reason !== null) {
    const contact = serverEnv().adminContactEmail;
    const message = contact ? `${reason}\n\nReply to ${contact}.` : reason;
    const { error: noticeError } = await supabase.rpc('send_admin_notice', {
      p_photograph_id: photographId,
      p_message: message,
    });
    if (noticeError) {
      console.error(`FRAME moderation: the notice for ${photographId} was not sent — ${noticeError.message}`);
    } else {
      noticeSent = true;
    }
  }

  const ownerUsername = await usernameOf(supabase, current.owner_id);
  revalidateLocalisedPath('/moderation');
  revalidateLocalisedPath('/discover');
  revalidateLocalisedPath(`/photographs/${current.slug}`);
  if (ownerUsername) revalidateLocalisedPath(`/photographers/${ownerUsername}`);

  if (!audit.ok) return fail(auditGapMessage(decision, `photograph ${photographId}`), 'unknown');

  return ok<void>(
    undefined,
    decision === 'approve'
      ? 'The photograph is published.'
      : decision === 'remove_content'
        ? `The photograph is removed and the member can read your reason.${filesWithdrawn ? '' : FILES_STILL_SERVED}`
        : noticeSent
          ? 'The photograph stays under review and the member has been sent your message.'
          : 'The photograph stays under review, but the message to the member could not be sent — check the logs.',
  );
}

/* ------------------------------------------------------------------------ */
/* Suspension                                                                */
/* ------------------------------------------------------------------------ */

const PRIVILEGED_ROLES: ReadonlySet<string> = new Set(['moderator', 'admin']);

/**
 * Suspend an account.
 *
 * Three refusals that are not in the schema, because they are about who is
 * acting rather than what was typed: a moderator cannot suspend themselves,
 * cannot suspend another moderator or an admin unless they are an admin, and
 * cannot touch `profiles.role` at all — the update payload holds two columns
 * and neither of them is a role.
 */
export async function suspendAccount(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { viewer, supabase } = started;

  const parsed = parseForm(input, suspendAccountSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { accountId, reason, durationDays } = parsed.data;

  if (accountId === viewer.id) {
    return fail(
      'A moderator cannot suspend their own account. Ask another moderator or an administrator.',
      'forbidden',
    );
  }

  const { data: row, error: readError } = await supabase
    .from('profiles')
    .select('username, role, is_suspended')
    .eq('id', accountId)
    .maybeSingle();

  if (readError) return failFromQuery(readError, 'reading the account');
  const profile = row ? profileRowSchema.safeParse(row) : null;
  if (!profile?.success) return fail('That account no longer exists.', 'not_found');

  if (PRIVILEGED_ROLES.has(profile.data.role) && viewer.role !== 'admin') {
    return fail(
      'Only an administrator can suspend a moderator or another administrator. Nothing was changed.',
      'forbidden',
    );
  }

  if (profile.data.is_suspended === true) {
    return fail('That account is already suspended. Reload the queue.', 'conflict');
  }

  // There is no expiry column on `profiles` and no scheduled job to lift a
  // suspension, so a stated length would be a promise the product cannot keep.
  // It travels with the reason instead, where the member reads it and a
  // moderator can see when to lift it by hand.
  const memberFacingReason =
    durationDays === null
      ? reason
      : `${reason}\n\nIntended length: ${durationDays} ${durationDays === 1 ? 'day' : 'days'}. FRAME does not lift a suspension automatically, so a moderator ends it by hand.`;

  const { data: updated, error: writeError } = await supabase
    .from('profiles')
    .update({ is_suspended: true, suspended_reason: memberFacingReason })
    .eq('id', accountId)
    .select('id');

  if (writeError) return failFromQuery(writeError, 'suspending the account');
  if (!Array.isArray(updated) || updated.length === 0) {
    return fail('That account could not be suspended. Reload the queue.', 'conflict');
  }

  const audit = await recordAuditRow(supabase, {
    decision: 'suspend_account',
    subjectType: 'profile',
    subjectId: accountId,
    reason: memberFacingReason,
    moderatorId: viewer.id,
  });

  revalidateLocalisedPath('/moderation');
  revalidateLocalisedPath('/community');
  revalidateLocalisedPath(`/photographers/${profile.data.username}`);

  if (!audit.ok) return fail(auditGapMessage('suspend_account', `account ${accountId}`), 'unknown');

  return ok<void>(undefined, `@${profile.data.username} is suspended and can read the reason.`);
}

/* ------------------------------------------------------------------------ */
/* Possible duplicate places                                                 */
/* ------------------------------------------------------------------------ */

const DUPLICATE_DECISIONS: ReadonlySet<ModerationDecision> = new Set<ModerationDecision>([
  'dismiss',
  'request_changes',
]);

/**
 * Record a review of two places that may be the same place.
 *
 * FRAME cannot merge locations: there is no merge function, and no table that
 * stores a merge request. So this writes exactly one thing — an audit row — and
 * the queue says so in those words. `dismiss` means the pair was looked at and
 * both entries are real; `request_changes` means one of them should be merged
 * away and the reason says which. A person still has to do it.
 */
export async function recordDuplicateReview(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { viewer, supabase } = started;

  const parsed = parseForm(input, moderationDecisionSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { subjectType, subjectId, decision } = parsed.data;
  if (subjectType !== 'location' || !DUPLICATE_DECISIONS.has(decision)) {
    return fail('That is not a decision this queue can record.', 'validation');
  }

  const checked = requireReason(decision, parsed.data.reason);
  if (!checked.ok) return checked.refusal;

  const audit = await recordAuditRow(supabase, {
    decision,
    subjectType: 'location',
    subjectId,
    reason: checked.reason,
    moderatorId: viewer.id,
  });

  if (!audit.ok) return failFromQuery(audit.error, 'recording the duplicate review');

  revalidateLocalisedPath('/moderation');

  return ok<void>(
    undefined,
    decision === 'dismiss'
      ? 'Noted: both places stay as they are.'
      : 'Flagged for merging. Nothing has been merged — the note is in the audit trail for a person to pick up.',
  );
}

/* ------------------------------------------------------------------------ */
/* Published places: re-pin, or take down                                    */
/* ------------------------------------------------------------------------ */

const pinPrecisionSchema = z.object({
  locationId: identifier('Location'),
  pinPrecision: z.enum(PIN_PRECISIONS),
});

/**
 * Change how a published place is pinned. The precision is a setting rather
 * than a decision about a member, so it is not written to the audit trail;
 * the row's updated_at records that it moved.
 */
export async function setLocationPrecision(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { supabase } = started;

  const parsed = parseForm(input, pinPrecisionSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { data, error } = await supabase
    .from('locations')
    .update({ pin_precision: parsed.data.pinPrecision })
    .eq('id', parsed.data.locationId)
    .select('slug');
  if (error) return failFromQuery(error, 'changing how a place is pinned');
  if (!Array.isArray(data) || data.length === 0) {
    return fail('That place no longer exists.', 'not_found');
  }

  const slug = slugRowSchema.safeParse(data[0]);
  revalidateAfterReport({
    photographSlug: null,
    ownerUsername: null,
    locationSlug: slug.success ? slug.data.slug : null,
  });
  return ok<void>(undefined, 'The pin precision is changed.');
}

const takeDownLocationSchema = z.object({
  locationId: identifier('Location'),
  reason: z.string().trim().min(1, { error: REASON_REQUIRED }).max(MODERATION_LIMITS.reasonMaxLength),
});

/**
 * Take an approved place off the site. Its photographs stay, without a place;
 * the pin disappears. Recorded as remove_content on the location, as a report
 * resolution that removes a place is.
 */
export async function takeDownLocation(input: unknown): Promise<ActionResult<void>> {
  const started = await begin();
  if (!started.ok) return started.refusal;
  const { viewer, supabase } = started;

  const parsed = parseForm(input, takeDownLocationSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);
  const { locationId, reason } = parsed.data;

  const { data, error } = await supabase
    .from('locations')
    .update({ status: 'rejected' })
    .eq('id', locationId)
    .eq('status', 'approved')
    .select('slug');
  if (error) return failFromQuery(error, 'taking a place down');
  if (!Array.isArray(data) || data.length === 0) {
    return fail('That place is not published, so there is nothing to take down.', 'not_found');
  }

  const audit = await recordAuditRow(supabase, {
    decision: 'remove_content',
    subjectType: 'location',
    subjectId: locationId,
    reason,
    moderatorId: viewer.id,
  });

  const slug = slugRowSchema.safeParse(data[0]);
  revalidateAfterReport({
    photographSlug: null,
    ownerUsername: null,
    locationSlug: slug.success ? slug.data.slug : null,
  });

  if (!audit.ok) return fail(auditGapMessage('remove_content', `location ${locationId}`), 'unknown');
  return ok<void>(undefined, 'The place is taken down and its pin is gone.');
}
