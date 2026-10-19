import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AuthCta, AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { Notice } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { getViewer } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo';

/**
 * Set a new password.
 *
 * The recovery link in the email creates a real session, and that session is
 * the only proof of ownership this page has. Without one there is nothing to
 * change, so the form is not rendered at all — and `resetPassword` checks the
 * session again before it writes, because an absent form is a courtesy to the
 * reader rather than a permission check.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'auth' });

  return buildMetadata({
    title: t('reset.metaTitle'),
    description: t('reset.metaDescription'),
    path: '/reset-password',
    locale,
    noIndex: true,
  });
}

export default async function ResetPasswordPage({
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
      title={t.rich('reset.title', {
        accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
      })}
      description={viewer ? t('reset.descriptionSignedIn') : t('reset.descriptionNoLink')}
      action="Changing a password"
      footer={
        viewer ? (
          t.rich('reset.footerSignedIn', {
            username: viewer.username,
            profile: (chunks) => (
              <Link
                href={`/photographers/${viewer.username}`}
                className="font-semibold text-ink underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })
        ) : (
          t.rich('reset.footerNoLink', {
            request: (chunks) => (
              <Link
                href="/forgot-password"
                className="font-semibold text-ink underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })
        )
      }
    >
      {viewer ? (
        <ResetPasswordForm />
      ) : (
        <div>
          <Notice tone="info" title={t('reset.noLinkTitle')}>
            {t('reset.noLinkBody')}
          </Notice>

          <div className="mt-6">
            <AuthCta href="/forgot-password">{t('reset.noLinkCta')}</AuthCta>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
