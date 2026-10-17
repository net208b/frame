'use server';

import { createHash } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  fail,
  ok,
  NOT_CONFIGURED_MESSAGE,
  type ActionResult,
} from '@/lib/action-result';
import { isDemoMode, siteUrl } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { safeNextPath } from '@/lib/safe-redirect';
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
 * so each action refuses with `NOT_CONFIGURED_MESSAGE` and sets no cookie —
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
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/*
 * Nothing but async functions is exported from here. A "use server" module's
 * exports all become callable endpoints, so each form derives the state type
 * it needs from the action's own return type rather than importing an alias.
 */

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
async function enforceLimits(name: LimitName, key: string): Promise<ActionResult<never> | null> {
  for (const { seconds, max } of LIMITS[name]) {
    const verdict = await checkRateLimit(`auth:${name}:${seconds}s:${key}`, max, seconds);
    if (!verdict.allowed) return fail(retryMessage(verdict.retryAfterSeconds), 'rate_limited');
  }
  return null;
}

function retryMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, retryAfterSeconds);
  if (seconds <= 90) return `Too many attempts. Try again in ${seconds} seconds.`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 90) return `Too many attempts. Try again in ${minutes} minutes.`;

  const hours = Math.ceil(minutes / 60);
  return `Too many attempts. Try again in ${hours} hours.`;
}

/* ------------------------------------------------------------------------ */
/* Shared copy                                                               */
/* ------------------------------------------------------------------------ */

/**
 * One sentence for a wrong password and for an address with no account. The
 * two cases are indistinguishable on purpose: a different message for each
 * turns the sign-in form into a way to test whether somebody has an account.
 */
const SIGN_IN_REFUSED =
  'Those details do not match an account. Check the address and the password, then try again.';

const RESET_REQUESTED =
  'If that address has an account, a reset link is on its way. Check your inbox, and your spam folder.';

const VERIFICATION_RESENT =
  'If that address is waiting for confirmation, another link is on its way. Check your inbox, and your spam folder.';

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
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  // Validation runs before the rate limit here, unlike the usual order,
  // because the bucket is keyed on the submitted address and the address has
  // to be parsed and normalised before it can be hashed. Nothing is read or
  // written before the limit is applied.
  const parsed = parseForm(formData, signInSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email, password } = parsed.data;

  const limited = await enforceLimits('sign-in', emailBucketKey(email));
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
        return fail(
          'That address has not been confirmed yet. Open the link in the email we sent, or ask for another one from the confirmation page.',
          'forbidden',
        );
      case 'user_banned':
        return fail(
          'This account is suspended. Open the profile page while signed in to read the reason, or write to the moderators.',
          'forbidden',
        );
      case 'over_request_rate_limit':
        return fail(
          'The identity service is refusing further attempts for now. Wait a minute, then try again.',
          'rate_limited',
        );
      default:
        if (error.code !== 'invalid_credentials') {
          logProviderFailure('a sign-in', error.message, error.code);
        }
        return fail(SIGN_IN_REFUSED, 'unauthenticated');
    }
  }

  revalidateViewerPaths();

  // Validated here as well as in the page: the hidden field is as editable as
  // the query string it came from.
  redirect(safeNextPath(formData.get('next')));
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
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const parsed = parseForm(formData, signUpSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email, username, displayName, password } = parsed.data;

  const limited = await enforceLimits('sign-up', emailBucketKey(email));
  if (limited) return limited;

  const supabase = await createClient();

  if ((await isUsernameTaken(supabase, username)) === true) {
    return fail('That username is already taken.', 'conflict', {
      username: 'That username is already taken. Please choose another.',
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
        return fail('An account already exists for that address.', 'conflict', {
          email: 'An account already exists for that address. Sign in instead, or reset the password.',
        });
      case 'weak_password':
        return fail('That password was refused.', 'validation', {
          password:
            'That password was refused as too easy to guess. Try a longer one, or a few unrelated words.',
        });
      case 'email_address_invalid':
      case 'email_address_not_authorized':
        return fail('That address was refused.', 'validation', {
          email: 'The identity service refused that address. Try another one.',
        });
      case 'signup_disabled':
      case 'email_provider_disabled':
        return fail(
          'New accounts are not being accepted on this deployment at the moment.',
          'forbidden',
        );
      case 'over_email_send_rate_limit':
        return fail(
          'Too many confirmation emails have been sent from this deployment recently. Try again in a few minutes.',
          'rate_limited',
        );
      default:
        logProviderFailure('a sign-up', error.message, error.code);
        return fail('Your account could not be created. Try again in a few minutes.', 'unknown');
    }
  }

  // A project with email confirmation switched off returns a session here, so
  // the account is signed in whether or not this flow asked for that. The two
  // outcomes are reported apart because "check your email" would be false.
  if (data.session) {
    revalidateViewerPaths();
    return ok(
      { emailConfirmationRequired: false },
      'Your account is ready, and this browser is signed in. This deployment does not ask for email confirmation.',
    );
  }

  // Deliberately conditional: with confirmation switched on, the identity
  // service answers an address that already has an account exactly as it
  // answers a new one, so claiming an account was created would be a guess.
  return ok(
    { emailConfirmationRequired: true },
    'Check your email. If that address is not already registered, a confirmation link is on its way.',
  );
}

/* ------------------------------------------------------------------------ */
/* Forgotten password                                                        */
/* ------------------------------------------------------------------------ */

export async function requestPasswordReset(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const parsed = parseForm(formData, requestPasswordResetSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email } = parsed.data;

  const limited = await enforceLimits('password-reset', emailBucketKey(email));
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return fail(
        'Too many reset emails have been sent recently. Try again in a few minutes.',
        'rate_limited',
      );
    }
    logProviderFailure('a password reset request', error.message, error.code);
    return fail('The reset email could not be sent. Try again in a few minutes.', 'unknown');
  }

  // The identity service answers an unknown address the same way as a known
  // one, so this sentence is both the uniform answer and the truth.
  return ok<void>(undefined, RESET_REQUESTED);
}

/* ------------------------------------------------------------------------ */
/* New password                                                              */
/* ------------------------------------------------------------------------ */

export async function resetPassword(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

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
    return fail(
      'This form needs the recovery link from your email. Request a new link and open it in this browser.',
      'unauthenticated',
    );
  }

  const limited = await enforceLimits('password-change', auth.user.id);
  if (limited) return limited;

  // The length and match rules are enforced here, not only in the form: the
  // form is a convenience and this is the gate.
  const parsed = parseForm(formData, resetPasswordSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    switch (error.code) {
      case 'same_password':
        return fail('That is already your password.', 'validation', {
          password: 'That is already your password. Choose a different one.',
        });
      case 'weak_password':
        return fail('That password was refused.', 'validation', {
          password:
            'That password was refused as too easy to guess. Try a longer one, or a few unrelated words.',
        });
      case 'reauthentication_needed':
      case 'session_expired':
      case 'session_not_found':
        return fail(
          'That recovery link has expired. Request a new one and open it in this browser.',
          'unauthenticated',
        );
      default:
        logProviderFailure('a password change', error.message, error.code);
        return fail('Your password could not be changed. Try again in a few minutes.', 'unknown');
    }
  }

  revalidateViewerPaths();
  return ok<void>(undefined, 'Your password has been changed, and this browser is signed in.');
}

/* ------------------------------------------------------------------------ */
/* Resend a confirmation email                                               */
/* ------------------------------------------------------------------------ */

export async function resendVerification(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const parsed = parseForm(formData, resendVerificationSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { email } = parsed.data;

  const limited = await enforceLimits('resend-verification', emailBucketKey(email));
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return fail(
        'Too many confirmation emails have been sent recently. Try again in a few minutes.',
        'rate_limited',
      );
    }

    // An address with nothing pending — already confirmed, or never
    // registered — is refused as a validation failure. The sentence below is
    // conditional, so it stays true when its condition is false, and
    // answering differently here would disclose which case it was.
    if (error.code === 'validation_failed' || error.status === 422) {
      return ok<void>(undefined, VERIFICATION_RESENT);
    }

    logProviderFailure('a confirmation resend', error.message, error.code);
    return fail('The confirmation email could not be sent. Try again in a few minutes.', 'unknown');
  }

  return ok<void>(undefined, VERIFICATION_RESENT);
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
 */
export async function signOut(): Promise<ActionResult<void>> {
  if (isDemoMode()) {
    // There is no identity service and therefore no session to end. Saying so
    // is more honest than reporting a sign-out that never happened.
    return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');
  }

  const supabase = await createClient();
  // Local scope: signing out on a laptop should not sign the member out of
  // their phone. A compromised account is dealt with by changing the password,
  // which the identity service can be configured to revoke everything for.
  const { error } = await supabase.auth.signOut({ scope: 'local' });

  if (error) {
    logProviderFailure('a sign-out', error.message, error.code);
    return fail('Your session could not be ended. Try again in a moment.', 'unknown');
  }

  revalidateViewerPaths();
  return ok<void>(undefined, 'You are signed out.');
}
