import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AlreadySignedIn, AuthShell } from '@/components/auth/AuthShell';
import { JoinForm } from '@/components/auth/JoinForm';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo';

/**
 * Create an account.
 *
 * Joining does not sign anybody in: the address has to be confirmed first,
 * and the form says so rather than dropping somebody onto the home page as a
 * member of a community they have not finished joining.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'auth' });

  return buildMetadata({
    title: t('join.metaTitle'),
    description: t('join.metaDescription'),
    path: '/join',
    locale,
    noIndex: true,
  });
}

export default async function JoinPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth' });

  const viewer = await getViewer();

  return (
    <AuthShell
      eyebrow={t('shell.eyebrow')}
      /*
       * The accent word here is FRAME itself, which is Latin in both languages
       * — so this is the one display line where the Thai message keeps the
       * serif italic span. The product name is never translated.
       */
      title={t.rich('join.title', {
        accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
      })}
      description={t('join.description')}
      action="Creating an account"
      footer={t.rich('join.footer', {
        signin: (chunks) => (
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            {chunks}
          </Link>
        ),
        resend: (chunks) => (
          <Link
            href="/verify-email"
            className="font-semibold text-ink underline underline-offset-2"
          >
            {chunks}
          </Link>
        ),
      })}
    >
      {viewer ? (
        <AlreadySignedIn
          displayName={viewer.displayName}
          username={viewer.username}
          continueHref={`/photographers/${viewer.username}`}
          continueLabel={t('join.continueLabel')}
        />
      ) : (
        <JoinForm />
      )}
    </AuthShell>
  );
}
