import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { PAGE_SIZE } from '@/lib/config';
import { getDiscoverFeed, normaliseDiscoverQuery } from '@/lib/data/repository';
import { buildDiscoverHref } from '@/lib/discover-query';
import { buildMetadata } from '@/lib/seo';
import { isStyleLandingSlug, styleFilter, type StyleLandingSlug } from '@/lib/style-landing';

/**
 * One style, as a page rather than as a filter.
 *
 * Every filtered Discover view is `noIndex` — thousands of near-identical URLs
 * are no help to anybody searching. That left nothing rankable between the home
 * page and one photograph. This is that missing middle: a real document, with
 * its own title, description, canonical and `hreflang`, about one way of
 * shooting.
 *
 * It is NOT a second gallery. It shows the newest frames in the style and then
 * hands the reader to `/discover`, which is where filtering, ordering and
 * paging live. One page, one canonical address, no pagination to generate a
 * second URL for the same subject — see `lib/style-landing.ts` for what a style
 * is here and, more importantly, for what it is not.
 */

/**
 * Rendered on demand, never prerendered — the same reason as every other route
 * with a dynamic segment here: the feed is read through the cookie-bound
 * Supabase client, so row-level security answers as whoever is reading, and a
 * cached render may not read cookies.
 *
 * Also listed in `scripts/assert-dynamic-routes.sh`, whose list is hard-coded
 * rather than scanned: a route added here and not there is unguarded.
 */
export const dynamic = 'force-dynamic';

type StyleParams = LocaleParams<{ style: string }>;

/** The slug, narrowed, or 404. Shared by the metadata and the page. */
async function readStyleParams(params: StyleParams): Promise<{
  locale: Awaited<ReturnType<typeof readLocaleParams<{ style: string }>>>['locale'];
  style: StyleLandingSlug;
}> {
  const { locale, style } = await readLocaleParams(params);
  if (!isStyleLandingSlug(style)) notFound();
  return { locale, style };
}

/** The newest frames in a style: the whole of this page's content. */
async function styleFeed(style: StyleLandingSlug) {
  const filter = styleFilter(style);

  return getDiscoverFeed(
    normaliseDiscoverQuery({
      category: filter.category,
      sort: 'recent',
      page: 1,
      pageSize: PAGE_SIZE.gallery,
    }),
  );
}

export async function generateMetadata({ params }: { params: StyleParams }): Promise<Metadata> {
  const { locale, style } = await readStyleParams(params);
  const t = await getTranslations({ locale, namespace: 'discover' });

  const feed = await styleFeed(style);
  const lead = feed.items.at(0);

  return buildMetadata({
    locale,
    title: t(`style.pages.${style}.metaTitle`),
    description: t(`style.pages.${style}.metaDescription`),
    path: `/discover/style/${style}`,
    // The newest frame in the style is the share card, which is the honest
    // picture of what the page holds. A style with nothing in it shares FRAME's
    // own card instead of pretending to a photograph.
    image: lead ? { url: lead.image.displayUrl, alt: lead.altText } : null,
    // The one page on Discover that asks to be indexed — except when it would
    // be inviting a crawler to an empty room. `getStyleSlugsWithContent` keeps
    // the same page out of the sitemap, so the two agree.
    noIndex: feed.items.length === 0,
  });
}

export default async function StyleLandingPage({ params }: { params: StyleParams }) {
  const { locale, style } = await readStyleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'discover' });
  const filter = styleFilter(style);
  const feed = await styleFeed(style);

  // Where the reader goes next: the same set, in the tool that can narrow it
  // further, and the map of it. Both are ordinary Discover addresses, so
  // nothing here is a surface of its own.
  const galleryHref = buildDiscoverHref({ category: filter.category, page: 1 });
  const mapHref = buildDiscoverHref({ category: filter.category, page: 1, view: 'map' });

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>{t('style.eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">{t(`style.pages.${style}.heading`)}</h1>
        <p className="mt-4 text-lead text-muted">{t(`style.pages.${style}.lead`)}</p>
      </header>

      {feed.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={t('style.empty.title')}
          description={t('style.empty.body')}
          action={
            <Button asChild variant="secondary">
              <Link href="/discover">{t('style.empty.action')}</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="style-frames-heading" className="mt-10">
          <h2 id="style-frames-heading" className="sr-only">
            {t('style.framesHeading')}
          </h2>

          <MasonryGallery photos={feed.items} priorityCount={4} />

          {/* Paging belongs to /discover, which is also where this view can be
              narrowed further or drawn as a map. Keeping both as links rather
              than rebuilding them here is what keeps this one page, with one
              address, about one subject. */}
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary">
              <Link href={galleryHref}>{t('style.openGallery')}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={mapHref}>{t('style.openMap')}</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
