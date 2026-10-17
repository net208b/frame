import { z } from 'zod';

import { consent, requiredText } from './fields';

/**
 * Account schemas.
 *
 * A username becomes a public URL (`/photographers/alice`), so it is lowercased
 * on the way in and checked against the route segments FRAME owns. Without that
 * check the first member to register `moderation` would shadow a real page, and
 * a member registering `admin` would be able to imply an authority they do not
 * have.
 */

/**
 * Route segments this app serves, plus the handful of names that would let an
 * account imply it speaks for FRAME. Kept here rather than derived from the
 * router because a new page must be a deliberate decision about usernames too.
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
  .string({ error: 'A username is required.' })
  .trim()
  .toLowerCase()
  .min(3, { error: 'A username needs at least 3 characters.' })
  .max(24, { error: 'A username must be 24 characters or fewer.' })
  .regex(/^[a-z0-9_]+$/, {
    error: 'A username may only use lowercase letters, numbers and underscores.',
  })
  .refine((value) => !reserved.has(value), {
    error: 'That username is reserved by FRAME. Please choose another.',
  });

export const emailSchema = z
  .string({ error: 'An email address is required.' })
  .trim()
  .toLowerCase()
  .max(254, { error: 'That email address is too long to be valid.' })
  .pipe(z.email({ error: 'Enter an email address in the form you@example.com.' }));

/**
 * Supabase hashes with bcrypt, which ignores anything past 72 bytes and rejects
 * longer input outright, so the limit is stated here rather than discovered
 * after the form is submitted.
 */
export const passwordSchema = z
  .string({ error: 'A password is required.' })
  .min(10, { error: 'A password needs at least 10 characters.' })
  .max(72, { error: 'A password must be 72 characters or fewer.' });

export const displayNameSchema = requiredText({ label: 'Display name', max: 60 });

export const signUpSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  acceptedTerms: consent(
    'Please confirm you accept the terms and the community guidelines before joining.',
  ),
});

/**
 * Sign-in deliberately does not apply the password rules: an account created
 * before a rule changed must still be able to sign in and then change it.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, { error: 'Enter your password.' }),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resendVerificationSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z
      .string({ error: 'Repeat the new password.' })
      .min(1, { error: 'Repeat the new password.' }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
