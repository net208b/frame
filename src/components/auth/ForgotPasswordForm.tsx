'use client';

import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { requestPasswordReset } from '@/server/actions/auth';

/**
 * Ask for a password reset link.
 *
 * The field stays on the page after a successful request, because the most
 * likely reason nothing arrives is a mistyped address and hiding the form
 * would leave no way to correct it. The limiter in the action is what stops
 * that becoming a way to fill somebody else's inbox.
 *
 * The outcome sentence comes from the action and is the same one in both
 * languages whether or not the address has an account — see `resetRequested`
 * in the catalogue. Nothing here may add a word that narrows it.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof requestPasswordReset>> | null;

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    requestPasswordReset,
    null,
  );
  const t = useTranslations('auth');
  const errorFor = useFieldErrors(state);

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess
            title={t('forgot.successTitle')}
            icon={<MailCheck className="size-4 shrink-0" aria-hidden />}
          >
            <p>{state.message}</p>
            <p className="mt-2">{t('forgot.successDetail')}</p>
          </FormSuccess>
        ) : null}
      </FormStatus>

      <TextField
        label={t('fields.email')}
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        hint={t('forgot.emailHint')}
        error={errorFor('email')}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? t('forgot.submitPending') : t('forgot.submit')}
      </Button>
    </form>
  );
}
