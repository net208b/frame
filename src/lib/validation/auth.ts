import { z } from 'zod';

import { validationCode } from './codes';
import { consent } from './fields';

/**
 * Account schemas.
 *
 * A username becomes a public URL (`/photographers/alice`), so it is lowercased
 * on the way in and checked against the route segments FRAME owns. Without that
 * check the first member to register `moderation` would shadow a real page, and
 * a member registering `admin` would be able to imply an authority they do not
 * have.
 *
 * MESSAGES. Every `error` here is a key, not a sentence: `validation.email.invalid`
 * rather than "Enter an email address…". The copy for each key lives under
 * `auth.validation` in `src/messages/{en,th}.json`, and the form resolves it
 * with its own translator — see `src/lib/validation/codes.ts` for why this
 * module emits codes rather than taking a translator, and for the pattern the
 * other validation modules follow. Nothing in the parsing path changed: these
 * strings travel through `parseForm` into `fieldErrors` exactly as sentences
 * did, and `useFieldErrors` in `src/components/auth/AuthStatus.tsx` turns them
 * into copy at the point of render.
 */

/**
 * Route segments this app serves, plus the handful of names that would let an
 * account imply it speaks for FRAME. Kept here rather than derived from the
 * router because a new page must be a deliberate decision about usernames too.
 *
 * Enforced three times, and the copies must be kept in step: here, for the
 * Join form and the username field in Settings; by `handle_new_user()` in
 * supabase/migrations/0009, for accounts whose username the trigger chooses —
 * those made through Google, Apple, Facebook or X, which never pass through
 * this schema; and by `is_reserved_username()` in 0010, which
 * `change_username()` calls. scripts/assert-reserved-usernames.mjs fails CI if
 * they differ.
 */
export const RESERVED_USERNAMES = [
  // Route segments.
  'api',
  'auth',
  'admin',
  'collections',
  'community',
  'discover',
  'join',
  'legal',
  'locations',
  'login',
  'map',
  'moderation',
  'photographers',
  'photographs',
  'search',
  'upload',
  // Names that would imply an authority the account does not have, or that
  // would collide with a page this app is likely to add.
  'frame',
  'help',
  'me',
  'moderator',
  'settings',
  'staff',
  'support',
] as const;

const reserved = new Set<string>(RESERVED_USERNAMES);

export const usernameSchema = z
  .string({ error: validationCode('username.required') })
  .trim()
  .toLowerCase()
  .min(3, { error: validationCode('username.min') })
  .max(24, { error: validationCode('username.max') })
  .regex(/^[a-z0-9_]+$/, {
    error: validationCode('username.charset'),
  })
  .refine((value) => !reserved.has(value), {
    error: validationCode('username.reserved'),
  });

export const emailSchema = z
  .string({ error: validationCode('email.required') })
  .trim()
  .toLowerCase()
  .max(254, { error: validationCode('email.tooLong') })
  .pipe(z.email({ error: validationCode('email.invalid') }));

/**
 * Supabase hashes with bcrypt, which ignores anything past 72 bytes and rejects
 * longer input outright, so the limit is stated here rather than discovered
 * after the form is submitted.
 */
export const passwordSchema = z
  .string({ error: validationCode('password.required') })
  .min(10, { error: validationCode('password.min') })
  .max(72, { error: validationCode('password.max') });

/**
 * Written out rather than built with `requiredText` from `./fields`, because
 * that helper composes its messages from an English label ("Display name is
 * required."). The primitives in `./fields` will take the same codes once their
 * owner converts them; until then a schema that needs a translated message
 * states its own rules. The behaviour is identical to
 * `requiredText({ label: 'Display name', max: 60 })`.
 */
export const displayNameSchema = z
  .string({ error: validationCode('displayName.required') })
  .trim()
  .min(1, { error: validationCode('displayName.required') })
  .max(60, { error: validationCode('displayName.max') });

export const signUpSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  acceptedTerms: consent(validationCode('terms.required')),
});

/**
 * Sign-in deliberately does not apply the password rules: an account created
 * before a rule changed must still be able to sign in and then change it.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: validationCode('password.enter') })
    .min(1, { error: validationCode('password.enter') }),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resendVerificationSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z
      .string({ error: validationCode('password.repeat') })
      .min(1, { error: validationCode('password.repeat') }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: validationCode('password.mismatch'),
    path: ['confirmPassword'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
