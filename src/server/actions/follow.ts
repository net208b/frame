'use server';

import { z } from 'zod';

import {
  fail,
  failFromZod,
  ok,
  NOT_CONFIGURED_MESSAGE,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer } from '@/lib/auth';
import { FOLLOW_POLICY, isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';

/**
 * Following a photographer.
 *
 * One row per pair, reversible, and the counts never come from a number the
 * browser supplied: the insert, the delete and both denormalised totals move
 * together inside `toggle_follow`. The primary key on (follower_id,
 * followee_id) is what actually prevents a double follow — not the state of a
 * button — and the function refuses a self-follow and a suspended account on
 * its own.
 */

const profileIdSchema = z.uuid('A photographer id must be a UUID.');

const rpcRowSchema = z
  .object({
    following: z.boolean(),
    follower_count: z.number().int().nonnegative().nullish(),
  })
  .transform((row) => ({ following: row.following, followerCount: row.follower_count ?? null }));

export async function toggleFollow(
  profileId: string,
): Promise<ActionResult<{ following: boolean; followerCount: number }>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in to follow a photographer.', 'unauthenticated');

  const parsed = profileIdSchema.safeParse(profileId);
  if (!parsed.success) return failFromZod(parsed.error);

  if (parsed.data === viewer.id) {
    return fail('You cannot follow your own work.', 'validation');
  }

  const bucket = `follow:${viewer.id}`;
  const perMinute = await checkRateLimit(bucket, FOLLOW_POLICY.maxPerMinute, 60);
  if (!perMinute.allowed) {
    return fail(
      `That is a lot of following in one minute. Try again in ${perMinute.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }
  const perHour = await checkRateLimit(bucket, FOLLOW_POLICY.maxPerHour, 3600);
  if (!perHour.allowed) {
    return fail(
      `You have reached the hourly limit. Try again in ${perHour.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('toggle_follow', { p_profile_id: parsed.data });

  if (error) {
    if (error.code === '42501') {
      return fail('Your account cannot follow at the moment.', 'forbidden');
    }
    if (error.code === 'P0002') {
      return fail('That photographer could not be found.', 'not_found');
    }
    return fail('That could not be saved. Try again in a moment.', 'unknown');
  }

  const payload = Array.isArray(data) ? data.at(0) : data;
  const parsedRow = rpcRowSchema.safeParse(payload);
  if (!parsedRow.success || parsedRow.data.followerCount === null) {
    // The write went through but the reply is unreadable, so whether this was
    // a follow or its removal is genuinely unknown. Say so rather than guess.
    return fail(
      'That was saved, but the result could not be read back. Reload the page to see it.',
      'unknown',
    );
  }

  revalidateLocalisedPath('/feed');
  return ok({ following: parsedRow.data.following, followerCount: parsedRow.data.followerCount });
}
