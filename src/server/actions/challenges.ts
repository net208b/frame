'use server';

import {
  fail,
  failFromZod,
  ok,
  NOT_CONFIGURED_MESSAGE,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer, getViewerSuspension, isModerator } from '@/lib/auth';
import { CHALLENGE_POLICY, isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { awardSchema, createChallengeSchema, entrySchema } from '@/lib/validation/challenge';

/**
 * Challenges.
 *
 * Migration 0027 holds every rule: who may set one, whether it is open, what
 * may be entered and how many, who may award what and when, and that
 * published results are final. These actions are the courtesy in front of it
 * — a rate limit, a sentence instead of an error code, and revalidation of
 * the pages a change shows up on. Where the database refuses with a sentence
 * of its own (a closed challenge, the new-work rule, a spent allowance), that
 * sentence is passed on: it is the most precise account of why.
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Postgres codes the challenge rules raise for a refusal the member can act on. */
const RULE_CODES = new Set(['42501', '23514', '23505', '23503', 'P0002', '23P01']);

async function slugOf(supabase: SupabaseClient, challengeId: string): Promise<string | null> {
  const { data } = await supabase.from('challenges').select('slug').eq('id', challengeId).maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

function revalidateChallenge(slug: string | null): void {
  if (slug) revalidateLocalisedPath(`/challenges/${slug}`);
  revalidateLocalisedPath('/community');
}

/* ------------------------------------------------------------------------ */
/* Members                                                                   */
/* ------------------------------------------------------------------------ */

export async function enterChallenge(input: {
  challengeId: string;
  photographId: string;
}): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in to enter a challenge.', 'unauthenticated');

  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    return fail('Your account cannot enter challenges at the moment.', 'forbidden');
  }

  const limit = await checkRateLimit(`challenge:${viewer.id}`, CHALLENGE_POLICY.maxPerMinute, 60);
  if (!limit.allowed) {
    return fail(
      `That is a lot of entries at once. Try again in ${limit.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }

  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from('challenge_entries').insert({
    challenge_id: parsed.data.challengeId,
    photograph_id: parsed.data.photographId,
    entrant_id: viewer.id,
  });

  if (error) {
    if (error.code === '23505') return fail('That photograph is already entered.', 'conflict');
    if (RULE_CODES.has(error.code ?? '')) return fail(error.message, 'forbidden');
    return fail('Your entry could not be saved. Try again in a moment.', 'unknown');
  }

  revalidateChallenge(await slugOf(supabase, parsed.data.challengeId));
  return ok(undefined, 'Entered.');
}

export async function withdrawEntry(input: {
  challengeId: string;
  photographId: string;
}): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in first.', 'unauthenticated');

  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('challenge_entries')
    .delete()
    .eq('challenge_id', parsed.data.challengeId)
    .eq('photograph_id', parsed.data.photographId)
    .eq('entrant_id', viewer.id)
    .select('photograph_id');

  if (error) return fail('Your entry could not be withdrawn. Try again in a moment.', 'unknown');
  // The delete policy matches nothing once a challenge has closed, which is
  // the rule, so an empty result is a refusal rather than a success.
  if (!data || data.length === 0) {
    return fail('Entries can be withdrawn only while the challenge is open.', 'forbidden');
  }

  revalidateChallenge(await slugOf(supabase, parsed.data.challengeId));
  return ok(undefined, 'Withdrawn.');
}

/* ------------------------------------------------------------------------ */
/* Staff                                                                     */
/* ------------------------------------------------------------------------ */

async function requireStaff(): Promise<
  { ok: true; viewerId: string } | { ok: false; result: ActionResult<never> }
> {
  if (isDemoMode()) return { ok: false, result: fail(NOT_CONFIGURED_MESSAGE, 'not_configured') };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, result: fail('Sign in first.', 'unauthenticated') };
  // A courtesy: the policies decide, but a member should be told plainly.
  if (!isModerator(viewer)) {
    return { ok: false, result: fail('Only staff manage challenges.', 'forbidden') };
  }
  return { ok: true, viewerId: viewer.id };
}

export async function createChallenge(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const parsed = createChallengeSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const value = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from('challenges').insert({
    slug: value.slug,
    title_en: value.titleEn,
    title_th: value.titleTh,
    brief_en: value.briefEn,
    brief_th: value.briefTh,
    opens_at: value.opensAt,
    closes_at: value.closesAt,
    max_entries: value.maxEntries,
    requires_new_work: value.requiresNewWork,
    created_by: staff.viewerId,
  });

  if (error) {
    if (error.code === '23P01') {
      return fail('Its dates overlap another challenge. One challenge runs at a time.', 'conflict', {
        opensAt: 'Overlaps another challenge.',
      });
    }
    if (error.code === '23505') {
      return fail('Another challenge already uses that address.', 'conflict', {
        slug: 'Already in use.',
      });
    }
    if (RULE_CODES.has(error.code ?? '')) return fail(error.message, 'validation');
    return fail('The challenge could not be saved. Try again in a moment.', 'unknown');
  }

  revalidateLocalisedPath('/community');
  revalidateLocalisedPath('/moderation');
  return ok({ slug: value.slug }, 'Challenge saved.');
}

export async function setAward(input: {
  challengeId: string;
  photographId: string;
  award: string | null;
  note: string | null;
}): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const parsed = awardSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const { challengeId, photographId, award, note } = parsed.data;

  const supabase = await createClient();
  const { error } =
    award === null
      ? await supabase
          .from('challenge_awards')
          .delete()
          .eq('challenge_id', challengeId)
          .eq('photograph_id', photographId)
      : await supabase.from('challenge_awards').upsert(
          {
            challenge_id: challengeId,
            photograph_id: photographId,
            award,
            note,
            awarded_by: staff.viewerId,
          },
          { onConflict: 'challenge_id,photograph_id' },
        );

  if (error) {
    if (RULE_CODES.has(error.code ?? '')) return fail(error.message, 'forbidden');
    return fail('That award could not be saved. Try again in a moment.', 'unknown');
  }

  revalidateLocalisedPath('/moderation');
  revalidateChallenge(await slugOf(supabase, challengeId));
  return ok(undefined, award === null ? 'Award removed.' : 'Award saved.');
}

export async function publishResults(challengeId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const parsed = entrySchema.shape.challengeId.safeParse(challengeId);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc('publish_challenge_results', { p_challenge_id: parsed.data });
  if (error) {
    if (RULE_CODES.has(error.code ?? '')) return fail(error.message, 'forbidden');
    return fail('The results could not be published. Try again in a moment.', 'unknown');
  }

  revalidateLocalisedPath('/moderation');
  revalidateChallenge(await slugOf(supabase, parsed.data));
  return ok(undefined, 'Results published. The awarded photographers have been told.');
}
