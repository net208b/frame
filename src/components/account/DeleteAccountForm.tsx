'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { keepTypedValues } from '@/components/account/keep-typed-values';
import { FormStatus, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { deleteAccount } from '@/server/actions/account';

/**
 * Delete the account.
 *
 * The page says which of the two outcomes this will have before the button is
 * pressed — erased, or kept as a closed record because moderation decisions
 * name it — because a member deciding whether to delete their account is owed
 * the actual consequence, not the usual one.
 *
 * Confirmation is typing the username. The button stays disabled until it
 * matches, which is a convenience; the server action checks it, and
 * `delete_own_account()` checks it again, which is the rule.
 *
 * On success the action redirects to the sign-in page, which says what
 * happened. There is no success state here because there is no longer an
 * account for this page to belong to.
 */

type FormState = Awaited<ReturnType<typeof deleteAccount>> | null;

export function DeleteAccountForm({
  username,
  retainsAccount,
}: {
  username: string;
  retainsAccount: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteAccount, null);
  const [typed, setTyped] = useState('');
  const t = useTranslations('account');
  const errorFor = useFieldErrors(state);

  const matches = typed.trim().toLowerCase() === username.toLowerCase();

  return (
    <form action={formAction} onSubmit={keepTypedValues(formAction)} className="space-y-5">
      <p className="text-body font-semibold">{t('delete.intro')}</p>

      {retainsAccount ? (
        <p className="text-body text-muted">{t('delete.retained')}</p>
      ) : (
        <>
          <p className="text-body text-muted">{t('delete.whatGoes')}</p>
          <p className="text-body text-muted">{t('delete.whatStays')}</p>
        </>
      )}

      <FormStatus state={state} />

      <TextField
        label={t('delete.confirmLabel', { username })}
        name="confirmUsername"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        error={errorFor('confirmUsername')}
      />

      <Button
        type="submit"
        variant="danger"
        size="lg"
        loading={pending}
        // Before hydration `typed` is empty and this would block a form that
        // can otherwise work without JavaScript; the server checks it anyway.
        disabled={!matches && typed !== ''}
      >
        {pending ? t('delete.submitPending') : t('delete.submit')}
      </Button>
    </form>
  );
}
