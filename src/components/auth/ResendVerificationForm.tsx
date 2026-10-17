'use client';

import { MailCheck } from 'lucide-react';
import { useActionState } from 'react';

import { fieldError, FormStatus, FormSuccess } from '@/components/auth/AuthStatus';
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
 * one this was.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof resendVerification>> | null;

export function ResendVerificationForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resendVerification,
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess
            title="Request sent"
            icon={<MailCheck className="size-4 shrink-0" aria-hidden />}
          >
            <p>{state.message}</p>
          </FormSuccess>
        ) : null}
      </FormStatus>

      <TextField
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        hint="The address you joined with. Only two links are sent per address every ten minutes, so check your spam folder before asking again."
        error={fieldError(state, 'email')}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? 'Sending the link' : 'Send another link'}
      </Button>
    </form>
  );
}
