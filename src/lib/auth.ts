import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { isDemoMode } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRole } from '@/types/domain';

/**
 * Who is reading, and what they are allowed to do.
 *
 * Three commitments live here:
 *
 * - Identity comes from the Supabase session on every request, never from a
 *   cookie the client could write or a value passed in from a component.
 * - Authorisation is decided on the server each time. Hiding a button is a
 *   courtesy to the reader, not a permission check.
 * - In demo mode there is no session to read, so there is no viewer. Every
 *   write path refuses with `NOT_CONFIGURED_MESSAGE` rather than pretending.
 */

export interface Viewer {
  id: string;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: ProfileRole;
}

export interface ViewerSuspension {
  isSuspended: boolean;
  /** Shown to the member so a suspension is never silent. */
  reason: string | null;
}

interface SessionState {
  viewer: Viewer;
  suspension: ViewerSuspension;
}

const ROLES: readonly ProfileRole[] = ['member', 'moderator', 'admin'];

/** Anything unrecognised falls back to the least privileged role. */
function toRole(value: unknown): ProfileRole {
  return ROLES.find((role) => role === value) ?? 'member';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Read the session and its profile row once per request.
 *
 * `cache` keeps a page that asks for the viewer in a layout, a header and a
 * repository call from making three round trips for the same answer.
 */
const loadSession = cache(async (): Promise<SessionState | null> => {
  if (isDemoMode()) return null;

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, role, is_suspended, suspended_reason')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`FRAME auth: reading the viewer profile failed — ${profileError.message}`);
  }

  // A signed-in account with no profile row is mid-signup or mid-deletion.
  // Inventing a display name here would put a fabricated member in the UI, so
  // the viewer is treated as signed out until the row exists.
  if (!profile) return null;

  const row = profile as {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: string | null;
    is_suspended: boolean | null;
    suspended_reason: string | null;
  };

  const username = text(row.username);
  if (!username) return null;

  return {
    viewer: {
      id: row.id,
      email: text(auth.user.email),
      username,
      displayName: text(row.display_name) ?? username,
      avatarUrl: text(row.avatar_url),
      role: toRole(row.role),
    },
    suspension: {
      isSuspended: row.is_suspended === true,
      reason: text(row.suspended_reason),
    },
  };
});

/**
 * The signed-in member, or null when signed out or in demo mode.
 *
 * A suspended member is still returned, because the pages they can still reach
 * need to greet them and explain the suspension. Write paths must treat a
 * suspension as signed out — see {@link getViewerSuspension}.
 */
export async function getViewer(): Promise<Viewer | null> {
  const session = await loadSession();
  return session?.viewer ?? null;
}

/**
 * The suspension state of the signed-in member, or null when there is nobody
 * signed in. Every write path checks this before it writes, and any page that
 * would otherwise show a disabled control uses it to say why.
 */
export async function getViewerSuspension(): Promise<ViewerSuspension | null> {
  const session = await loadSession();
  return session?.suspension ?? null;
}

/**
 * Require a signed-in member, sending a visitor to sign in first.
 *
 * `nextPath` is the path to return to afterwards. It is omitted rather than
 * guessed when the caller does not supply one, because a wrong return path is
 * worse than landing on the home page.
 */
export async function requireViewer(nextPath?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer) return viewer;

  const destination = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';
  redirect(destination);
}

/**
 * Require a moderator.
 *
 * This answers with `notFound()` rather than a redirect or a 403 so that a
 * probe cannot tell a moderation route from a route that does not exist. A
 * suspended account is refused whatever its role.
 */
export async function requireModerator(): Promise<Viewer> {
  const session = await loadSession();
  if (!session || session.suspension.isSuspended || !isModerator(session.viewer)) {
    notFound();
  }
  return session.viewer;
}

export function isModerator(viewer: Viewer | null): boolean {
  return viewer?.role === 'moderator' || viewer?.role === 'admin';
}
