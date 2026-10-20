import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';

import { LOCATION_POLICY } from '@/lib/config';

import {
  POLICY_LIST,
  POLICY_TAGS,
  PolicyDocument,
  policyLinkTag,
  policyMetadata,
  precisionAmount,
  type PolicySection,
} from '../policy';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);

  return policyMetadata('privacy', locale);
}

const PUBLIC_PRECISION = precisionAmount(LOCATION_POLICY.publicCoordinateDecimals);
const REDUCED_PRECISION = precisionAmount(LOCATION_POLICY.reducedCoordinateDecimals);

export default async function PrivacyPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'legal' });

  const sections: readonly PolicySection[] = [
    {
      id: 'what-is-collected',
      heading: t('privacy.whatIsCollected.heading'),
      body: (
        <>
          <p>{t('privacy.whatIsCollected.intro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t.rich('privacy.whatIsCollected.list.email', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.signIn', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.profile', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.photographs', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.appreciation', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.reports', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.placeSubmissions', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.whatIsCollected.list.rateLimits', POLICY_TAGS)}</li>
          </ul>
          <p>{t('privacy.whatIsCollected.notCollected')}</p>
        </>
      ),
    },
    {
      id: 'what-is-published',
      heading: t('privacy.whatIsPublished.heading'),
      body: (
        <>
          <p>{t.rich('privacy.whatIsPublished.published', POLICY_TAGS)}</p>
          <p>{t.rich('privacy.whatIsPublished.notPublished', POLICY_TAGS)}</p>
          <p>{t('privacy.whatIsPublished.removal')}</p>
        </>
      ),
    },
    {
      id: 'exif-and-place',
      heading: t('privacy.exifAndPlace.heading'),
      body: (
        <>
          <p>{t('privacy.exifAndPlace.p1')}</p>
          <p>{t.rich('privacy.exifAndPlace.gps', POLICY_TAGS)}</p>
          <p>
            {t('privacy.exifAndPlace.precision', {
              publicValue: PUBLIC_PRECISION.value,
              publicUnit: PUBLIC_PRECISION.unit,
              reducedValue: REDUCED_PRECISION.value,
              reducedUnit: REDUCED_PRECISION.unit,
            })}
          </p>
          <p>{t('privacy.exifAndPlace.reduction')}</p>
        </>
      ),
    },
    {
      id: 'ip-addresses',
      heading: t('privacy.ipAddresses.heading'),
      body: (
        <>
          <p>{t('privacy.ipAddresses.p1')}</p>
          <p>{t('privacy.ipAddresses.p2')}</p>
          <p>{t('privacy.ipAddresses.p3')}</p>
          <p>{t('privacy.ipAddresses.p4')}</p>
        </>
      ),
    },
    {
      id: 'retention',
      heading: t('privacy.retention.heading'),
      body: (
        <>
          <ul className={POLICY_LIST}>
            <li>{t('privacy.retention.list.account')}</li>
            <li>{t('privacy.retention.list.photographs')}</li>
            <li>{t('privacy.retention.list.drafts')}</li>
            <li>{t('privacy.retention.list.appreciation')}</li>
            <li>{t('privacy.retention.list.reports')}</li>
            <li>{t('privacy.retention.list.rateLimits')}</li>
          </ul>
          <p>{t('privacy.retention.backups')}</p>
        </>
      ),
    },
    {
      id: 'access-and-deletion',
      heading: t('privacy.accessAndDeletion.heading'),
      body: (
        <>
          <p>{t('privacy.accessAndDeletion.p1')}</p>
          <p>{t('privacy.accessAndDeletion.p2')}</p>
          <p>{t('privacy.accessAndDeletion.p3')}</p>
        </>
      ),
    },
    {
      id: 'third-parties',
      heading: t('privacy.thirdParties.heading'),
      body: (
        <>
          <p>{t('privacy.thirdParties.intro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t.rich('privacy.thirdParties.list.database', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.thirdParties.list.storage', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.thirdParties.list.contentCheck', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.thirdParties.list.tiles', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.thirdParties.list.hosting', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.thirdParties.list.signIn', POLICY_TAGS)}</li>
          </ul>
          <p>{t('privacy.thirdParties.demo')}</p>
          <p>{t.rich('privacy.thirdParties.outstanding', { terms: policyLinkTag('terms') })}</p>
        </>
      ),
    },
    {
      // The address given to Meta as this app's data-deletion instructions,
      // and linked from the consent line under the sign-in buttons — so the id
      // is part of a contract with outside parties and must not be renamed.
      id: 'sign-in-providers',
      heading: t('privacy.signInProviders.heading'),
      body: (
        <>
          <p>{t('privacy.signInProviders.p1')}</p>
          <p>{t('privacy.signInProviders.disconnect')}</p>
          <ul className={POLICY_LIST}>
            <li>{t.rich('privacy.signInProviders.list.google', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.signInProviders.list.apple', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.signInProviders.list.facebook', POLICY_TAGS)}</li>
            <li>{t.rich('privacy.signInProviders.list.twitter', POLICY_TAGS)}</li>
          </ul>
          <p>{t('privacy.signInProviders.deletion')}</p>
        </>
      ),
    },
  ];

  return <PolicyDocument slug="privacy" sections={sections} locale={locale} />;
}
