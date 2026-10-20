import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

import { DeleteAccountForm } from '@/components/account/DeleteAccountForm';
import { ProfileForm } from '@/components/account/ProfileForm';
import { UsernameSection } from '@/components/account/UsernameSection';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Notice } from '@/components/ui/states';
import { withLocalePrefix } from '@/i18n/locales';
import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { getOwnSettings } from '@/lib/account';
import { requireViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';
import { SIGN_IN_PROVIDER_NAMES, isSignInProvider } from '@/lib/sign-in-providers';

/**
 * Settings: the profile, the username, and deleting the account.
 *
 * Everything the privacy notice says a member can do for themselves is on this
 * page, and the notice says nothing this page cannot do. The two are meant to
 * be read together, and changed together.
 *
 * Every write here is also refused by the database when it should be — see
 * migration 0010 — so what this page shows or hides is a courtesy, not the
 * rule.
 */

/**
 * Rendered per request, always. This page is one member's own data, and a
 * build without database credentials would otherwise prerender its demo branch
 * as a static file — harmless today, but a static settings page is one cache
 * mistake away from serving one member's profile to another.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'account' });

  return buildMetadata({
    title: t('metaTitle'),
    description: t('metaDescription'),
    path: '/settings',
    locale,
    noIndex: true,
  });
}

const SECTION = 'border-t border-line pt-10';

export default async function SettingsPage({ params }: { params: LocaleParams }) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'account' });
  const format = await getFormatter({ locale });

  if (isDemoMode()) {
    return (
      <div className="site-container py-14 md:py-20">
        <header className="max-w-[46rem]">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-5 text-display-fluid">{t('title')}</h1>
        </header>
        <CapabilityNotice capability="auth" action={t('capabilityAction')} className="mt-8 max-w-xl" />
      </div>
    );
  }

  await requireViewer(withLocalePrefix('/settings', locale));
  const settings = await getOwnSettings();

  if (!settings) {
    // Signed in, but the profile row is not there: mid-signup or mid-deletion.
    return (
      <div className="site-container py-14 md:py-20">
        <Notice tone="warning" title={t('missingTitle')} className="max-w-xl">
          {t('missingBody')}
        </Notice>
      </div>
    );
  }

  const provider = isSignInProvider(settings.createdWith)
    ? SIGN_IN_PROVIDER_NAMES[settings.createdWith]
    : null;

  return (
    <div className="site-container py-14 md:py-20">
      <header className="max-w-[46rem]">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-5 text-display-fluid">{t('title')}</h1>
        <p className="mt-6 max-w-[44ch] text-lead leading-relaxed text-muted">
          {t('description')}
        </p>
      </header>

      <div className="mt-12 max-w-2xl space-y-14">
        {settings.isSuspended ? (
          <Notice tone="warning" title={t('suspendedTitle')}>
            {t('suspendedBody')}
          </Notice>
        ) : null}

        <section aria-labelledby="settings-profile" className={SECTION}>
          <h2 id="settings-profile" className="text-title">
            {t('profile.heading')}
          </h2>
          <p className="mt-2 text-body text-muted">{t('profile.intro')}</p>
          <div className="mt-8">
            <ProfileForm
              username={settings.username}
              disabled={settings.isSuspended}
              initial={{
                displayName: settings.displayName,
                biography: settings.biography ?? '',
                basedIn: settings.basedIn ?? '',
                website: settings.website ?? '',
                gear: settings.usualGear.join('\n'),
              }}
            />
          </div>
        </section>

        <section aria-labelledby="settings-username" className={SECTION}>
          <h2 id="settings-username" className="text-title">
            {t('username.heading')}
          </h2>
          <div className="mt-4">
            <UsernameSection
              username={settings.username}
              canChange={settings.canChangeUsername}
              changedOn={
                settings.usernameChangedAt
                  ? format.dateTime(new Date(settings.usernameChangedAt), { dateStyle: 'long' })
                  : null
              }
              provider={provider}
            />
          </div>
        </section>

        <section aria-labelledby="settings-delete" className={SECTION}>
          <h2 id="settings-delete" className="text-title">
            {t('delete.heading')}
          </h2>
          <div className="mt-4">
            <DeleteAccountForm
              username={settings.username}
              retainsAccount={settings.deletionRetainsAccount}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
