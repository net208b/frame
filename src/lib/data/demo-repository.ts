import { MAP_PIN_PHOTOGRAPH_SAMPLE, PAGE_SIZE } from '@/lib/config';
import { distanceMetres } from '@/lib/geo';
import { sortPhotographs } from '@/lib/ranking';
import type {
  Collection,
  CollectionItem,
  DiscoverQuery,
  GearFacets,
  LocationDetail,
  LocationSubmission,
  LocationSummary,
  ModerationAction,
  Paginated,
  PhotographDetail,
  PhotographerProfile,
  PlatformStats,
  Report,
  SuspiciousUpload,
} from '@/types/domain';

import { DEMO_COLLECTIONS } from './demo/collections';
import { DEMO_LOCATIONS } from './demo/locations';
import {
  DEMO_LOCATION_SUBMISSIONS,
  DEMO_MODERATION_ACTIONS,
  DEMO_REPORTS,
  DEMO_SUSPICIOUS_UPLOADS,
} from './demo/moderation';
import { DEMO_PHOTOGRAPHERS } from './demo/photographers';
import { DEMO_PHOTOGRAPHS } from './demo/photographs';

/**
 * The demo implementation of the data repository.
 *
 * It runs entirely in memory so the whole interface — including empty states,
 * filters, pagination and the moderation queues — can be reviewed before any
 * external service exists. Every surface that renders this data also renders a
 * visible demo notice; nothing here is presented as a real platform statistic.
 */

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: safePage,
    pageSize,
    totalCount: items.length,
    hasMore: start + pageSize < items.length,
  };
}

function toSummary(location: LocationDetail): LocationSummary {
  return {
    id: location.id,
    slug: location.slug,
    name: location.name,
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
    photographCount: location.photographCount,
  };
}

/* ------------------------------------------------------------------------ */
/* Discover                                                                  */
/* ------------------------------------------------------------------------ */

export function demoDiscover(query: DiscoverQuery): Paginated<PhotographDetail> {
  let items = [...DEMO_PHOTOGRAPHS];

  if (query.category) {
    items = items.filter((photo) => photo.category === query.category);
  }

  if (query.place) {
    const needle = query.place.trim().toLowerCase();
    if (needle) {
      items = items.filter((photo) => {
        const location = photo.location;
        if (!location) return false;
        return (
          location.name.toLowerCase().includes(needle) ||
          location.city.toLowerCase().includes(needle) ||
          location.country.toLowerCase().includes(needle)
        );
      });
    }
  }

  if (query.cameraBrand) {
    items = items.filter((photo) => photo.capture.cameraBrand === query.cameraBrand);
  }
  if (query.cameraModel) {
    items = items.filter((photo) => photo.capture.cameraModel === query.cameraModel);
  }
  if (query.lensBrand) {
    items = items.filter((photo) => photo.capture.lensBrand === query.lensBrand);
  }

  const sorted = sortPhotographs(items, query.sort);
  return paginate(sorted, query.page, query.pageSize || PAGE_SIZE.gallery);
}

export function demoGearFacets(): GearFacets {
  const count = (pick: (photo: PhotographDetail) => string | null) => {
    const map = new Map<string, number>();
    for (const photo of DEMO_PHOTOGRAPHS) {
      const value = pick(photo);
      if (!value) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, photographCount]) => ({ id: label, label, photographCount }))
      .sort((a, b) => b.photographCount - a.photographCount || a.label.localeCompare(b.label));
  };

  return {
    cameraBrands: count((photo) => photo.capture.cameraBrand),
    cameraModels: count((photo) => photo.capture.cameraModel),
    lensBrands: count((photo) => photo.capture.lensBrand),
  };
}

/* ------------------------------------------------------------------------ */
/* Photographs                                                               */
/* ------------------------------------------------------------------------ */

export function demoPhotograph(slug: string): PhotographDetail | null {
  return DEMO_PHOTOGRAPHS.find((photo) => photo.slug === slug) ?? null;
}

export function demoPhotographSlugs(): string[] {
  return DEMO_PHOTOGRAPHS.map((photo) => photo.slug);
}

export function demoSameLocation(
  locationId: string | null,
  excludePhotographId: string,
  limit = 6,
): PhotographDetail[] {
  if (!locationId) return [];
  return DEMO_PHOTOGRAPHS.filter(
    (photo) => photo.location?.id === locationId && photo.id !== excludePhotographId,
  ).slice(0, limit);
}

export function demoMoreByPhotographer(
  photographerId: string,
  excludePhotographId: string,
  limit = 6,
): PhotographDetail[] {
  return DEMO_PHOTOGRAPHS.filter(
    (photo) => photo.photographer.id === photographerId && photo.id !== excludePhotographId,
  ).slice(0, limit);
}

/* ------------------------------------------------------------------------ */
/* Locations                                                                 */
/* ------------------------------------------------------------------------ */

export function demoLocations(options: { search?: string; page?: number } = {}) {
  let items = [...DEMO_LOCATIONS];
  const search = options.search?.trim().toLowerCase();
  if (search) {
    items = items.filter(
      (location) =>
        location.name.toLowerCase().includes(search) ||
        location.city.toLowerCase().includes(search) ||
        location.country.toLowerCase().includes(search),
    );
  }
  items.sort((a, b) => b.photographCount - a.photographCount || a.name.localeCompare(b.name));
  return paginate(items, options.page ?? 1, PAGE_SIZE.locations);
}

export function demoLocation(slug: string): LocationDetail | null {
  return DEMO_LOCATIONS.find((location) => location.slug === slug) ?? null;
}

export function demoLocationSlugs(): string[] {
  return DEMO_LOCATIONS.map((location) => location.slug);
}

export function demoPhotographsAtLocation(locationId: string): PhotographDetail[] {
  return DEMO_PHOTOGRAPHS.filter((photo) => photo.location?.id === locationId);
}

/** Nearby approved locations, excluding the one being viewed. */
export function demoNearbyLocations(
  location: LocationDetail,
  radiusMetres = 25_000,
  limit = 6,
): Array<LocationSummary & { distanceMetres: number }> {
  if (!location.coordinates) return [];
  const origin = location.coordinates;

  return DEMO_LOCATIONS.filter((item) => item.id !== location.id && item.coordinates)
    .map((item) => ({
      ...toSummary(item),
      distanceMetres: Math.round(distanceMetres(origin, item.coordinates!)),
    }))
    .filter((item) => item.distanceMetres <= radiusMetres)
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, limit);
}

/**
 * A place's newest photographs, newest first, as the live query returns them.
 *
 * The sort is here rather than in `demoPhotographsAtLocation` because the demo
 * fixtures are written in whatever order reads well in the file, while the
 * product rule is that the most recent frame at a place is the one the map puts
 * on top. Demo mode is what the interface is built and reviewed against, so it
 * has to obey the same rule or the stack would be designed against an order
 * production will never produce.
 */
function demoRecentImageUrls(locationId: string): string[] {
  return demoPhotographsAtLocation(locationId)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAP_PIN_PHOTOGRAPH_SAMPLE)
    .map((photo) => photo.image.thumbUrl)
    .filter((url): url is string => Boolean(url));
}

/** Pins for the map page: approved locations that have a publishable point. */
export function demoMapPins() {
  return DEMO_LOCATIONS.filter((location) => location.coordinates).map((location) => ({
    id: location.id,
    slug: location.slug,
    name: location.name,
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
    photographCount: location.photographCount,
    categories: location.categories,
    latitude: location.coordinates!.latitude,
    longitude: location.coordinates!.longitude,
    isApproximate: location.coordinates!.isApproximate,
    previewImageUrl: demoRecentImageUrls(location.id)[0] ?? null,
    recentImageUrls: demoRecentImageUrls(location.id),
  }));
}

export type DemoMapPin = ReturnType<typeof demoMapPins>[number];

/* ------------------------------------------------------------------------ */
/* People                                                                    */
/* ------------------------------------------------------------------------ */

export function demoPhotographer(username: string): PhotographerProfile | null {
  const needle = username.toLowerCase();
  return DEMO_PHOTOGRAPHERS.find((person) => person.username.toLowerCase() === needle) ?? null;
}

export function demoPhotographerUsernames(): string[] {
  return DEMO_PHOTOGRAPHERS.map((person) => person.username);
}

export function demoPortfolio(photographerId: string): PhotographDetail[] {
  return DEMO_PHOTOGRAPHS.filter((photo) => photo.photographer.id === photographerId).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function demoFeaturedPhotographers(limit = 4): PhotographerProfile[] {
  return [...DEMO_PHOTOGRAPHERS]
    .sort((a, b) => b.appreciationsReceived - a.appreciationsReceived)
    .slice(0, limit);
}

/* ------------------------------------------------------------------------ */
/* Collections                                                               */
/* ------------------------------------------------------------------------ */

export function demoCollections(options: { ownerId?: string; includePrivate?: boolean } = {}) {
  return DEMO_COLLECTIONS.filter((collection) => {
    if (options.ownerId && collection.owner.id !== options.ownerId) return false;
    if (collection.visibility === 'private' && !options.includePrivate) return false;
    return true;
  }).map(({ items: _items, ...rest }) => rest satisfies Collection);
}

export function demoCollection(
  slug: string,
  options: { includePrivate?: boolean } = {},
): (Collection & { items: CollectionItem[] }) | null {
  const match = DEMO_COLLECTIONS.find((collection) => collection.slug === slug);
  if (!match) return null;
  if (match.visibility === 'private' && !options.includePrivate) return null;
  return match;
}

export function demoPublicCollectionSlugs(): string[] {
  return DEMO_COLLECTIONS.filter((collection) => collection.visibility === 'public').map(
    (collection) => collection.slug,
  );
}

/* ------------------------------------------------------------------------ */
/* Stats                                                                     */
/* ------------------------------------------------------------------------ */

export function demoStats(): PlatformStats {
  const countries = new Set(DEMO_LOCATIONS.map((location) => location.countryCode));
  return {
    photographs: DEMO_PHOTOGRAPHS.length,
    locations: DEMO_LOCATIONS.length,
    countries: countries.size,
    photographers: DEMO_PHOTOGRAPHERS.length,
    isDemoData: true,
  };
}

/* ------------------------------------------------------------------------ */
/* Moderation queues                                                         */
/* ------------------------------------------------------------------------ */

export function demoModerationQueues(): {
  submissions: LocationSubmission[];
  reports: Report[];
  suspiciousUploads: SuspiciousUpload[];
  recentActions: ModerationAction[];
} {
  return {
    submissions: DEMO_LOCATION_SUBMISSIONS,
    reports: DEMO_REPORTS,
    suspiciousUploads: DEMO_SUSPICIOUS_UPLOADS,
    recentActions: DEMO_MODERATION_ACTIONS,
  };
}

/**
 * Approved locations that sit close enough together to be worth a second look.
 * The real version runs in SQL; this mirrors its behaviour for the demo queue.
 */
export function demoPossibleDuplicateLocations(radiusMetres = 1500) {
  const pairs: Array<{
    a: LocationSummary;
    b: LocationSummary;
    distanceMetres: number;
  }> = [];

  const withPoints = DEMO_LOCATIONS.filter((location) => location.coordinates);
  for (let i = 0; i < withPoints.length; i += 1) {
    for (let j = i + 1; j < withPoints.length; j += 1) {
      const a = withPoints[i]!;
      const b = withPoints[j]!;
      const metres = Math.round(distanceMetres(a.coordinates!, b.coordinates!));
      if (metres <= radiusMetres) {
        pairs.push({ a: toSummary(a), b: toSummary(b), distanceMetres: metres });
      }
    }
  }

  return pairs.sort((x, y) => x.distanceMetres - y.distanceMetres);
}
