'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { fieldError, FormStatus } from '@/components/auth/AuthStatus';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { signIn } from '@/server/actions/auth';

/**
 * Sign in.
 *
 * A plain form posting to a server action, so it works before this component
 * has hydrated. On success the action redirects, which is why there is no
 * success state here: the next page is the confirmation.
 */

/** Derived from the action, so the form and the server cannot drift apart. */
type FormState = Awaited<ReturnType<typeof signIn>> | null;

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signIn, null);

  return (
    <form action={formAction} className="space-y-5">
      <FormStatus state={state} />

      {/* Where to land afterwards. Validated again on the server, because a
          hidden field is exactly as editable as the query string it came from. */}
      <input type="hidden" name="next" value={next} />

      <TextField
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={fieldError(state, 'email')}
      />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={fieldError(state, 'password')}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? 'Signing in' : 'Sign in'}
      </Button>

      <p className="text-caption text-muted">
        <Link href="/forgot-password" className="font-semibold text-ink underline underline-offset-2">
          Forgotten your password?
        </Link>
      </p>
    </form>
  );
}
