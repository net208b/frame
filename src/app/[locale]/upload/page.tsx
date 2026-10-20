import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Notice } from '@/components/ui/states';
import { fileSizeParts } from '@/components/upload/limits';
import { UploadWizard } from '@/components/upload/UploadWizard';
import { withLocalePrefix } from '@/i18n/locales';
import { getViewer, requireViewer } from '@/lib/auth';
import { capabilities, isDemoMode, UPLOAD_POLICY } from '@/lib/config';
import { visitorPlace } from '@/lib/geo/visitor';
import { buildMetadata } from '@/lib/seo';
import { StorageConfigurationError, storageDriver } from '@/lib/storage';

/**
 * The upload wizard's page.
 *
 * `noIndex` because this is a member's workspace: there is nothing here for a
 * search engine, and a draft in progress is nobody else's business. The
 * metadata is still written per language, because the title appears in the
 * browser's own tab and history.
 */
export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'upload' });

  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/upload',
    locale,
    noIndex: true,
  });
}

/**
 * Whether storage can actually accept a file right now.
 *
 * `capabilities().uploads` goes true as soon as a database is configured, so it
 * cannot tell whether the *selected* provider has its credentials: with
 * `STORAGE_PROVIDER=r2` and no R2 keys it reports uploads as available while
 * `storageDriver()` throws. Constructing the driver is a pure read of the
 * environment with no network call, so asking it directly is the honest check,
 * and its own message names the variable to set.
 */
function storageReadiness(): { ready: boolean; reason: string | null } {
  try {
    storageDriver();
    return { ready: true, reason: null };
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return { ready: false, reason: error.message };
    }
    throw error;
  }
}

export default async function UploadPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'upload' });
  const format = await getFormatter({ locale });
  /** Pixel dimensions, ungrouped — see the note in `components/upload/format.ts`. */
  const pixels = (value: number) => format.number(value, { useGrouping: false });

  const demo = isDemoMode();
  // Repeated from the layout rather than relied upon: the session is read once
  // per request and cached, so this costs nothing and the page does not depend
  // on a parent layout having been rendered this time round.
  const viewer = demo
    ? await getViewer()
    : await requireViewer(withLocalePrefix('/upload', locale));

  const storage = storageReadiness();
  const capabilityFlagIsOptimistic = capabilities().uploads && !storage.ready;
  const place = await visitorPlace();

  return (
    <div>
      <header>
        <Eyebrow>{t('page.eyebrow')}</Eyebrow>
        <h1 className="mt-2.5 text-section-fluid font-bold">
          {/* The serif italic accent is one English word set in Instrument
              Serif, which has no Thai glyphs and no business italicising Thai,
              so the Thai message carries no tag and the handler is never
              called. */}
          {t.rich('page.heading', {
            accent: (chunks: ReactNode) => (
              <span className="font-serif font-normal italic">{chunks}</span>
            ),
          })}
        </h1>
        <p className="mt-3.5 max-w-[46rem] text-lead text-muted">{t('page.lead')}</p>
        {viewer ? (
          <p className="mt-2.5 text-meta text-muted-soft">
            {t('page.uploadingAs', {
              displayName: viewer.displayName,
              username: viewer.username,
              size: t('limits.fileSize', fileSizeParts(UPLOAD_POLICY.maxFileBytes)),
              width: pixels(UPLOAD_POLICY.minPixelWidth),
              height: pixels(UPLOAD_POLICY.minPixelHeight),
            })}
          </p>
        ) : null}
      </header>

      {/* `action` is the subject of the sentence `CapabilityNotice` builds from
          `common.capabilityMissing`, so it arrives already translated. */}
      <CapabilityNotice capability="uploads" action={t('capability.action')} className="mt-7" />

      {capabilityFlagIsOptimistic && storage.reason !== null ? (
        <Notice tone="warning" title={t('storage.title')} className="mt-7">
          {/* `storage.reason` is thrown by `lib/storage` and names the missing
              environment variable. It is a deployment message for whoever
              configured this copy, not member-facing copy, and it is shown in
              the words it was raised in. */}
          <p>{t('storage.body', { reason: storage.reason })}</p>
          <p className="mt-2">{t('storage.note')}</p>
        </Notice>
      ) : null}

      {/* The place step's map opens on the city the request's own address
          resolved to, so a member proposing somewhere new starts near where
          they are instead of in the middle of the Atlantic. It is read here
          because `visitorPlace()` is a server read of the request's headers;
          the wizard is a client component and cannot do it. */}
      <UploadWizard
        uploadsConfigured={storage.ready}
        defaultMapView={{ centre: place.centre, zoom: place.zoom }}
      />
    </div>
  );
}
