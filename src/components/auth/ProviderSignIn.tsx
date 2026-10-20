'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { FormStatus } from '@/components/auth/AuthStatus';
import { ProviderMark } from '@/components/auth/ProviderMark';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { SIGN_IN_PROVIDER_NAMES, type SignInProvider } from '@/lib/sign-in-providers';
import { signInWithProvider } from '@/server/actions/auth';

/**
 * "Continue with Google", and the rest, above the email form.
 *
 * `providers` is what the identity service reports as switched on, read by the
 * page from `enabledSignInProviders()`. With none switched on — the state of a
 * fresh deployment — this renders nothing at all, divider included, so the
 * page looks exactly as it did before providers existed.
 *
 * One form, one submit button per provider, each naming itself with
 * `name="provider"`. A browser includes the pressed button's value when it
 * submits, so this works before hydration the way the email form does.
 *
 * The consent sentence appears on the sign-in page as well as on Join, because
 * pressing one of these buttons can create an account from either page: the
 * provider, not the page, decides whether this person is new.
 */

type FormState = Awaited<ReturnType<typeof signInWithProvider>> | null;

const LINK = 'font-semibold text-ink underline underline-offset-2';

export function ProviderSignIn({
  providers,
  next,
}: {
  providers: readonly SignInProvider[];
  next: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    signInWithProvider,
    null,
  );
  // Which button was pressed, so only that one shows the spinner. The action's
  // own pending flag cannot say which.
  const [chosen, setChosen] = useState<SignInProvider | null>(null);
  const t = useTranslations('auth');

  if (providers.length === 0) return null;

  return (
    <div className="mb-6 space-y-6">
      <form action={formAction} className="space-y-3" aria-label={t('providers.groupLabel')}>
        <FormStatus state={state} />

        {/* Validated again by the action: as editable as any query string. */}
        <input type="hidden" name="next" value={next} />

        {providers.map((provider) => {
          const name = SIGN_IN_PROVIDER_NAMES[provider];
          const busy = pending && chosen === provider;

          return (
            <Button
              key={provider}
              type="submit"
              name="provider"
              value={provider}
              variant="secondary"
              size="lg"
              className="w-full"
              loading={busy}
              disabled={pending && !busy}
              iconLeft={<ProviderMark provider={provider} />}
              onClick={() => setChosen(provider)}
            >
              {busy
                ? t('providers.pending', { provider: name })
                : t('providers.continueWith', { provider: name })}
            </Button>
          );
        })}

        <p className="pt-1 text-caption text-muted">
          {t.rich('providers.consent', {
            terms: (chunks) => (
              <Link href="/legal/terms" className={LINK}>
                {chunks}
              </Link>
            ),
            guidelines: (chunks) => (
              <Link href="/legal/guidelines" className={LINK}>
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/legal/privacy#sign-in-providers" className={LINK}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </form>

      <div className="flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-eyebrow text-muted uppercase">{t('providers.divider')}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
