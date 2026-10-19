'use client';

import { ArrowRight, MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { Link } from '@/i18n/navigation';
import { signUp } from '@/server/actions/auth';

/**
 * Create an account.
 *
 * The rules are stated beside the fields rather than sprung afterwards: the
 * password length, the username charset, and the fact that the username
 * becomes a public address this build cannot change. Each hint says so in one
 * message, including the numbers — the bounds are constants of the schema, so
 * writing "10" into both catalogues states the rule rather than guessing it.
 *
 * Joining does not sign anybody in. The account exists once the address is
 * confirmed, so the panel below reports what was actually sent rather than
 * welcoming somebody who has not finished yet.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof signUp>> | null;

export function JoinForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signUp, null);
  const t = useTranslations('auth');
  const errorFor = useFieldErrors(state);
  const joined = state?.ok === true;

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess
            title={
              state.data.emailConfirmationRequired
                ? t('join.confirmationSentTitle')
                : t('join.accountReadyTitle')
            }
            icon={<MailCheck className="size-4 shrink-0" aria-hidden />}
          >
            <p>{state.message}</p>

            {state.data.emailConfirmationRequired ? (
              <p className="mt-3">
                {t.rich('join.nothingArrived', {
                  resend: (chunks) => (
                    <Link
                      href="/verify-email"
                      className="font-semibold text-ink underline underline-offset-2"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            ) : (
              <p className="mt-3">
                <Link
                  href="/discover"
                  className="inline-flex items-center gap-1.5 font-semibold text-ink underline underline-offset-2"
                >
                  {t('join.startExploring')}
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
            label={t('fields.email')}
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            hint={t('join.emailHint')}
            error={errorFor('email')}
          />

          <TextField
            label={t('fields.username')}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            required
            hint={t('join.usernameHint')}
            error={errorFor('username')}
          />

          <TextField
            label={t('fields.displayName')}
            name="displayName"
            autoComplete="name"
            maxLength={60}
            required
            hint={t('join.displayNameHint')}
            error={errorFor('displayName')}
          />

          <PasswordField
            label={t('fields.password')}
            name="password"
            autoComplete="new-password"
            minLength={10}
            required
            hint={t('join.passwordHint')}
            error={errorFor('password')}
          />

          <CheckboxField
            name="acceptedTerms"
            required
            label={t.rich('join.termsLabel', {
              terms: (chunks) => (
                <Link
                  href="/legal/terms"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
              guidelines: (chunks) => (
                <Link
                  href="/legal/guidelines"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
            description={t.rich('join.termsDescription', {
              privacy: (chunks) => (
                <Link
                  href="/legal/privacy"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
            error={errorFor('acceptedTerms')}
          />

          <Button type="submit" size="lg" loading={pending} className="w-full">
            {pending ? t('join.submitPending') : t('join.submit')}
          </Button>
        </>
      )}
    </form>
  );
}
