import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';

import { UPLOAD_POLICY } from '@/lib/config';
import { formatFileSize } from '@/lib/utils';

import {
  POLICY_LIST,
  PolicyDocument,
  policyLinkTag,
  policyMetadata,
  type PolicySection,
} from '../policy';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);

  return policyMetadata('terms', locale);
}

export default async function TermsPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'legal' });

  // The upload bounds are quoted from `lib/config.ts` rather than retyped, and
  // handed to ICU so the sentence around them is written per language.
  const uploadBounds = {
    maxFileSize: formatFileSize(UPLOAD_POLICY.maxFileBytes),
    minWidth: UPLOAD_POLICY.minPixelWidth,
    minHeight: UPLOAD_POLICY.minPixelHeight,
    maxPerDay: UPLOAD_POLICY.maxUploadsPerDay,
  };

  const sections: readonly PolicySection[] = [
    {
      id: 'eligibility',
      heading: t('terms.eligibility.heading'),
      body: (
        <>
          <p>{t('terms.eligibility.p1')}</p>
          <p>{t('terms.eligibility.p2')}</p>
          <p>{t('terms.eligibility.p3')}</p>
        </>
      ),
    },
    {
      id: 'acceptable-use',
      heading: t('terms.acceptableUse.heading'),
      body: (
        <>
          <p>{t('terms.acceptableUse.intro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('terms.acceptableUse.list.notYourWork')}</li>
            <li>{t('terms.acceptableUse.list.unlawful')}</li>
            <li>
              {t.rich('terms.acceptableUse.list.unsafePin', {
                guidelines: policyLinkTag('guidelines'),
              })}
            </li>
            <li>{t('terms.acceptableUse.list.manipulation')}</li>
            <li>{t('terms.acceptableUse.list.scraping')}</li>
            <li>{t('terms.acceptableUse.list.falseReports')}</li>
          </ul>
          <p>{t('terms.acceptableUse.limits', uploadBounds)}</p>
        </>
      ),
    },
    {
      id: 'your-work',
      heading: t('terms.yourWork.heading'),
      body: (
        <>
          <p>{t.rich('terms.yourWork.p1', { copyright: policyLinkTag('copyright') })}</p>
          <p>{t('terms.yourWork.confirmIntro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('terms.yourWork.list.madeIt')}</li>
            <li>{t('terms.yourWork.list.permission')}</li>
            <li>{t('terms.yourWork.list.noBreach')}</li>
          </ul>
          <p>{t('terms.yourWork.exif')}</p>
          <p>{t('terms.yourWork.altText')}</p>
          <p>{t('terms.yourWork.responsibility')}</p>
        </>
      ),
    },
    {
      id: 'suspension',
      heading: t('terms.suspension.heading'),
      body: (
        <>
          <p>{t.rich('terms.suspension.p1', { privacy: policyLinkTag('privacy') })}</p>
          <p>{t('terms.suspension.intro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('terms.suspension.list.credibleClaim')}</li>
            <li>{t('terms.suspension.list.repeatedDisregard')}</li>
            <li>{t('terms.suspension.list.manipulation')}</li>
            <li>{t('terms.suspension.list.harassment')}</li>
          </ul>
          <p>{t('terms.suspension.recorded')}</p>
          <p>{t('terms.suspension.revisited')}</p>
          <p>{t('terms.suspension.record')}</p>
        </>
      ),
    },
    {
      id: 'liability',
      heading: t('terms.liability.heading'),
      body: (
        <>
          <p>{t('terms.liability.asIs')}</p>
          <p>{t('terms.liability.notes')}</p>
          <p>{t('terms.liability.limits')}</p>
          <p>{t('terms.liability.outstanding')}</p>
        </>
      ),
    },
    {
      id: 'changes',
      heading: t('terms.changes.heading'),
      body: (
        <>
          <p>{t('terms.changes.p1')}</p>
          <p>{t('terms.changes.p2')}</p>
          <p>{t('terms.changes.p3')}</p>
        </>
      ),
    },
  ];

  return <PolicyDocument slug="terms" sections={sections} locale={locale} />;
}
