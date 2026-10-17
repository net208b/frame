'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  fail,
  failFromZod,
  ok,
  NOT_CONFIGURED_MESSAGE,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer } from '@/lib/auth';
import { APPRECIATION_POLICY, isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

/**
 * Appreciation.
 *
 * One appreciation per member per photograph, reversible, and never counted
 * from a number the browser supplied. The insert, the delete and the
 * denormalised total move together inside the `toggle_appreciation` RPC so a
 * replayed request cannot inflate a score: the UNIQUE(photograph_id,
 * profile_id) constraint is the thing that actually prevents a double vote,
 * not the disabled state of a button.
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Postgres unique violation — the member had already appreciated this frame. */
const UNIQUE_VIOLATION = '23505';

const photographIdSchema = z.uuid('A photograph id must be a UUID.');

/**
 * What `toggle_appreciation` is expected to return: the resulting state and the
 * authoritative total, plus the slug and owner handle when the function can
 * supply them so the right pages can be revalidated without a second query.
 * Both naming conventions are accepted because the SQL function is owned by the
 * data layer; a missing total falls back to a direct read rather than a guess.
 */
const rpcRowSchema = z
  .object({
    appreciated: z.boolean(),
    count: z.number().int().nonnegative().nullish(),
    appreciation_count: z.number().int().nonnegative().nullish(),
    slug: z.string().min(1).nullish(),
    owner_username: z.string().min(1).nullish(),
  })
  .transform((row) => ({
    appreciated: row.appreciated,
    count: row.count ?? row.appreciation_count ?? null,
    slug: row.slug ?? null,
    ownerUsername: row.owner_username ?? null,
  }));

const photographRowSchema = z.object({
  slug: z.string().min(1).nullish(),
  appreciation_count: z.number().int().nonnegative().nullish(),
});

/** Best-effort read used only to recover a total the RPC did not return. */
async function readPhotographRow(
  supabase: SupabaseClient,
  photographId: string,
): Promise<{ slug: string | null; count: number | null }> {
  const { data, error } = await supabase
    .from('photographs')
    .select('slug, appreciation_count')
    .eq('id', photographId)
    .maybeSingle();

  if (error || !data) return { slug: null, count: null };

  const parsed = photographRowSchema.safeParse(data);
  if (!parsed.success) return { slug: null, count: null };

  return { slug: parsed.data.slug ?? null, count: parsed.data.appreciation_count ?? null };
}

function revalidate(slug: string | null, ownerUsername: string | null): void {
  if (slug) revalidatePath(`/photographs/${slug}`);
  if (ownerUsername) revalidatePath(`/photographers/${ownerUsername}`);
  revalidatePath('/discover');
}

export async function toggleAppreciation(
  photographId: string,
): Promise<ActionResult<{ appreciated: boolean; count: number }>> {
  // 1. Capability. Without a database there is nothing to write to, and
  //    pretending otherwise would be the one thing this product must not do.
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  // 2. Authenticate.
  const viewer = await getViewer();
  if (!viewer) {
    return fail('Sign in to appreciate a photograph.', 'unauthenticated');
  }

  // 3. Rate limit, keyed on the account rather than an address: an address is
  //    shared by everyone behind a carrier NAT.
  const bucket = `appreciate:${viewer.id}`;
  const perMinute = await checkRateLimit(bucket, APPRECIATION_POLICY.maxPerMinute, 60);
  if (!perMinute.allowed) {
    return fail(
      `That is a lot of appreciation in one minute. Try again in ${perMinute.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }

  const perHour = await checkRateLimit(bucket, APPRECIATION_POLICY.maxPerHour, 3600);
  if (!perHour.allowed) {
    return fail(
      `You have reached the hourly appreciation limit. Try again in ${perHour.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }

  // 4. Validate.
  const parsedId = photographIdSchema.safeParse(photographId);
  if (!parsedId.success) return failFromZod(parsedId.error);

  // 5. Write. Row-level security applies because the client runs as the viewer.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('toggle_appreciation', {
    p_photograph_id: parsedId.data,
  });

  if (error) {
    // Already appreciated. The constraint did its job, so this is the state
    // the member asked for rather than a failure to report back to them.
    if (error.code === UNIQUE_VIOLATION) {
      const row = await readPhotographRow(supabase, parsedId.data);
      revalidate(row.slug, null);
      if (row.count === null) {
        return fail(
          'You have already appreciated this photograph. Reload the page to see the current total.',
          'conflict',
        );
      }
      return ok({ appreciated: true, count: row.count });
    }

    return fail('Your appreciation could not be saved. Try again in a moment.', 'unknown');
  }

  const payload = Array.isArray(data) ? data.at(0) : data;
  if (payload === null || payload === undefined) {
    return fail('That photograph could not be found.', 'not_found');
  }

  const parsedRow = rpcRowSchema.safeParse(payload);
  if (!parsedRow.success) {
    // The write went through but the reply is unreadable, so whether this was
    // an appreciation or its removal is genuinely unknown. Revalidate so the
    // next render carries the truth, and say so rather than guessing a state.
    const row = await readPhotographRow(supabase, parsedId.data);
    revalidate(row.slug, null);
    return fail(
      'Your appreciation was recorded, but the result could not be read back. Reload the page to see the current state.',
      'unknown',
    );
  }

  const { appreciated, ownerUsername } = parsedRow.data;
  let { count, slug } = parsedRow.data;

  if (count === null || slug === null) {
    const row = await readPhotographRow(supabase, parsedId.data);
    count = count ?? row.count;
    slug = slug ?? row.slug;
  }

  revalidate(slug, ownerUsername);

  if (count === null) {
    return fail(
      'Your appreciation was recorded, but the new total could not be read. Reload the page to see it.',
      'unknown',
    );
  }

  return ok({ appreciated, count });
}
