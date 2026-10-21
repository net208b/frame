'use server';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { fail, ok, NOT_CONFIGURED_MESSAGE, type ActionResult } from '@/lib/action-result';
import { getViewer, isAdmin } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Signing the admin in with a one-time code.
 *
 * Two steps, both narrow on purpose:
 *
 *  1. requestAdminCode — takes an email address and, if it belongs to an
 *     admin account, asks the identity service to send a code to it. It
 *     answers the same way whether or not it sent anything: an address that
 *     is not an admin's gets no email and no hint that it is not. No account
 *     is ever created here (`shouldCreateUser: false`).
 *
 *  2. verifyAdminCode — exchanges the code for a session, then checks that
 *     the session is an admin's. If it is not — the identity service would
 *     have signed in any account the code was for — the session is ended on
 *     the spot and the attempt refused.
 *
 * Who may use the console is decided by the account's role, not by an
 * address in this file. The repository is public, and an address written
 * into it would be too.
 */

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const codeSchema = z.string().trim().regex(/^\d{6}$/);

function bucketFor(email: string): string {
  return createHash('sha256').update(`frame:admin-otp:${email}`).digest('hex').slice(0, 24);
}

export async function requestAdminCode(input: { email: string }): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const parsed = emailSchema.safeParse(input.email);
  // A malformed address is refused plainly: it could not be anybody's.
  if (!parsed.success) return fail('Enter an email address.', 'validation');
  const email = parsed.data;

  // Per address and overall. The overall limit is what stops this form being
  // used to make the identity service send a stream of emails.
  const perAddress = await checkRateLimit(`admin-otp:${bucketFor(email)}`, 3, 10 * 60);
  const overall = await checkRateLimit('admin-otp:all', 20, 60 * 60);
  if (!perAddress.allowed || !overall.allowed) {
    return fail('Too many codes have been requested. Try again in a few minutes.', 'rate_limited');
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return fail(
      'The console cannot send codes until a service-role key is configured.',
      'not_configured',
    );
  }

  const { data: isStaff, error: lookupError } = await admin.rpc('admin_email_is_staff', {
    p_email: email,
  });
  if (lookupError) {
    console.error(`FRAME admin: checking an address failed — ${lookupError.message}`);
    return fail('That could not be checked. Try again in a moment.', 'unknown');
  }

  if (isStaff === true) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      console.error(`FRAME admin: sending a code failed — ${error.message}`);
      return fail('The code could not be sent. Try again in a moment.', 'unknown');
    }
  }

  // The same answer either way.
  return ok(undefined, 'If that address belongs to an admin, a code is on its way.');
}

export async function verifyAdminCode(input: {
  email: string;
  code: string;
}): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const email = emailSchema.safeParse(input.email);
  const code = codeSchema.safeParse(input.code);
  if (!email.success || !code.success) {
    return fail('Enter the six-digit code from the email.', 'validation');
  }

  const attempts = await checkRateLimit(`admin-otp-verify:${bucketFor(email.data)}`, 6, 10 * 60);
  if (!attempts.allowed) {
    return fail('Too many attempts. Request a new code in a few minutes.', 'rate_limited');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: email.data,
    token: code.data,
    type: 'email',
  });
  if (error) {
    return fail('That code is wrong or has expired. Request a new one.', 'unauthenticated');
  }

  // The code signs in whatever account it was issued to. Only an admin's
  // session may continue from here.
  const viewer = await getViewer();
  if (!isAdmin(viewer)) {
    await supabase.auth.signOut();
    return fail('This console is for the site administrator.', 'forbidden');
  }

  return ok(undefined, 'Signed in.');
}
