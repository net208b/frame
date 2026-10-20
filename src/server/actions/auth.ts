'use server';

import { createHash } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { fail, ok, type ActionResult } from '@/lib/action-result';
import { isDemoMode, siteUrl } from '@/lib/config';
import { enabledSignInProviders } from '@/lib/enabled-sign-in-providers';
import { checkRateLimit } from '@/lib/rate-limit';
import { safeNextPath } from '@/lib/safe-redirect';
import {
  isSignInProvider,
  PROVIDER_FLOW_COOKIE,
  PROVIDER_FLOW_COOKIE_PATH,
  PROVIDER_FLOW_MAX_AGE_SECONDS,
  SIGN_IN_PROVIDER_NAMES,
  writeProviderFlow,
} from '@/lib/sign-in-providers';
import { createClient } from '@/lib/supabase/server';
import { parseForm } from '@/lib/validation';
import {
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth';

/**
 * Account actions.
 *
 * Three commitments run through every function here.
 *
 * Nothing pretends. Without Supabase credentials there is no identity service,
 * so each action refuses with `actions.notConfigured` and sets no cookie —
 * a demo build must never hand out a session that does not exist.
 *
 * Nothing enumerates. A sign-in failure reads the same whether the password
 * was wrong or the address has never been seen, and a password-reset request
 * reports the same outcome either way. Where the identity service itself draws
 * a distinction we cannot hide (an unconfirmed address, for instance), the
 * comment says so rather than implying a guarantee the app cannot keep.
 *
 * Nothing overstates. A message is only returned once the write it describes
 * has actually happened, and where an outcome is conditional the sentence is
 * written conditionally.
 *
 * Each action takes the `(previousState, formData)` shape `useActionState`
 * expects, so the forms submit and report errors without JavaScript.
 *
 * LANGUAGE. Every sentence returned from here is read by a person, so each one
 * comes out of the `auth` namespace in the language the request is being served
 * in. The locale reaches this module through the header next-intl's middleware
 * puts on the request, which is present because an action posts to the page's
 * own locale-prefixed URL; if it ever were not, `src/i18n/request.ts` falls back
 * to English rather than throwing, so a missing header costs a translation and
 * never an action. The two non-enumerating sentences — `signInRefused` and
 * `resetRequested` — are written conditionally in both languages, and a
 * translation that narrowed either of them would be a disclosure, not a style
 * change. The only English left in this file is `logProviderFailure`, which is
 * written for whoever runs the deployment and never reaches a reader.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/*
 * Nothing but async functions is exported from here. A "use server" module's
 * exports all become callable endpoints, so each form derives the state type
 * it needs from the action's own return type rather than importing an alias.
 */

/** The `auth` messages for this request. Module-local, so it is not an endpoint. */
async function authMessages() {
  return getTranslations('auth');
}

type AuthMessages = Awaited<ReturnType<typeof authMessages>>;

/**
 * The result of the previous attempt, which `useActionState` passes back in as
 * the first argument. Every action ignores it: the outcome of the last submit
 * has no bearing on whether this one is allowed.
 */
type PreviousState = ActionResult<unknown> | null;

/* ------------------------------------------------------------------------ */
/* Abuse control                                                             */
/* ------------------------------------------------------------------------ */

interface LimitWindow {
  seconds: number;
  max: number;
}

/**
 * Limits for the endpoints that can be reached without a session. They are
 * loose enough for somebody who mistypes a password a few times and tight
 * enough that guessing one account's password is not worth starting, and the
 * mail-sending flows are tighter still because the cost of abuse there lands
 * in somebody else's inbox.
 */
const LIMITS = {
  'sign-in': [
    { seconds: 300, max: 8 },
    { seconds: 3600, max: 25 },
  ],
  'sign-up': [{ seconds: 3600, max: 5 }],
  'password-reset': [
    { seconds: 900, max: 3 },
    { seconds: 86_400, max: 8 },
  ],
  'resend-verification': [
    { seconds: 600, max: 2 },
    { seconds: 86_400, max: 6 },
  ],
  'password-change': [{ seconds: 3600, max: 5 }],
} as const satisfies Record<string, readonly LimitWindow[]>;

type LimitName = keyof typeof LIMITS;

/**
 * The key an attempt is counted against, derived from the submitted address.
 *
 * This is abuse control, not identity. The digest is here so that the limiter
 * table cannot be read as a list of addresses that tried to sign in, and
 * nothing in the app ever maps it back to a person. It is a deliberately
 * truncated SHA-256: enough to count attempts against one address, and not a
 * store of email addresses.
 */
function emailBucketKey(email: string): string {
  return createHash('sha256').update(`frame:auth:${email}`).digest('hex').slice(0, 24);
}

/**
 * Count one attempt against each window in turn.
 *
 * The window length is part of the bucket name because `check_rate_limit`
 * records a hit against whatever name it is handed: two windows sharing a name
 * would each count the other's attempts and neither limit would be the number
 * written here.
 */
async function enforceLimits(
  name: LimitName,
  key: string,
  t: AuthMessages,
): Promise<ActionResult<never> | null> {
  for (const { seconds, max } of LIMITS[name]) {
    const verdict = await checkRateLimit(`auth:${name}:${seconds}s:${key}`, max, seconds);
    if (!verdict.allowed) return fail(retryMessage(t, verdict.retryAfterSeconds), 'rate_limited');
  }
  return null;
}

/**
 * How long to wait, in the largest unit that still reads as a number.
 *
 * The unit is chosen here and the number is handed to ICU, so English gets its
 * singular and plural and Thai gets the one form it has — neither is assembled
 * by joining a number to a word in the component.
 */
function retryMessage(t: AuthMessages, retryAfterSeconds: number): string {
  const seconds = Math.max(1, retryAfterSeconds);
  if (seconds <= 90) return t('actions.retrySeconds', { count: seconds });

  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 90) return t('actions.retryMinutes', { count: minutes });

  const hours = Math.ceil(minutes / 60);
  return t('actions.retryHours', { count: hours });
}

/* ------------------------------------------------------------------------ */
/* Shared copy                                                               */
/* ------------------------------------------------------------------------ */

/*
 * One sentence for a wrong password and for an address with no account
 * (`actions.signInRefused`), and one outcome for a reset request whether or not
 * the address is known (`actions.resetRequested`). Both are deliberately
 * indistinguishable: a different message for each case turns a form into a way
 * to test whether somebody has an account. The same is true of
 * `actions.resendSent`.
 */

/** Logged for whoever runs the deployment; never shown to the member verbatim. */
function logProviderFailure(operation: string, message: string, code?: string): void {
  console.error(`FRAME auth: ${operation} failed — ${message}${code ? ` (${code})` : ''}`);
}

/**
 * Paths whose rendering depends on who is reading.
 *
 * The header greets the member from the root layout, so a session change makes
 * the whole tree stale rather than one page.
 */
function revalidateViewerPaths(): void {
  revalidatePath('/', 'layout');
}

/* ------------------------------------------------------------------------ */
/* Sign in                                                                   */
/* ------------------------------------------------------------------------ */

export async function signIn(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await authMessages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  // Validation runs before the rate limit here, unlike the usual order,
  // because the bucket is keyed on the submitted address and the address has
  // to be parsed and normalised before it can be hashed. Nothing is read or
  // written before the limit is applied.
  const parsed = parseForm(formData, signInSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email, password } = parsed.data;

  const limited = await enforceLimits('sign-in', emailBucketKey(email), t);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    switch (error.code) {
      case 'email_not_confirmed':
        // This does say that the address is registered. The identity service
        // answers an unconfirmed sign-in with its own distinct error, so the
        // distinction is already observable; leaving the member with the
        // generic refusal would strand them with no way to work out why.
        return fail(t('actions.signInUnconfirmed'), 'forbidden');
      case 'user_banned':
        return fail(t('actions.signInSuspended'), 'forbidden');
      case 'over_request_rate_limit':
        return fail(t('actions.signInProviderRate'), 'rate_limited');
      default:
        if (error.code !== 'invalid_credentials') {
          logProviderFailure('a sign-in', error.message, error.code);
        }
        return fail(t('actions.signInRefused'), 'unauthenticated');
    }
  }

  revalidateViewerPaths();

  // Validated here as well as in the page: the hidden field is as editable as
  // the query string it came from.
  redirect(safeNextPath(formData.get('next')));
}

/* ------------------------------------------------------------------------ */
/* Sign in with another account                                              */
/* ------------------------------------------------------------------------ */

/**
 * Send the member to Google, Apple, Facebook or X, and back to /auth/callback.
 *
 * One action serves signing in and joining alike: the provider decides which it
 * was, and the identity service creates the account on first use, at which
 * point `handle_new_user()` gives it a profile like any other. That is why the
 * buttons carry the same consent sentence on both pages.
 *
 * There is no rate limit here, unlike every other action in this file, because
 * there is nothing to limit. Building the provider's URL makes no request — the
 * client derives it locally — and writes nothing but two cookies to the
 * caller's own browser. The step that does work, exchanging the returned code
 * for a session, happens in /auth/callback against the identity service, which
 * limits it itself.
 */
export async function signInWithProvider(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await authMessages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const provider = formData.get('provider');
  if (!isSignInProvider(provider)) return fail(t('actions.providerUnknown'), 'validation');

  const name = SIGN_IN_PROVIDER_NAMES[provider];

  // Asked again rather than trusted from the page, which may have been rendered
  // before somebody switched the provider off.
  if (!(await enabledSignInProviders()).includes(provider)) {
    return fail(t('actions.providerUnavailable', { provider: name }), 'forbidden');
  }

  const next = safeNextPath(formData.get('next'));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // The bare callback, matched exactly by the redirect allow-list. The
      // destination travels in the marker cookie instead — see
      // PROVIDER_FLOW_COOKIE for why it is kept out of this URL.
      redirectTo: `${siteUrl()}/auth/callback`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    logProviderFailure(
      `starting a ${name} sign-in`,
      error?.message ?? 'no authorisation URL was returned',
      error?.code,
    );
    return fail(t('actions.providerFailed', { provider: name }), 'unknown');
  }

  const cookieStore = await cookies();
  cookieStore.set(PROVIDER_FLOW_COOKIE, writeProviderFlow({ provider, next }), {
    httpOnly: true,
    // Lax, not strict: the request that reads it is a top-level navigation
    // arriving from the identity service's domain, which a strict cookie
    // would not accompany.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: PROVIDER_FLOW_COOKIE_PATH,
    maxAge: PROVIDER_FLOW_MAX_AGE_SECONDS,
  });

  redirect(data.url);
}

/* ------------------------------------------------------------------------ */
/* Join                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Is this handle already somebody's?
 *
 * `handle_new_user()` adds a random suffix to a username that is taken rather
 * than failing the signup, so without this check a member would be told they
 * had joined as the handle they asked for and find a different one on their
 * profile. Reading it is not a disclosure: a username is a public URL.
 *
 * `null` means the question could not be answered, in which case the signup
 * goes ahead — the trigger still produces a valid account. A suspended
 * profile is invisible to this read, so its handle can look free and come back
 * suffixed; the message below is written for that too.
 */
async function isUsernameTaken(supabase: ServerClient, username: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    logProviderFailure('a username availability check', error.message, error.code);
    return null;
  }
  return data !== null;
}

export async function signUp(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<{ emailConfirmationRequired: boolean }>> {
  const t = await authMessages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const parsed = parseForm(formData, signUpSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email, username, displayName, password } = parsed.data;

  const limited = await enforceLimits('sign-up', emailBucketKey(email), t);
  if (limited) return limited;

  const supabase = await createClient();

  if ((await isUsernameTaken(supabase, username)) === true) {
    return fail(t('actions.signUpUsernameTaken'), 'conflict', {
      username: t('actions.signUpUsernameTakenField'),
    });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by handle_new_user() in supabase/migrations/0006, which is the
      // only writer of the profiles table. The role is not passed and could
      // not be honoured if it were: the trigger always creates a member.
      data: { username, display_name: displayName },
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    switch (error.code) {
      case 'user_already_exists':
      case 'email_exists':
        // The identity service only answers this way when email confirmation
        // is switched off, a configuration in which sign-in already discloses
        // the same thing. Saying it plainly is then more use than a hint.
        return fail(t('actions.signUpEmailExists'), 'conflict', {
          email: t('actions.signUpEmailExistsField'),
        });
      case 'weak_password':
        return fail(t('actions.signUpWeakPassword'), 'validation', {
          password: t('actions.signUpWeakPasswordField'),
        });
      case 'email_address_invalid':
      case 'email_address_not_authorized':
        return fail(t('actions.signUpAddressRefused'), 'validation', {
          email: t('actions.signUpAddressRefusedField'),
        });
      case 'signup_disabled':
      case 'email_provider_disabled':
        return fail(t('actions.signUpDisabled'), 'forbidden');
      case 'over_email_send_rate_limit':
        return fail(t('actions.signUpEmailRate'), 'rate_limited');
      default:
        logProviderFailure('a sign-up', error.message, error.code);
        return fail(t('actions.signUpFailed'), 'unknown');
    }
  }

  // A project with email confirmation switched off returns a session here, so
  // the account is signed in whether or not this flow asked for that. The two
  // outcomes are reported apart because "check your email" would be false.
  if (data.session) {
    revalidateViewerPaths();
    return ok({ emailConfirmationRequired: false }, t('actions.signUpReady'));
  }

  // Deliberately conditional: with confirmation switched on, the identity
  // service answers an address that already has an account exactly as it
  // answers a new one, so claiming an account was created would be a guess.
  return ok({ emailConfirmationRequired: true }, t('actions.signUpCheckEmail'));
}

/* ------------------------------------------------------------------------ */
/* Forgotten password                                                        */
/* ------------------------------------------------------------------------ */

export async function requestPasswordReset(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await authMessages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const parsed = parseForm(formData, requestPasswordResetSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email } = parsed.data;

  const limited = await enforceLimits('password-reset', emailBucketKey(email), t);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return fail(t('actions.resetEmailRate'), 'rate_limited');
    }
    logProviderFailure('a password reset request', error.message, error.code);
    return fail(t('actions.resetSendFailed'), 'unknown');
  }

  // The identity service answers an unknown address the same way as a known
  // one, so this sentence is both the uniform answer and the truth.
  return ok<void>(undefined, t('actions.resetRequested'));
}

/* ------------------------------------------------------------------------ */
/* New password                                                              */
/* ------------------------------------------------------------------------ */

export async function resetPassword(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await authMessages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  // A recovery link creates a real session, and that session is the only proof
  // of ownership this form has. Without one there is nothing to change.
  //
  // A suspension is deliberately not a bar here. Suspension stops an account
  // contributing to the community, and a password is not a contribution:
  // locking somebody out of their own credentials while their work is under
  // review would leave them unable to read the reason or to appeal it.
  const supabase = await createClient();
  const { data: auth, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !auth.user) {
    return fail(t('actions.passwordNeedsLink'), 'unauthenticated');
  }

  const limited = await enforceLimits('password-change', auth.user.id, t);
  if (limited) return limited;

  // The length and match rules are enforced here, not only in the form: the
  // form is a convenience and this is the gate.
  const parsed = parseForm(formData, resetPasswordSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    switch (error.code) {
      case 'same_password':
        return fail(t('actions.passwordSame'), 'validation', {
          password: t('actions.passwordSameField'),
        });
      case 'weak_password':
        return fail(t('actions.passwordWeak'), 'validation', {
          password: t('actions.passwordWeakField'),
        });
      case 'reauthentication_needed':
      case 'session_expired':
      case 'session_not_found':
        return fail(t('actions.passwordLinkExpired'), 'unauthenticated');
      default:
        logProviderFailure('a password change', error.message, error.code);
        return fail(t('actions.passwordFailed'), 'unknown');
    }
  }

  revalidateViewerPaths();
  return ok<void>(undefined, t('actions.passwordChanged'));
}

/* ------------------------------------------------------------------------ */
/* Resend a confirmation email                                               */
/* ------------------------------------------------------------------------ */

export async function resendVerification(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await authMessages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const parsed = parseForm(formData, resendVerificationSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email } = parsed.data;

  const limited = await enforceLimits('resend-verification', emailBucketKey(email), t);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return fail(t('actions.resendEmailRate'), 'rate_limited');
    }

    // An address with nothing pending — already confirmed, or never
    // registered — is refused as a validation failure. The sentence below is
    // conditional, so it stays true when its condition is false, and
    // answering differently here would disclose which case it was.
    if (error.code === 'validation_failed' || error.status === 422) {
      return ok<void>(undefined, t('actions.resendSent'));
    }

    logProviderFailure('a confirmation resend', error.message, error.code);
    return fail(t('actions.resendFailed'), 'unknown');
  }

  return ok<void>(undefined, t('actions.resendSent'));
}

/* ------------------------------------------------------------------------ */
/* Sign out                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * End this browser's session.
 *
 * Called by the POST-only `/auth/signout` route, which is what the header's
 * sign-out form submits to. Kept here so the whole account surface has one
 * owner, and so a future client caller gets the same result contract.
 *
 * That route reads `ok` and `code` and discards the sentence, so these two
 * messages are currently never displayed. They are translated anyway, because
 * the next caller will be a form that shows them.
 */
export async function signOut(): Promise<ActionResult<void>> {
  const t = await authMessages();

  if (isDemoMode()) {
    // There is no identity service and therefore no session to end. Saying so
    // is more honest than reporting a sign-out that never happened.
    return fail(t('actions.notConfigured'), 'not_configured');
  }

  const supabase = await createClient();
  // Local scope: signing out on a laptop should not sign the member out of
  // their phone. A compromised account is dealt with by changing the password,
  // which the identity service can be configured to revoke everything for.
  const { error } = await supabase.auth.signOut({ scope: 'local' });

  if (error) {
    logProviderFailure('a sign-out', error.message, error.code);
    return fail(t('actions.signOutFailed'), 'unknown');
  }

  revalidateViewerPaths();
  return ok<void>(undefined, t('actions.signOutDone'));
}
