import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import type { Locale } from '@/i18n/locales';

import { APPRECIATION_POLICY, LOCATION_POLICY, UPLOAD_POLICY } from '@/lib/config';
import { formatFileSize } from '@/lib/utils';
import { PHOTO_CATEGORIES, REPORT_REASON_LABELS } from '@/types/domain';

import {
  POLICY_LIST,
  POLICY_TAGS,
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

  return policyMetadata('guidelines', locale);
}

export default async function GuidelinesPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'legal' });

  // The six categories are enumerated from `types/domain.ts` so a category
  // added there cannot quietly disappear from this sentence, and each name is
  // read from `legal.categories` so the Thai page lists them in Thai. See the
  // note in the handover: these names duplicate CATEGORY_LABELS, which is still
  // English, and should be folded into one shared namespace once there is one.
  const categorySentence = PHOTO_CATEGORIES.map((category) =>
    t(`categories.${category}`),
  ).join(', ');

  const uploadBounds = {
    maxFileSize: formatFileSize(UPLOAD_POLICY.maxFileBytes),
    minWidth: UPLOAD_POLICY.minPixelWidth,
    minHeight: UPLOAD_POLICY.minPixelHeight,
    maxPerDay: UPLOAD_POLICY.maxUploadsPerDay,
  };

  const sections: readonly PolicySection[] = [
    {
      id: 'what-belongs',
      heading: t('guidelines.whatBelongs.heading'),
      body: (
        <>
          <p>{t('guidelines.whatBelongs.categories', { categories: categorySentence })}</p>
          <p>{t('guidelines.whatBelongs.posting')}</p>
          <p>{t('guidelines.whatBelongs.notBelongIntro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('guidelines.whatBelongs.list.notYourWork')}</li>
            <li>{t('guidelines.whatBelongs.list.generated')}</li>
            <li>{t('guidelines.whatBelongs.list.composites')}</li>
            <li>{t('guidelines.whatBelongs.list.humiliation')}</li>
          </ul>
          <p>{t('guidelines.whatBelongs.bounds', uploadBounds)}</p>
        </>
      ),
    },
    {
      id: 'people',
      heading: t('guidelines.people.heading'),
      body: (
        <>
          <p>{t('guidelines.people.p1')}</p>
          <p>{t('guidelines.people.p2')}</p>
          <p>{t('guidelines.people.p3')}</p>
          <p>{t('guidelines.people.p4')}</p>
          <p>{t('guidelines.people.p5')}</p>
        </>
      ),
    },
    {
      id: 'places',
      heading: t('guidelines.places.heading'),
      body: (
        <>
          <p>{t('guidelines.places.p1')}</p>
          <p>{t('guidelines.places.neverIntro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('guidelines.places.list.home')}</li>
            <li>{t('guidelines.places.list.sensitive')}</li>
            <li>{t('guidelines.places.list.dangerous')}</li>
          </ul>
          <p>{t.rich('guidelines.places.sensitive', { privacy: policyLinkTag('privacy') })}</p>
        </>
      ),
    },
    {
      id: 'appreciation',
      heading: t('guidelines.appreciation.heading'),
      body: (
        <>
          <p>{t('guidelines.appreciation.p1')}</p>
          <p>{t('guidelines.appreciation.p2')}</p>
          <p>
            {t('guidelines.appreciation.trending', {
              halfLife: APPRECIATION_POLICY.trendingHalfLifeHours,
            })}
          </p>
          <p>{t('guidelines.appreciation.correction')}</p>
        </>
      ),
    },
    {
      id: 'accuracy',
      heading: t('guidelines.accuracy.heading'),
      body: (
        <>
          <p>{t('guidelines.accuracy.p1')}</p>
          <p>
            {t('guidelines.accuracy.checks', {
              radius: LOCATION_POLICY.duplicateRadiusMetres,
            })}
          </p>
          <p>
            {/* Quoted from REPORT_REASON_LABELS rather than retyped: the reader
                has to find exactly this entry in the report dialog's list. */}
            {t.rich('guidelines.accuracy.reporting', {
              ...POLICY_TAGS,
              reasonWrongLocation: REPORT_REASON_LABELS['wrong-location'],
            })}
          </p>
          <p>{t('guidelines.accuracy.restrictions')}</p>
        </>
      ),
    },
    {
      id: 'editorial-picks',
      heading: t('guidelines.editorialPicks.heading'),
      body: (
        <>
          <p>{t('guidelines.editorialPicks.p1')}</p>
          <p>{t('guidelines.editorialPicks.p2')}</p>
          <p>{t('guidelines.editorialPicks.p3')}</p>
        </>
      ),
    },
  ];

  return <PolicyDocument slug="guidelines" sections={sections} locale={locale} />;
}
