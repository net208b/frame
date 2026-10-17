import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AuthShell, firstParam } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { Notice } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo';

/**
 * Ask for a password reset link.
 *
 * Nothing on this page reveals whether an address has an account. The form
 * reports the same outcome either way, which is the only answer that does not
 * turn a reset form into a way to check who is a member. That holds in both
 * languages: the Thai sentence is conditional in the same place the English
 * one is, and no copy here mentions the address at all.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'auth' });

  return buildMetadata({
    title: t('forgot.metaTitle'),
    description: t('forgot.metaDescription'),
    path: '/forgot-password',
    locale,
    noIndex: true,
  });
}

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth' });

  // Set by /auth/confirm when a recovery link could not be verified.
  const linkExpired = firstParam(resolved.status) === 'link_expired';

  return (
    <AuthShell
      eyebrow={t('shell.eyebrow')}
      title={t.rich('forgot.title', {
        accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
      })}
      description={t('forgot.description')}
      action="Resetting a password"
      footer={t.rich('forgot.footer', {
        signin: (chunks) => (
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            {chunks}
          </Link>
        ),
      })}
    >
      {linkExpired ? (
        <Notice tone="warning" title={t('forgot.linkExpiredTitle')} className="mb-6">
          {t('forgot.linkExpiredBody')}
        </Notice>
      ) : null}

      <ForgotPasswordForm />
    </AuthShell>
  );
}
