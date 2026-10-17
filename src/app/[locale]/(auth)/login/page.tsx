import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AlreadySignedIn, AuthShell, firstParam } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { Notice } from '@/components/ui/states';
import { type Locale, withLocalePrefix } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-redirect';
import { buildMetadata } from '@/lib/seo';

/**
 * Sign in.
 *
 * The page reads two query parameters and trusts neither. `next` passes
 * through `safeNextPath`, so a link that tried to carry somebody off this
 * origin lands on the home page instead; `error` is matched against the short
 * list below rather than being rendered, so a crafted link cannot put its own
 * sentence inside FRAME's chrome.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'auth' });

  return buildMetadata({
    title: t('login.metaTitle'),
    description: t('login.metaDescription'),
    path: '/login',
    locale,
    // A sign-in form has no business in a search index, and indexing it would
    // put a page carrying a `next` parameter in front of people who never asked
    // to go anywhere.
    noIndex: true,
  });
}

/**
 * The reasons another part of the app sends somebody here.
 *
 * Each is a pair of message keys looked up by a known value — nothing from the
 * query string reaches the page, and an unrecognised value finds nothing.
 */
const ARRIVALS: Record<string, { title: string; body: string }> = {
  not_configured: {
    title: 'login.arrivalNotConfiguredTitle',
    body: 'login.arrivalNotConfiguredBody',
  },
  link_expired: {
    title: 'login.arrivalLinkExpiredTitle',
    body: 'login.arrivalLinkExpiredBody',
  },
  signout_failed: {
    title: 'login.arrivalSignoutFailedTitle',
    body: 'login.arrivalSignoutFailedBody',
  },
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth' });

  // The fallback destination carries the locale: a member who signed in on a
  // Thai page and named no destination belongs on the Thai home page, and the
  // server action that performs the redirect only has this string to go on.
  const next = safeNextPath(firstParam(resolved.next), withLocalePrefix('/', locale));
  const arrivalKey = firstParam(resolved.error);
  const arrival = arrivalKey ? ARRIVALS[arrivalKey] : undefined;

  const viewer = await getViewer();

  return (
    <AuthShell
      eyebrow={t('shell.eyebrow')}
      title={t.rich('login.title', {
        accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
      })}
      description={t('login.description')}
      action="Signing in"
      footer={t.rich('login.footer', {
        join: (chunks) => (
          <Link href="/join" className="font-semibold text-ink underline underline-offset-2">
            {chunks}
          </Link>
        ),
      })}
    >
      {arrival ? (
        <Notice
          tone={arrivalKey === 'not_configured' ? 'info' : 'warning'}
          title={t(arrival.title)}
          className="mb-6"
        >
          {t(arrival.body)}
        </Notice>
      ) : null}

      {viewer ? (
        <AlreadySignedIn
          displayName={viewer.displayName}
          username={viewer.username}
          continueHref={next}
          continueLabel={t('login.continueLabel')}
        />
      ) : (
        <LoginForm next={next} />
      )}
    </AuthShell>
  );
}
