'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { keepTypedValues } from '@/components/account/keep-typed-values';
import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { changeUsername } from '@/server/actions/account';

/**
 * The username, and — for an account that never chose its own — the one
 * chance to replace it.
 *
 * A username is the address of a profile, and every link anybody has made to
 * it. That is why the Join form says it does not change, and why it does not
 * here either, with one exception: an account made through Google, Apple,
 * Facebook or X was given a username it never chose, and may replace it once.
 * `change_username()` in migration 0010 enforces exactly that; this component
 * only decides which of the three sentences to show.
 */

type FormState = Awaited<ReturnType<typeof changeUsername>> | null;

const CODE = 'font-mono text-[0.95em] font-semibold text-ink';

export function UsernameSection({
  username,
  canChange,
  changedOn,
  provider,
}: {
  username: string;
  canChange: boolean;
  /**
   * When the one change was used, already formatted by the page. Formatted on
   * the server so the date cannot differ between the server's time zone and
   * the browser's and leave the two renders disagreeing.
   */
  changedOn: string | null;
  /** The provider's name when the account was made through one, else null. */
  provider: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changeUsername, null);
  const t = useTranslations('account');
  const errorFor = useFieldErrors(state);

  // After a successful change the new name is the one to show, and the chance
  // has been used — the page will say so on its next render as well.
  const current = state?.ok ? state.data.username : username;
  const changed = state?.ok === true;

  return (
    <div className="space-y-5">
      <p className="text-body">
        {t.rich('username.current', {
          address: `/photographers/${current}`,
          code: (chunks) => <code className={CODE}>{chunks}</code>,
        })}
      </p>

      {canChange && !changed ? (
        <form action={formAction} onSubmit={keepTypedValues(formAction)} className="space-y-5">
          <p className="text-body text-muted">
            {t('username.changeIntro', { provider: provider ?? t('username.aProvider') })}
          </p>

          <FormStatus state={state} />

          <TextField
            label={t('username.field')}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            required
            defaultValue={username}
            hint={t('username.hint')}
            error={errorFor('username')}
          />

          <Button type="submit" variant="secondary" size="lg" loading={pending}>
            {pending ? t('username.submitPending') : t('username.submit')}
          </Button>
        </form>
      ) : changed ? (
        <FormStatus state={state}>
          <FormSuccess title={state?.ok ? (state.message ?? '') : ''}>
            {t('username.usedJustNow')}
          </FormSuccess>
        </FormStatus>
      ) : (
        <p className="text-body text-muted">
          {changedOn ? t('username.used', { date: changedOn }) : t('username.fixed')}
        </p>
      )}
    </div>
  );
}
