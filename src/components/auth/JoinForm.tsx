'use client';

import { ArrowRight, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { fieldError, FormStatus, FormSuccess } from '@/components/auth/AuthStatus';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { signUp } from '@/server/actions/auth';

/**
 * Create an account.
 *
 * The rules are stated beside the fields rather than sprung afterwards: the
 * password length, the username charset, and the fact that the username
 * becomes a public address this build cannot change.
 *
 * Joining does not sign anybody in. The account exists once the address is
 * confirmed, so the panel below reports what was actually sent rather than
 * welcoming somebody who has not finished yet.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof signUp>> | null;

export function JoinForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signUp, null);
  const joined = state?.ok === true;

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess
            title={state.data.emailConfirmationRequired ? 'Confirmation sent' : 'Account ready'}
            icon={<MailCheck className="size-4 shrink-0" aria-hidden />}
          >
            <p>{state.message}</p>

            {state.data.emailConfirmationRequired ? (
              <p className="mt-3">
                Nothing arrived?{' '}
                <Link
                  href="/verify-email"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  Ask for another link
                </Link>
                .
              </p>
            ) : (
              <p className="mt-3">
                <Link
                  href="/discover"
                  className="inline-flex items-center gap-1.5 font-semibold text-ink underline underline-offset-2"
                >
                  Start exploring
                  <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                </Link>
              </p>
            )}
          </FormSuccess>
        ) : null}
      </FormStatus>

      {joined ? null : (
        <>
          <TextField
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            hint="Used for the confirmation link and for account notices. It is never shown on your profile."
            error={fieldError(state, 'email')}
          />

          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            required
            hint="Three to 24 characters: lowercase letters, numbers and underscores. This is public — it becomes the address of your profile — and FRAME has no way to change it yet, so choose one you will still want next year."
            error={fieldError(state, 'username')}
          />

          <TextField
            label="Display name"
            name="displayName"
            autoComplete="name"
            maxLength={60}
            required
            hint="The name shown beside your photographs."
            error={fieldError(state, 'displayName')}
          />

          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            minLength={10}
            required
            hint="At least 10 characters. Three or four unrelated words are easier to remember and harder to guess than one word with symbols in it."
            error={fieldError(state, 'password')}
          />

          <CheckboxField
            name="acceptedTerms"
            required
            label={
              <>
                I accept the{' '}
                <Link href="/legal/terms" className="font-semibold text-ink underline underline-offset-2">
                  terms
                </Link>{' '}
                and the{' '}
                <Link
                  href="/legal/guidelines"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  community guidelines
                </Link>
                .
              </>
            }
            description={
              <>
                The{' '}
                <Link
                  href="/legal/privacy"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  privacy notice
                </Link>{' '}
                explains what FRAME stores and what it never publishes without asking — including the
                location data inside your photographs.
              </>
            }
            error={fieldError(state, 'acceptedTerms')}
          />

          <Button type="submit" size="lg" loading={pending} className="w-full">
            {pending ? 'Creating your account' : 'Create account'}
          </Button>
        </>
      )}
    </form>
  );
}
