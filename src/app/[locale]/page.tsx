import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CommunityCta } from '@/components/home/CommunityCta';
import { CuratedGallery } from '@/components/home/CuratedGallery';
import { FeaturedPhotographers } from '@/components/home/FeaturedPhotographers';
import { FromTheEditors } from '@/components/home/FromTheEditors';
import { CityMap } from '@/components/home/CityMap';
import { Hero } from '@/components/home/Hero';
import { LatestWorldwide } from '@/components/home/LatestWorldwide';
import { PlatformStatsRow } from '@/components/home/PlatformStatsRow';
import { TrendingLocations } from '@/components/home/TrendingLocations';
import { getViewer } from '@/lib/auth';
import { SITE } from '@/lib/config';
import {
  getDiscoverFeed,
  getOwnPhotographedLocationIds,
  getFeature,
  getFeaturedPhotographers,
  getFeatures,
  getLocations,
  getMapPins,
  getPlatformStats,
  normaliseDiscoverQuery,
} from '@/lib/data/repository';
import { visitorPlace } from '@/lib/geo/visitor';
import { buildMetadata, siteJsonLd } from '@/lib/seo';

/** How many editor-picked frames the curated gallery shows. */
const CURATED_SIZE = 8;
/** The newest frames from anywhere, the first gallery a visitor meets. */
const LATEST_SIZE = 12;
const TRENDING_LOCATION_COUNT = 3;
/** The opening band only needs a handful of pins; /map carries the full set. */
const CITY_MAP_PINS = 12;
const FEATURED_PHOTOGRAPHER_COUNT = 4;

/**
 * The title stays in English in both languages: it is the product name and the
 * tagline, and neither is translated anywhere in FRAME. The description is
 * prose about what the site is, so it is translated — see `home.meta`.
 */
const HOME_TITLE = `${SITE.name} — ${SITE.titleTagline}`;

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

  const [editorsPicks, latest, stats, photographers, locationPage, pins, viewer, place, t] =
    await Promise.all([
      getDiscoverFeed(normaliseDiscoverQuery({ sort: 'editors', pageSize: CURATED_SIZE })),
      getDiscoverFeed(normaliseDiscoverQuery({ sort: 'recent', pageSize: LATEST_SIZE })),
      getPlatformStats(),
      getFeaturedPhotographers(FEATURED_PHOTOGRAPHER_COUNT),
      getLocations({ page: 1 }),
      getMapPins(),
      getViewer(),
      // Reads the request's geolocation headers, which makes this page vary by
      // reader. It already did: `getViewer()` reads the session cookie, so the
      // page was rendered on demand before this and nothing about its caching
      // changes here.
      visitorPlace(),
      getTranslations({ locale, namespace: 'home' }),
    ]);

  // The newest published feature, read in full for its first photographs. A
  // draft never reaches here: staff browsing the home page would otherwise
  // see their own work in progress presented as published.
  const latestPublished = (await getFeatures(6)).find((feature) => feature.status === 'published');
  const latestFeature = latestPublished ? await getFeature(latestPublished.slug) : null;

  // "<" escaped for the same reason as on the photograph page: a description
  // containing "</script>" must not end the block early.
  const jsonLd = JSON.stringify(siteJsonLd(locale, t('meta.description'))).replace(/</g, '\\u003c');

  // A signed-in member's own places, for the lit ring on their map pins.
  const ownLocationIds = viewer ? await getOwnPhotographedLocationIds(viewer.id) : [];

  // The hero's globe lights the countries FRAME has approved places in. The
  // pin read already carries every approved place with a publishable point,
  // so this is a count over it rather than a query of its own.
  const placesByCountry: Record<string, number> = {};
  for (const pin of pins) {
    const code = pin.countryCode.toUpperCase();
    placesByCountry[code] = (placesByCountry[code] ?? 0) + 1;
  }

  // Nothing on the page shows an editor's pick twice any more: the hero holds
  // the globe, not a photograph, so the gallery lists every pick.
  const curated = editorsPicks.items;

  // The map-pin read already resolved a thumbnail per place, so the location
  // row reuses it instead of asking for one image per card.
  const previewImageByLocationId: Record<string, string | null> = {};
  for (const pin of pins) previewImageByLocationId[pin.id] = pin.previewImageUrl;

  return (
    <div className="site-container pb-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Hero
        globe={{ placesByCountry, visitorCountry: place.countryCode }}
        signedIn={viewer !== null}
        locale={locale}
      />

      {/* Second on the page, not last. The map is the one thing FRAME can show
          a first-time reader before anybody has uploaded anything — their own
          city — and the sections below it are all empty until somebody has. */}
      <CityMap
        pins={pins.slice(0, CITY_MAP_PINS)}
        ownLocationIds={ownLocationIds}
        totalPinCount={pins.length}
        place={place}
        signedIn={viewer !== null}
        locale={locale}
      />

      <PlatformStatsRow stats={stats} locale={locale} className="mt-9" />

      {/* Newest first, from anywhere: what the community is doing now, before
          what the editors chose. */}
      <LatestWorldwide photos={latest.items} locale={locale} />

      <CuratedGallery photos={curated} locale={locale} />

      <FromTheEditors feature={latestFeature} locale={locale} />

      <TrendingLocations
        locations={locationPage.items.slice(0, TRENDING_LOCATION_COUNT)}
        previewImageByLocationId={previewImageByLocationId}
        locale={locale}
      />

      <FeaturedPhotographers photographers={photographers} locale={locale} />

      <CommunityCta signedIn={viewer !== null} locale={locale} />
    </div>
  );
}
