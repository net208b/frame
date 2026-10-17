'use client';

import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { resendVerification } from '@/server/actions/auth';

/**
 * Ask for another confirmation link.
 *
 * The outcome reported here is conditional on purpose. An address that is
 * already confirmed, and an address that was never registered, are both
 * refused by the identity service in the same way, and answering them
 * differently would turn this form into a way to find out who has an account.
 * So the sentence says what is true of every case rather than guessing which
 * one this was — in Thai as well: `resendSent` opens with ถ้า ("if"), which
 * keeps the condition in front of the claim exactly as the English does.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof resendVerification>> | null;

export function ResendVerificationForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resendVerification,
    null,
  );
  const t = useTranslations('auth');
  const errorFor = useFieldErrors(state);

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess
            title={t('verify.successTitle')}
            icon={<MailCheck className="size-4 shrink-0" aria-hidden />}
          >
            <p>{state.message}</p>
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
        hint={t('verify.emailHint')}
        error={errorFor('email')}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? t('verify.submitPending') : t('verify.submit')}
      </Button>
    </form>
  );
}
