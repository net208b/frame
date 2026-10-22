import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CaptureSpecs } from '@/components/photo-detail/CaptureSpecs';
import { CommentThread } from '@/components/photo-detail/CommentThread';
import { DeletePhotograph } from '@/components/photo-detail/DeletePhotograph';
import { EditorsPickControl } from '@/components/features/EditorsPickControl';
import { EditingNotes } from '@/components/photo-detail/EditingNotes';
import { LocationPanel } from '@/components/photo-detail/LocationPanel';
import { PhotoHeadline } from '@/components/photo-detail/PhotoHeadline';
import { PhotographerPanel } from '@/components/photo-detail/PhotographerPanel';
import { PhotoStage } from '@/components/photo-detail/PhotoStage';
import { translatedText } from '@/lib/translation/applies';
import { RelatedStrip } from '@/components/photo-detail/RelatedStrip';
import { ReportDialog } from '@/components/system/ReportDialog';
import { Notice } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { getViewer, isModerator } from '@/lib/auth';
import {
  getLocation,
  getMoreByPhotographer,
  getPhotograph,
  getPhotographer,
  getPhotographsAtSameLocation,
  getPhotographThread,
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
 * Rendered on demand, never prerendered.
 *
 * Every read in this route goes through the cookie-bound Supabase client, so
 * row-level security answers as whoever is reading rather than as the public.
 * That makes `cookies()` part of loading the page, whether or not anything on
 * it differs between two viewers.
 *
 * A dynamic segment with `generateStaticParams` serves an address that was not
 * in that list by rendering it once and caching the result, and a cached
 * render may not read cookies — Next.js raises DYNAMIC_SERVER_USAGE and the
 * request becomes a 500. Which is to say: with a database behind it, this page
 * returned 500 for anything published since the last deployment, and a
 * missing photograph returned 500 instead of its not-found page.
 *
 * So the route says plainly that it is dynamic, and `generateStaticParams` is
 * gone rather than left to look like it still prerenders something. Putting it
 * back without first moving the per-viewer parts behind their own boundary
 * brings the 500 back with it.
 */
export const dynamic = 'force-dynamic';

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

  // The tab, the search result and the link preview are the page in the
  // reader's language, so they read the same words the page does. A Thai title
  // on an English result is the reader being told this page is in Thai when it
  // is not (0035); with no translation on file these are the original.
  const title = translatedText(photo.title, photo.translations.title, locale);
  const altText = translatedText(photo.altText, photo.translations.altText, locale);
  // The description the photographer wrote reads better than anything derived
  // from it; the alt text is the honest fallback because it is always present.
  const written = photo.description
    ? translatedText(photo.description, photo.translations.description, locale)
    : altText;
  const excerpt = endWithStop(truncate(written, 150));
  const credit = place
    ? t('meta.creditWithPlace', { place, photographer: photo.photographer.displayName })
    : t('meta.credit', { photographer: photo.photographer.displayName });

  return buildMetadata({
    title: place ? `${title} — ${place}` : title,
    // A space joins the two sentences in both languages: Thai writes no full
    // stop, so the space is the sentence break rather than a gap after one.
    description: `${excerpt} ${credit}`,
    path: `/photographs/${photo.slug}`,
    locale,
    image: { url: photo.image.displayUrl, alt: altText },
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

  // Authorisation on the server, every time. Row-level security already hands
  // an unpublished row only to its owner and to moderators, so for anyone
  // else `photo` is null above; this is the check that stays correct if that
  // ever stops being so, and hiding the page in the UI would not be one.
  const isOwner = viewer !== null && viewer.id === photo.photographer.id;
  if (photo.status !== 'published' && !isOwner && !isModerator(viewer)) notFound();

  const [sameLocation, byPhotographer, locationDetail, photographerProfile, thread] =
    await Promise.all([
      getPhotographsAtSameLocation(photo.location?.id ?? null, photo.id),
      getMoreByPhotographer(photo.photographer.id, photo.id),
      photo.location ? getLocation(photo.location.slug) : Promise.resolve(null),
      getPhotographer(photo.photographer.username),
      // Comments live only under a published photograph; a draft or a removed
      // frame has none, so there is nothing to read for one.
      photo.status === 'published'
        ? getPhotographThread(photo.id)
        : Promise.resolve({ comments: [], count: 0 }),
    ]);

  const statusKey = STATUS_NOTE_KEY[photo.status];

  // The place's name in the reader's language, used wherever this page names
  // it as a label: the breadcrumb, the caption under the frame and the heading
  // over the related frames. A place name has no room beside it for the
  // "translated automatically" note, so it takes the reader's language the way
  // alt text does — and the place's own page still shows it as written, with
  // the note and the toggle (0035).
  const placeName = photo.location
    ? translatedText(photo.location.name, photo.location.translations.name, locale)
    : null;
  const place = photo.location
    ? `${placeName} · ${photo.location.city}, ${photo.location.country}`
    : null;

  // The same for the title, for the places this page uses it as a label rather
  // than as the frame's heading. `PhotoHeadline` is the heading and keeps the
  // block, the note and the toggle; the breadcrumb above it and the caption
  // under the frame would read as a different page's if they stayed Thai while
  // the h1 beneath them read English.
  const title = translatedText(photo.title, photo.translations.title, locale);
  const altText = translatedText(photo.altText, photo.translations.altText, locale);

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
                  {placeName}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink-soft">
            {title}
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
          // Alt text is an attribute, so there is no room beside it for a note
          // and a toggle: a screen reader simply gets the description in the
          // reader's own language when one exists (0035).
          altText={altText}
          title={title}
          caption={place}
        />

        <div className="min-w-0 space-y-11">
          <PhotoHeadline photo={photo} />
          <CaptureSpecs capture={photo.capture} />
          <EditingNotes editing={photo.editing} capturedAt={photo.capturedAt} />
          <LocationPanel summary={photo.location} detail={locationDetail} />
          <PhotographerPanel photographer={photo.photographer} profile={photographerProfile} />

          {/* The editors' lever, for staff on a published frame — the same two
              things set_editors_pick() checks. */}
          {isModerator(viewer) && photo.status === 'published' ? (
            <div className="border-t border-line pt-6">
              <EditorsPickControl photographId={photo.id} slug={photo.slug} picked={photo.editorsPick} />
            </div>
          ) : null}

          {/* The owner manages their own work here; reporting it is for everyone else. */}
          {isOwner ? (
            <div className="border-t border-line pt-6">
              <DeletePhotograph
                photographId={photo.id}
                title={photo.title}
                ownerUsername={photo.photographer.username}
              />
            </div>
          ) : (
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
          )}
        </div>
      </article>

      {photo.status === 'published' ? (
        <CommentThread
          photographId={photo.id}
          slug={photo.slug}
          photographTitle={photo.title}
          thread={thread}
          viewer={
            viewer
              ? { id: viewer.id, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl }
              : null
          }
          isOwner={isOwner}
          isModerator={isModerator(viewer)}
          ownerCritique={photographerProfile?.critique ?? null}
          ownerName={photo.photographer.displayName}
        />
      ) : null}

      <RelatedStrip
        sameLocation={sameLocation}
        byPhotographer={byPhotographer}
        locationName={placeName}
        photographerName={photo.photographer.displayName}
        className="mt-16 lg:mt-24"
      />
    </div>
  );
}
