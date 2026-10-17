'use client';

import { MailCheck } from 'lucide-react';
import { useActionState } from 'react';

import { fieldError, FormStatus, FormSuccess } from '@/components/auth/AuthStatus';
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
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof requestPasswordReset>> | null;

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    requestPasswordReset,
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess
            title="Reset link requested"
            icon={<MailCheck className="size-4 shrink-0" aria-hidden />}
          >
            <p>{state.message}</p>
            <p className="mt-2">
              The link is valid for one hour and can be used once. Open it in this browser if you
              can — a link opened elsewhere still works, it simply has to be confirmed again.
            </p>
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
        hint="The address the account was created with. FRAME cannot tell you which address that was."
        error={fieldError(state, 'email')}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? 'Sending the link' : 'Send a reset link'}
      </Button>
    </form>
  );
}
