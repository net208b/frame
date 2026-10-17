import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CommunityCta } from '@/components/home/CommunityCta';
import { CuratedGallery } from '@/components/home/CuratedGallery';
import { FeaturedPhotographers } from '@/components/home/FeaturedPhotographers';
import { Hero, type HeroCover } from '@/components/home/Hero';
import { MapTeaser } from '@/components/home/MapTeaser';
import { PlatformStatsRow } from '@/components/home/PlatformStatsRow';
import { TrendingLocations } from '@/components/home/TrendingLocations';
import type { Locale } from '@/i18n/locales';
import { getViewer } from '@/lib/auth';
import { SITE } from '@/lib/config';
import {
  getDiscoverFeed,
  getFeaturedPhotographers,
  getLocations,
  getMapPins,
  getPlatformStats,
  normaliseDiscoverQuery,
} from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';

/** How many editor-picked frames the curated gallery shows. */
const CURATED_SIZE = 8;
/** The pool the cover frame is chosen from, and the denominator of its pill. */
const COVER_POOL_SIZE = 8;
const TRENDING_LOCATION_COUNT = 3;
/** A teaser only needs a handful of pins; /map carries the full set. */
const MAP_TEASER_PINS = 12;
const FEATURED_PHOTOGRAPHER_COUNT = 4;

/**
 * The title stays in English in both languages: it is the product name and the
 * tagline, and neither is translated anywhere in FRAME. The description is
 * prose about what the site is, so it is translated — see `home.meta`.
 */
const HOME_TITLE = `${SITE.name} — ${SITE.tagline}`;

interface HomePageProps {
  params: LocaleParams;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'home' });

  return {
    ...buildMetadata({
      title: HOME_TITLE,
      description: t('meta.description'),
      path: '/',
      locale,
    }),
    // The locale layout appends "· FRAME" to every page title. This one already
    // carries the brand, so it opts out of the template.
    title: { absolute: HOME_TITLE },
  };
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const [editorsPicks, trending, stats, photographers, locationPage, pins, viewer] =
    await Promise.all([
      getDiscoverFeed(normaliseDiscoverQuery({ sort: 'editors', pageSize: CURATED_SIZE })),
      getDiscoverFeed(normaliseDiscoverQuery({ sort: 'trending', pageSize: COVER_POOL_SIZE })),
      getPlatformStats(),
      getFeaturedPhotographers(FEATURED_PHOTOGRAPHER_COUNT),
      getLocations({ page: 1 }),
      getMapPins(),
      getViewer(),
    ]);

  // The cover frame is the leading trending photograph, so the opening spread
  // reflects what the community is appreciating now. An editor's pick stands in
  // when nothing is trending yet, and the caption says which of the two it is
  // rather than calling everything "featured". Which set it came from is all
  // this page decides; the sentence for each case lives in the catalogue.
  const trendingCover = trending.items[0] ?? null;
  const coverPhoto = trendingCover ?? editorsPicks.items[0] ?? null;
  const coverPool = trendingCover ? trending.items : editorsPicks.items;

  const cover: HeroCover | null = coverPhoto
    ? {
        photo: coverPhoto,
        kind: trendingCover ? 'trending' : 'editors',
        position: 1,
        total: coverPool.length,
      }
    : null;

  // The cover already gives one frame the largest presence on the page, so the
  // gallery below drops it rather than printing the same photograph twice. The
  // fallback matters: with a single pick that is also the cover, filtering would
  // otherwise leave an “no picks yet” state that is not true.
  const withoutCover = editorsPicks.items.filter((photo) => photo.id !== coverPhoto?.id);
  const curated = withoutCover.length > 0 ? withoutCover : editorsPicks.items;

  // The map-pin read already resolved a thumbnail per place, so the location
  // row reuses it instead of asking for one image per card.
  const previewImageByLocationId: Record<string, string | null> = {};
  for (const pin of pins) previewImageByLocationId[pin.id] = pin.previewImageUrl;

  return (
    <div className="site-container pb-4">
      <Hero cover={cover} signedIn={viewer !== null} locale={locale} />

      <PlatformStatsRow stats={stats} locale={locale} className="mt-9" />

      <CuratedGallery photos={curated} locale={locale} />

      <TrendingLocations
        locations={locationPage.items.slice(0, TRENDING_LOCATION_COUNT)}
        previewImageByLocationId={previewImageByLocationId}
        locale={locale}
      />

      <FeaturedPhotographers photographers={photographers} locale={locale} />

      <MapTeaser pins={pins.slice(0, MAP_TEASER_PINS)} totalPinCount={pins.length} locale={locale} />

      <CommunityCta signedIn={viewer !== null} locale={locale} />
    </div>
  );
}
