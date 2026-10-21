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
import { isDemoMode } from '@/lib/config';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';

/**
 * Marking notifications read.
 *
 * The only write a member makes to their own notifications, and the function
 * scopes it to the caller itself, so an id belonging to somebody else simply
 * matches no row. Nothing here can change what a notification said: a trigger
 * pins every column but `read_at`.
 */

const idsSchema = z.array(z.uuid('A notification id must be a UUID.')).min(1).max(200).nullable();

export async function markNotificationsRead(
  ids: string[] | null = null,
): Promise<ActionResult<{ marked: number }>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in first.', 'unauthenticated');

  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: parsed.data });

  if (error) {
    return fail('That could not be saved. Try again in a moment.', 'unknown');
  }

  revalidateLocalisedPath('/notifications');
  return ok({ marked: typeof data === 'number' ? data : 0 });
}
