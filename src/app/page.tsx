import type { Metadata } from 'next';

import { CommunityCta } from '@/components/home/CommunityCta';
import { CuratedGallery } from '@/components/home/CuratedGallery';
import { FeaturedPhotographers } from '@/components/home/FeaturedPhotographers';
import { Hero } from '@/components/home/Hero';
import { MapTeaser } from '@/components/home/MapTeaser';
import { PlatformStatsRow } from '@/components/home/PlatformStatsRow';
import { TrendingLocations } from '@/components/home/TrendingLocations';
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

const HOME_TITLE = `${SITE.name} — ${SITE.tagline}`;

export const metadata: Metadata = {
  ...buildMetadata({ title: HOME_TITLE, description: SITE.description, path: '/' }),
  // The root layout appends "· FRAME" to every page title. This one already
  // carries the brand, so it opts out of the template.
  title: { absolute: HOME_TITLE },
};

export default async function HomePage() {
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
  // rather than calling everything "featured".
  const trendingCover = trending.items[0] ?? null;
  const cover = trendingCover ?? editorsPicks.items[0] ?? null;
  const coverPool = trendingCover ? trending.items : editorsPicks.items;
  const coverEyebrow = trendingCover ? 'Trending now' : 'Editor’s pick';
  const coverNote = trendingCover
    ? `Ranked first of the ${coverPool.length} photographs currently trending`
    : `The first of ${coverPool.length} photographs chosen by FRAME editors`;

  // The cover already gives one frame the largest presence on the page, so the
  // gallery below drops it rather than printing the same photograph twice. The
  // fallback matters: with a single pick that is also the cover, filtering would
  // otherwise leave an “no picks yet” state that is not true.
  const withoutCover = editorsPicks.items.filter((photo) => photo.id !== cover?.id);
  const curated = withoutCover.length > 0 ? withoutCover : editorsPicks.items;

  // The map-pin read already resolved a thumbnail per place, so the location
  // row reuses it instead of asking for one image per card.
  const previewImageByLocationId: Record<string, string | null> = {};
  for (const pin of pins) previewImageByLocationId[pin.id] = pin.previewImageUrl;

  return (
    <div className="site-container pb-4">
      <Hero
        featured={cover}
        featuredEyebrow={coverEyebrow}
        featuredIndex={cover ? { position: 1, total: coverPool.length, note: coverNote } : null}
        signedIn={viewer !== null}
      />

      <PlatformStatsRow stats={stats} className="mt-9" />

      <CuratedGallery photos={curated} />

      <TrendingLocations
        locations={locationPage.items.slice(0, TRENDING_LOCATION_COUNT)}
        previewImageByLocationId={previewImageByLocationId}
      />

      <FeaturedPhotographers photographers={photographers} />

      <MapTeaser pins={pins.slice(0, MAP_TEASER_PINS)} totalPinCount={pins.length} />

      <CommunityCta signedIn={viewer !== null} />
    </div>
  );
}
