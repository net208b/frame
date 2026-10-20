'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { DEFAULT_LOCALE, isLocale, withLocalePrefix } from '@/i18n/locales';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { isDemoMode } from '@/lib/config';
import { storageKeys } from '@/lib/images/variants';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { storageDriver } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { parseForm } from '@/lib/validation';
import {
  changeUsernameSchema,
  deleteAccountSchema,
  profileSchema,
} from '@/lib/validation/account';

/**
 * Settings actions: edit the profile, change a provider-chosen username once,
 * delete the account.
 *
 * The same commitments as the auth actions hold here. Nothing pretends — in
 * demo mode every action refuses. Nothing overstates — a sentence is returned
 * only once the write it describes has happened. And none of these trusts the
 * form: the database refuses a username change, a malformed website or an
 * unconfirmed deletion on its own (migration 0011), so a request that skips
 * this file is refused as firmly as one that goes through it. What this file
 * adds is the sentences, the rate limits, and removing image files, which the
 * database cannot do.
 */

type PreviousState = ActionResult<unknown> | null;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Per account, per window. Loose for editing, tight for the irreversible. */
const LIMITS = {
  'profile-update': { seconds: 3600, max: 30 },
  'username-change': { seconds: 3600, max: 10 },
  'account-delete': { seconds: 3600, max: 5 },
} as const;

/** Supabase removes up to a thousand objects a call; well under it. */
const REMOVE_BATCH = 500;
/** And returns at most a thousand rows a query. */
const PAGE = 1000;

async function messages() {
  return getTranslations('account');
}

function log(operation: string, message: string, code?: string): void {
  console.error(`FRAME settings: ${operation} failed — ${message}${code ? ` (${code})` : ''}`);
}

async function limit(
  name: keyof typeof LIMITS,
  userId: string,
): Promise<ActionResult<never> | null> {
  const { seconds, max } = LIMITS[name];
  const verdict = await checkRateLimit(`account:${name}:${seconds}s:${userId}`, max, seconds);
  if (verdict.allowed) return null;

  const auth = await getTranslations('auth');
  const wait = Math.max(1, verdict.retryAfterSeconds);
  const sentence =
    wait <= 90
      ? auth('actions.retrySeconds', { count: wait })
      : auth('actions.retryMinutes', { count: Math.ceil(wait / 60) });
  return fail(sentence, 'rate_limited');
}

/**
 * The signed-in member and whether they are suspended, read fresh: a page
 * rendered before a suspension must not be able to post past it.
 */
async function signedIn(
  supabase: SupabaseClient,
): Promise<{ id: string; username: string; isSuspended: boolean } | null> {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;

  const { data: row, error: rowError } = await supabase
    .from('profiles')
    .select('username, is_suspended')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (rowError) {
    log('reading the signed-in profile', rowError.message, rowError.code);
    return null;
  }
  if (!row) return null;

  const profile = row as { username: string; is_suspended: boolean };
  return { id: auth.user.id, username: profile.username, isSuspended: profile.is_suspended };
}

/**
 * The profile page shows what changed, in every language, and so does the
 * header, which greets the member by display name from the root layout.
 */
function revalidateProfile(...usernames: string[]): void {
  revalidatePath('/', 'layout');
  for (const username of usernames) revalidateLocalisedPath(`/photographers/${username}`);
}

/* ------------------------------------------------------------------------ */
/* Profile                                                                   */
/* ------------------------------------------------------------------------ */

export async function updateProfile(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await messages();
  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const supabase = await createClient();
  const member = await signedIn(supabase);
  if (!member) return fail(t('actions.signedOut'), 'unauthenticated');
  // A suspended member keeps read access to explain the suspension, but a
  // profile edit is how a suspended account would quietly change what the
  // moderators were looking at.
  if (member.isSuspended) return fail(t('actions.suspended'), 'forbidden');

  const parsed = parseForm(formData, profileSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const limited = await limit('profile-update', member.id);
  if (limited) return limited;

  const {
    displayName,
    biography,
    basedIn,
    countryCode,
    website,
    socialLinks,
    styles,
    collaboration,
    critique,
    coverPhotographId,
    gear,
  } = parsed.data;
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      biography,
      based_in: basedIn,
      country_code: countryCode,
      website,
      social_links: socialLinks,
      style_tags: styles,
      collaboration_status: collaboration,
      critique_preference: critique,
      cover_photograph_id: coverPhotographId,
      usual_gear: gear,
    })
    .eq('id', member.id);

  if (error) {
    log('saving a profile', error.message, error.code);
    // 42501 is the cover trigger (0017): the chosen photograph is not this
    // member's own published one. That is a real thing a form can get wrong —
    // the frame was unpublished in another tab — so it has its own sentence.
    if (error.code === '42501') {
      return fail(t('actions.coverRefused'), 'validation', {
        coverPhotographId: t('actions.coverRefused'),
      });
    }

    // 23514 is a check constraint. The schema above is written to refuse
    // everything they refuse first, so this means the two have drifted apart.
    return fail(
      error.code === '23514' ? t('actions.profileRefused') : t('actions.profileFailed'),
      error.code === '23514' ? 'validation' : 'unknown',
    );
  }

  revalidateProfile(member.username);
  return ok(undefined, t('actions.profileSaved'));
}

/* ------------------------------------------------------------------------ */
/* Username                                                                  */
/* ------------------------------------------------------------------------ */

export async function changeUsername(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<{ username: string }>> {
  const t = await messages();
  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const supabase = await createClient();
  const member = await signedIn(supabase);
  if (!member) return fail(t('actions.signedOut'), 'unauthenticated');

  const parsed = parseForm(formData, changeUsernameSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const limited = await limit('username-change', member.id);
  if (limited) return limited;

  // change_username() decides whether this account may change at all, and
  // refuses reserved and taken names itself. The SQLSTATE says which.
  const { data, error } = await supabase.rpc('change_username', {
    p_username: parsed.data.username,
  });

  if (error) {
    switch (error.code) {
      case '23505':
        return fail(t('actions.usernameTaken'), 'conflict', {
          username: t('actions.usernameTakenField'),
        });
      case '23514':
        return fail(t('actions.usernameReserved'), 'validation', {
          username: t('actions.usernameReservedField'),
        });
      case '22023':
        return fail(t('actions.usernameInvalid'), 'validation', {
          username: t('actions.usernameInvalidField'),
        });
      case '42501':
        return fail(t('actions.usernameNotAllowed'), 'forbidden');
      default:
        log('changing a username', error.message, error.code);
        return fail(t('actions.usernameFailed'), 'unknown');
    }
  }

  const username = typeof data === 'string' ? data : parsed.data.username;
  revalidateProfile(member.username, username);
  return ok({ username }, t('actions.usernameChanged', { username }));
}

/* ------------------------------------------------------------------------ */
/* Delete the account                                                        */
/* ------------------------------------------------------------------------ */

/**
 * The storage keys of every photograph the member owns, in any state.
 *
 * Drafts and photographs a moderator removed included: their files may still
 * be in storage, and they are the member's. RLS lets an owner read all of
 * their own rows, which is what makes this list complete.
 */
async function ownImageKeys(supabase: SupabaseClient, ownerId: string): Promise<string[] | null> {
  const keys: string[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('photographs')
      .select('id')
      .eq('owner_id', ownerId)
      .order('id')
      .range(from, from + PAGE - 1);

    if (error) {
      log('listing photographs to delete', error.message, error.code);
      return null;
    }

    for (const row of (data ?? []) as { id: string }[]) {
      keys.push(...Object.values(storageKeys(row.id, ownerId)));
    }
    if (!data || data.length < PAGE) return keys;
  }
}

/**
 * Delete the account, as the privacy notice describes.
 *
 * Image files go first, then the database, because the two cannot share a
 * transaction and the order decides what a failure leaves behind. Files first:
 * if the database step then fails, the account is intact with broken images and
 * the member can press the button again. Database first would leave the
 * opposite — no account, and the photographs still publicly reachable at their
 * old addresses with nothing left that points at them.
 *
 * The database step is `delete_own_account()`, which either deletes the account
 * outright or, where it authored moderation decisions, keeps a stripped and
 * closed one; it says which, and the member is told which.
 */
export async function deleteAccount(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await messages();
  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const supabase = await createClient();
  const member = await signedIn(supabase);
  if (!member) return fail(t('actions.signedOut'), 'unauthenticated');

  const parsed = parseForm(formData, deleteAccountSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  // Checked again by the database, which is the check that counts.
  if (parsed.data.confirmUsername !== member.username.toLowerCase()) {
    return fail(t('actions.deleteConfirmMismatch'), 'validation', {
      confirmUsername: t('actions.deleteConfirmMismatchField', { username: member.username }),
    });
  }

  const limited = await limit('account-delete', member.id);
  if (limited) return limited;

  const keys = await ownImageKeys(supabase, member.id);
  if (keys === null) return fail(t('actions.deleteFailed'), 'unknown');

  try {
    const driver = storageDriver();
    for (let i = 0; i < keys.length; i += REMOVE_BATCH) {
      await driver.remove(keys.slice(i, i + REMOVE_BATCH));
    }
  } catch (error) {
    log('removing image files', error instanceof Error ? error.message : String(error));
    return fail(t('actions.deleteFilesFailed'), 'unknown');
  }

  const { data, error } = await supabase.rpc('delete_own_account', {
    p_confirm_username: parsed.data.confirmUsername,
  });

  if (error) {
    log('deleting an account', error.message, error.code);
    // The image files are already gone by this point, so the sentence has to
    // say so: "nothing was removed" would be untrue. Pressing the button again
    // finishes the job, because removing files that are not there is a no-op.
    return fail(t('actions.deleteRecordsFailed'), 'unknown');
  }

  // The account is gone or closed either way, so the session in these cookies
  // names somebody who can no longer act. `local` clears them without asking
  // the identity service about a user it has just deleted.
  await supabase.auth.signOut({ scope: 'local' });
  revalidatePath('/', 'layout');

  const requested = await getLocale();
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  const outcome = data === 'retained' ? 'account_closed' : 'account_deleted';
  redirect(withLocalePrefix(`/login?error=${outcome}`, locale));
}
