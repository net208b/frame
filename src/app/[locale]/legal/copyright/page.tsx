import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';

import { REPORT_REASON_LABELS } from '@/types/domain';

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

  return policyMetadata('copyright', locale);
}

export default async function CopyrightPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'legal' });

  const sections: readonly PolicySection[] = [
    {
      id: 'ownership',
      heading: t('copyright.ownership.heading'),
      body: (
        <>
          <p>{t('copyright.ownership.p1')}</p>
          <p>{t('copyright.ownership.p2')}</p>
        </>
      ),
    },
    {
      id: 'licence',
      heading: t('copyright.licence.heading'),
      body: (
        <>
          <p>{t('copyright.licence.intro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('copyright.licence.list.store')}</li>
            <li>{t('copyright.licence.list.derivatives')}</li>
            <li>{t('copyright.licence.list.display')}</li>
            <li>{t('copyright.licence.list.editorial')}</li>
          </ul>
          <p>{t('copyright.licence.exclusions')}</p>
          <p>{t('copyright.licence.ends')}</p>
        </>
      ),
    },
    {
      id: 'commercial-use',
      heading: t('copyright.commercialUse.heading'),
      body: (
        <>
          <p>{t('copyright.commercialUse.p1')}</p>
          <p>{t('copyright.commercialUse.p2')}</p>
        </>
      ),
    },
    {
      id: 'takedown',
      heading: t('copyright.takedown.heading'),
      body: (
        <>
          <p>
            {/* The two reasons are quoted from REPORT_REASON_LABELS rather than
                retyped, because the reader has to find exactly these words in
                the report dialog's list. When those labels are localised the
                quotation follows automatically. */}
            {t.rich('copyright.takedown.intro', {
              ...POLICY_TAGS,
              reasonNotMine: REPORT_REASON_LABELS['not-my-photograph'],
              reasonCopyright: REPORT_REASON_LABELS.copyright,
            })}
          </p>
          <ul className={POLICY_LIST}>
            <li>{t('copyright.takedown.list.address')}</li>
            <li>{t('copyright.takedown.list.work')}</li>
            <li>{t('copyright.takedown.list.relationship')}</li>
            <li>{t('copyright.takedown.list.contact')}</li>
            <li>{t('copyright.takedown.list.goodFaith')}</li>
            <li>{t('copyright.takedown.list.accuracy')}</li>
          </ul>
          <p>{t('copyright.takedown.nextIntro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t.rich('copyright.takedown.steps.acknowledge', POLICY_TAGS)}</li>
            <li>{t.rich('copyright.takedown.steps.hidden', POLICY_TAGS)}</li>
            <li>{t.rich('copyright.takedown.steps.uploaderTold', POLICY_TAGS)}</li>
            <li>{t.rich('copyright.takedown.steps.decision', POLICY_TAGS)}</li>
          </ul>
          <p>{t('copyright.takedown.timings')}</p>
        </>
      ),
    },
    {
      id: 'counter-notice',
      heading: t('copyright.counterNotice.heading'),
      body: (
        <>
          <p>{t('copyright.counterNotice.p1')}</p>
          <p>{t('copyright.counterNotice.p2')}</p>
          <p>{t('copyright.counterNotice.p3')}</p>
        </>
      ),
    },
    {
      id: 'repeat-infringement',
      heading: t('copyright.repeatInfringement.heading'),
      body: (
        <>
          <p>{t('copyright.repeatInfringement.intro')}</p>
          <ul className={POLICY_LIST}>
            <li>{t('copyright.repeatInfringement.steps.first')}</li>
            <li>{t('copyright.repeatInfringement.steps.second')}</li>
            <li>{t('copyright.repeatInfringement.steps.third')}</li>
          </ul>
          <p>{t('copyright.repeatInfringement.notCounted')}</p>
        </>
      ),
    },
    {
      id: 'similarity-matching',
      heading: t('copyright.similarityMatching.heading'),
      body: (
        <>
          <p>{t('copyright.similarityMatching.p1')}</p>
          <p>{t('copyright.similarityMatching.p2')}</p>
          <p>
            {t.rich('copyright.similarityMatching.p3', {
              guidelines: policyLinkTag('guidelines'),
            })}
          </p>
        </>
      ),
    },
  ];

  return <PolicyDocument slug="copyright" sections={sections} locale={locale} />;
}
