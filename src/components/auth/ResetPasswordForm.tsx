'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
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
  const t = useTranslations('auth');
  const errorFor = useFieldErrors(state);
  const changed = state?.ok === true;

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess title={t('reset.successTitle')}>
            <p>{state.message}</p>
            <p className="mt-3">
              <Link
                href="/discover"
                className="font-semibold text-ink underline underline-offset-2"
              >
                {t('reset.successGallery')}
              </Link>
            </p>
          </FormSuccess>
        ) : null}
      </FormStatus>

      {changed ? null : (
        <>
          <PasswordField
            label={t('fields.newPassword')}
            name="password"
            autoComplete="new-password"
            minLength={10}
            required
            hint={t('reset.passwordHint')}
            error={errorFor('password')}
          />

          <PasswordField
            label={t('fields.repeatPassword')}
            name="confirmPassword"
            autoComplete="new-password"
            minLength={10}
            required
            error={errorFor('confirmPassword')}
          />

          <Button type="submit" size="lg" loading={pending} className="w-full">
            {pending ? t('reset.submitPending') : t('reset.submit')}
          </Button>
        </>
      )}
    </form>
  );
}
