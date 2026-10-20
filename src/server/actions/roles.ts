'use server';

import { z } from 'zod';

import { fail, NOT_CONFIGURED_MESSAGE, ok, type ActionResult } from '@/lib/action-result';
import { getViewer, getViewerSuspension, isAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { parseForm } from '@/lib/validation';

/**
 * Appointing and removing staff.
 *
 * The rules live in set_member_role() (migration 0012): administrators only,
 * never your own role, never a suspended account, and every change written to
 * the moderation trail. This action checks the role first only so that a
 * member who finds the endpoint is refused with the same sentence a moderator
 * gets, without a round trip; the database decides either way.
 */

const STAFF_ROLES = ['member', 'moderator', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const setRoleSchema = z.object({
  username: z
    .string({ error: 'Type the member’s username.' })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, { error: 'A username is 3 to 24 lowercase letters, digits or underscores.' }),
  role: z.enum(STAFF_ROLES, { error: 'Choose member, moderator or administrator.' }),
});

const NOT_AN_ADMIN = 'Only an administrator can appoint or remove moderators and administrators.';

export async function setMemberRole(input: unknown): Promise<ActionResult<{ role: StaffRole }>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const [viewer, suspension] = await Promise.all([getViewer(), getViewerSuspension()]);
  if (!viewer) return fail('Sign in as an administrator to change a role.', 'unauthenticated');
  if (suspension?.isSuspended || !isAdmin(viewer)) return fail(NOT_AN_ADMIN, 'forbidden');

  const parsed = parseForm(input, setRoleSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);
  const { username, role } = parsed.data;

  if (username === viewer.username) {
    return fail('You cannot change your own role. Ask another administrator.', 'forbidden', {
      username: 'You cannot change your own role.',
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_member_role', { p_username: username, p_role: role });

  if (error) {
    // The database's own sentences are written for a reader, so they pass
    // through; only the codes decide which kind of refusal this is.
    switch (error.code) {
      case 'P0002':
        return fail(error.message, 'not_found', { username: error.message });
      case '22023':
        return fail(error.message, 'validation');
      case '42501':
        return fail(error.message, 'forbidden');
      default:
        console.error(`FRAME roles: set_member_role failed — ${error.code ?? '?'} ${error.message}`);
        return fail('The role could not be changed. Nothing was changed, so you can try again.', 'unknown');
    }
  }

  revalidateLocalisedPath('/moderation');
  revalidateLocalisedPath(`/photographers/${username}`);

  const label = role === 'admin' ? 'an administrator' : role === 'moderator' ? 'a moderator' : 'a member';
  return ok({ role: (data as StaffRole | null) ?? role }, `@${username} is now ${label}.`);
}
