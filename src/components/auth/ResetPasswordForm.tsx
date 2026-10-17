'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { fieldError, FormStatus, FormSuccess } from '@/components/auth/AuthStatus';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { resetPassword } from '@/server/actions/auth';

/**
 * Choose a new password.
 *
 * The rule is stated beside the field rather than sprung after the submit,
 * and the same rule is enforced again in the action: this form is the
 * convenience and the server is the gate.
 *
 * Once the change has been written the fields are removed. Leaving them would
 * invite a second attempt that the identity service would refuse as a repeat
 * of the password now on the account.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof resetPassword>> | null;

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPassword, null);
  const changed = state?.ok === true;

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess title="Password changed">
            <p>{state.message}</p>
            <p className="mt-3">
              <Link
                href="/discover"
                className="font-semibold text-ink underline underline-offset-2"
              >
                Go to the gallery
              </Link>
            </p>
          </FormSuccess>
        ) : null}
      </FormStatus>

      {changed ? null : (
        <>
          <PasswordField
            label="New password"
            name="password"
            autoComplete="new-password"
            minLength={10}
            required
            hint="At least 10 characters. Three or four unrelated words are easier to remember and harder to guess than one word with symbols in it."
            error={fieldError(state, 'password')}
          />

          <PasswordField
            label="Repeat the new password"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={10}
            required
            error={fieldError(state, 'confirmPassword')}
          />

          <Button type="submit" size="lg" loading={pending} className="w-full">
            {pending ? 'Saving the password' : 'Save the new password'}
          </Button>
        </>
      )}
    </form>
  );
}
