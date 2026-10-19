import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CaptureSpecs } from '@/components/photo-detail/CaptureSpecs';
import { EditingNotes } from '@/components/photo-detail/EditingNotes';
import { LocationPanel } from '@/components/photo-detail/LocationPanel';
import { PhotoHeadline } from '@/components/photo-detail/PhotoHeadline';
import { PhotographerPanel } from '@/components/photo-detail/PhotographerPanel';
import { PhotoStage } from '@/components/photo-detail/PhotoStage';
import { RelatedStrip } from '@/components/photo-detail/RelatedStrip';
import { ReportDialog } from '@/components/system/ReportDialog';
import { Notice } from '@/components/ui/states';
import { LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer, isModerator } from '@/lib/auth';
import {
  getLocation,
  getMoreByPhotographer,
  getPhotograph,
  getPhotographer,
  getPhotographSlugs,
  getPhotographsAtSameLocation,
} from '@/lib/data/repository';
import { buildMetadata, photographJsonLd } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import type { PublicationStatus } from '@/types/domain';

/**
 * The photograph page.
 *
 * Two columns: the frame at roughly 62% of the spread, and the craft
 * information beside it. The image column comes first in the source, so on a
 * phone the photograph arrives before anything written about it. Nothing is
 * pinned — a tall portrait frame and a sticky sidebar fight each other, and the
 * photograph wins that argument every time.
 */

/**
 * Five minutes.
 *
 * Appreciation totals move on their own, and `toggleAppreciation` revalidates
 * this path when a member changes one, so a short window is only a backstop. It
 * applies where the page can actually be cached: a deployment with a database
 * reads per-viewer appreciation state through the request's cookies, which
 * makes this route dynamic whatever this number says.
 */
export const revalidate = 300;

interface PageProps {
  params: LocaleParams<{ slug: string }>;
}

/**
 * `cache` is what keeps `generateMetadata` and the page itself from reading the
 * same photograph twice in one request.
 */
const loadPhotograph = cache(async (slug: string) => getPhotograph(slug));

/** Member-written text does not reliably end in a full stop; a description that
 * runs two sentences together reads like a bug. */
function endWithStop(value: string): string {
  const trimmed = value.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Why a page is not public, as a message key rather than a sentence.
 *
 * `published` maps to null, which is the whole point of the table: it is the
 * one status with nothing to explain. The keys live under `photo.status` in
 * both catalogues.
 */
const STATUS_NOTE_KEY: Record<PublicationStatus, string | null> = {
  draft: 'status.draft',
  processing: 'status.processing',
  published: null,
  under_review: 'status.underReview',
  removed: 'status.removed',
};

/**
 * Every published photograph in every language. The locale is part of the
 * returned params rather than inherited, so this list stays correct whether or
 * not the locale layout above also enumerates them.
 */
export async function generateStaticParams(): Promise<Array<{ locale: Locale; slug: string }>> {
  const slugs = await getPhotographSlugs();
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const [photo, t] = await Promise.all([
    loadPhotograph(slug),
    getTranslations({ locale, namespace: 'photo' }),
  ]);

  if (!photo) {
    return buildMetadata({
      title: t('meta.notFoundTitle'),
      description: t('meta.notFoundDescription'),
      path: `/photographs/${slug}`,
      locale,
      noIndex: true,
    });
  }

  const place = photo.location ? `${photo.location.city}, ${photo.location.country}` : null;
  // The description the photographer wrote reads better than anything derived
  // from it; the alt text is the honest fallback because it is always present.
  const excerpt = endWithStop(truncate(photo.description ?? photo.altText, 150));
  const credit = place
    ? t('meta.creditWithPlace', { place, photographer: photo.photographer.displayName })
    : t('meta.credit', { photographer: photo.photographer.displayName });

  return buildMetadata({
    title: place ? `${photo.title} — ${place}` : photo.title,
    // A space joins the two sentences in both languages: Thai writes no full
    // stop, so the space is the sentence break rather than a gap after one.
    description: `${excerpt} ${credit}`,
    path: `/photographs/${photo.slug}`,
    locale,
    image: { url: photo.image.displayUrl, alt: photo.altText },
    type: 'article',
    // An unpublished frame is reachable only by its owner and by moderators,
    // and it has no business in an index.
    noIndex: photo.status !== 'published',
  });
}

export default async function PhotographPage({ params }: PageProps) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);

  const [photo, viewer, t] = await Promise.all([
    loadPhotograph(slug),
    getViewer(),
    getTranslations({ locale, namespace: 'photo' }),
  ]);

  if (!photo) notFound();

  // Authorisation on the server, every time. The repository already restricts
  // public reads to published rows; this is the check that stays correct if it
  // ever stops doing so, and hiding the page in the UI would not be one.
  const isOwner = viewer !== null && viewer.id === photo.photographer.id;
  if (photo.status !== 'published' && !isOwner && !isModerator(viewer)) notFound();

  const [sameLocation, byPhotographer, locationDetail, photographerProfile] = await Promise.all([
    getPhotographsAtSameLocation(photo.location?.id ?? null, photo.id),
    getMoreByPhotographer(photo.photographer.id, photo.id),
    photo.location ? getLocation(photo.location.slug) : Promise.resolve(null),
    getPhotographer(photo.photographer.username),
  ]);

  const statusKey = STATUS_NOTE_KEY[photo.status];
  const place = photo.location
    ? `${photo.location.name} · ${photo.location.city}, ${photo.location.country}`
    : null;

  // Member-authored text can contain "</script>", which would close this
  // element early. Escaping "<" is what keeps the block inert.
  const jsonLd = JSON.stringify(photographJsonLd(photo, locale)).replace(/</g, '\\u003c');

  return (
    <div className="site-container py-9 lg:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <nav aria-label={t('breadcrumb.label')} className="mb-7">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
          <li>
            <Link href="/discover" className="transition-colors duration-150 hover:text-ink">
              {t('breadcrumb.discover')}
            </Link>
          </li>
          {photo.location ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link
                  href={`/locations/${photo.location.slug}`}
                  className="transition-colors duration-150 hover:text-ink"
                >
                  {photo.location.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink-soft">
            {photo.title}
          </li>
        </ol>
      </nav>

      {statusKey ? (
        <Notice tone="warning" title={t('status.noticeTitle')} className="mb-7">
          {t('status.noticeBody', { note: t(statusKey) })}
        </Notice>
      ) : null}

      <article className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] lg:gap-14">
        {/* The frame first in the source, so it is also first on a phone. */}
        <PhotoStage
          image={photo.image}
          altText={photo.altText}
          title={photo.title}
          caption={place}
        />

        <div className="min-w-0 space-y-11">
          <PhotoHeadline photo={photo} />
          <CaptureSpecs capture={photo.capture} />
          <EditingNotes editing={photo.editing} capturedAt={photo.capturedAt} />
          <LocationPanel summary={photo.location} detail={locationDetail} />
          <PhotographerPanel photographer={photo.photographer} profile={photographerProfile} />

          <div className="border-t border-line pt-6">
            <p className="text-meta leading-relaxed text-muted">{t('reportCta.intro')}</p>
            <ReportDialog
              subjectType="photograph"
              subjectId={photo.id}
              subjectLabel={t('reportCta.subject', {
                title: photo.title,
                photographer: photo.photographer.displayName,
              })}
              triggerLabel={t('reportCta.trigger')}
              triggerVariant="secondary"
              className="mt-3"
            />
          </div>
        </div>
      </article>

      <RelatedStrip
        sameLocation={sameLocation}
        byPhotographer={byPhotographer}
        locationName={photo.location?.name ?? null}
        photographerName={photo.photographer.displayName}
        className="mt-16 lg:mt-24"
      />
    </div>
  );
}
