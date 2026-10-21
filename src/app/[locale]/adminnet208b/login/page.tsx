import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AdminOtpForm } from '@/components/admin/AdminOtpForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { withLocalePrefix } from '@/i18n/locales';
import { getViewer, isAdmin } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo';

/** The console's door. An admin already signed in walks straight through. */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'admin.login' });
  return buildMetadata({ title: t('title'), description: t('description'), path: '/adminnet208b/login', locale, noIndex: true });
}

export default async function AdminLoginPage({ params }: { params: LocaleParams }) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);
  if (isAdmin(await getViewer())) redirect(withLocalePrefix('/adminnet208b', locale));
  const t = await getTranslations({ locale, namespace: 'admin.login' });

  return (
    <div className="site-container py-12 lg:py-20">
      <div className="mx-auto max-w-md">
        <AuthShell eyebrow={t('eyebrow')} title={t('title')} description={t('description')} action="Signing in">
          <AdminOtpForm />
        </AuthShell>
      </div>
    </div>
  );
}
