import { MAP_PIN_PHOTOGRAPH_SAMPLE, PAGE_SIZE } from '@/lib/config';
import type { CityHub, CityRef, MapPinFrame } from '@/lib/data/repository';
import { distanceMetres } from '@/lib/geo';
import { sortPhotographs } from '@/lib/ranking';
import { STYLE_LANDING_SLUGS, styleFilter } from '@/lib/style-landing';
import { slugify } from '@/lib/utils';
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
  Photobook,
  PhotoSeries,
  PhotoSeriesItem,
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
    translations: location.translations,
  };
}

/* ------------------------------------------------------------------------ */
/* Discover                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * The photographs a Discover view matches, unordered and unpaged.
 *
 * Its own function because two views ask the question: the gallery, which then
 * sorts and slices, and the map, which wants the places behind the whole match
 * rather than behind one page of it. One filter, so the two cannot disagree.
 */
function demoDiscoverMatches(query: DiscoverQuery): PhotographDetail[] {
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

  return items;
}

export function demoDiscover(query: DiscoverQuery): Paginated<PhotographDetail> {
  const sorted = sortPhotographs(demoDiscoverMatches(query), query.sort);
  return paginate(sorted, query.page, query.pageSize || PAGE_SIZE.gallery);
}

/** The same answer from the bundled dataset: which styles have a frame. */
export function demoStyleLandingSlugsWithContent(): string[] {
  return STYLE_LANDING_SLUGS.filter((slug) => {
    const filter = styleFilter(slug);
    return DEMO_PHOTOGRAPHS.some((photo) => photo.category === filter.category);
  });
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

/* ------------------------------------------------------------------------ */
/* Cities                                                                    */
/* ------------------------------------------------------------------------ */

/** The bundled places in one country, grouped by the slug of their city. */
function demoCityGroups(countryCode: string): Map<string, LocationDetail[]> {
  const code = countryCode.trim().toUpperCase();
  const groups = new Map<string, LocationDetail[]>();

  for (const location of DEMO_LOCATIONS) {
    if (location.countryCode.toUpperCase() !== code) continue;
    const citySlug = slugify(location.city);
    if (!citySlug) continue;
    groups.set(citySlug, [...(groups.get(citySlug) ?? []), location]);
  }

  return groups;
}

export function demoCityHub(countryCode: string, citySlug: string): CityHub | null {
  const places = demoCityGroups(countryCode).get(citySlug.trim().toLowerCase());
  const first = places?.at(0);
  if (!places || !first) return null;

  const ids = new Set(places.map((place) => place.id));
  const photographs = DEMO_PHOTOGRAPHS.filter(
    (photo) => photo.location !== null && ids.has(photo.location.id),
  ).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    city: first.city,
    citySlug,
    country: first.country,
    countryCode: first.countryCode,
    locations: places.map(toSummary),
    photographs: photographs.slice(0, PAGE_SIZE.gallery),
    photographCount: places.reduce((total, place) => total + place.photographCount, 0),
  };
}

export function demoCitiesWithContent(): CityRef[] {
  const counts = new Map<string, CityRef & { photographCount: number }>();

  for (const location of DEMO_LOCATIONS) {
    const citySlug = slugify(location.city);
    if (!citySlug) continue;

    const countryCode = location.countryCode.toUpperCase();
    const key = `${countryCode}/${citySlug}`;
    const existing = counts.get(key);

    if (existing) existing.photographCount += location.photographCount;
    else counts.set(key, { countryCode, citySlug, photographCount: location.photographCount });
  }

  return [...counts.values()]
    .filter((entry) => entry.photographCount > 0)
    .map(({ countryCode, citySlug }) => ({ countryCode, citySlug }));
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
  return demoLocationsAround(location.coordinates, location.id, radiusMetres, limit);
}

/** The wizard's "is it one of these?" over the bundled places. */
export function demoLocationsNear(
  point: { latitude: number; longitude: number },
  radiusMetres: number,
  limit: number,
): Array<LocationSummary & { distanceMetres: number }> {
  return demoLocationsAround(point, null, radiusMetres, limit);
}

function demoLocationsAround(
  origin: { latitude: number; longitude: number },
  excludeId: string | null,
  radiusMetres: number,
  limit: number,
): Array<LocationSummary & { distanceMetres: number }> {
  return DEMO_LOCATIONS.filter((item) => item.id !== excludeId && item.coordinates)
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

/** The newest demo frame at a place, for the pin's card. */
function demoLatestFrame(locationId: string): MapPinFrame | null {
  const photo = demoPhotographsAtLocation(locationId)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .find((entry) => Boolean(entry.image.thumbUrl));
  if (!photo) return null;
  return {
    slug: photo.slug,
    title: photo.title,
    category: photo.category,
    appreciationCount: photo.appreciationCount,
    photographer: photo.photographer,
  };
}

/** Where a demo member has photographed. Nobody signs in to the demo, so this
 *  is only ever asked for by a test harness; it answers truthfully anyway. */
export function demoOwnPhotographedLocationIds(photographerId: string): string[] {
  return [
    ...new Set(
      DEMO_PHOTOGRAPHS.filter(
        (photo) => photo.photographer.id === photographerId && photo.location !== null,
      ).map((photo) => photo.location!.id),
    ),
  ];
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
    translations: location.translations,
    categories: location.categories,
    latitude: location.coordinates!.latitude,
    longitude: location.coordinates!.longitude,
    isApproximate: location.coordinates!.isApproximate,
    previewImageUrl: demoRecentImageUrls(location.id)[0] ?? null,
    recentImageUrls: demoRecentImageUrls(location.id),
    latest: demoLatestFrame(location.id),
  }));
}

export type DemoMapPin = ReturnType<typeof demoMapPins>[number];

/** The same answer for a named set of places, from the bundled dataset. */
export function demoMapPinsForLocations(locationIds: readonly string[]): DemoMapPin[] {
  const wanted = new Set(locationIds);
  return demoMapPins().filter((pin) => wanted.has(pin.id));
}

/**
 * The places behind a Discover view.
 *
 * The same answer the live query gives: every place where a matching
 * photograph was made, with the place's own count on the pin. A match with no
 * place contributes no pin, which is why the map can hold fewer frames than
 * the gallery and why the page says so.
 */
export function demoDiscoverMapPins(query: DiscoverQuery): DemoMapPin[] {
  const matched = new Set(
    demoDiscoverMatches(query)
      .map((photo) => photo.location?.id)
      .filter((id): id is string => typeof id === 'string'),
  );
  return demoMapPins().filter((pin) => matched.has(pin.id));
}

/**
 * Pins for one photographer's own map: the places *they* have published from.
 *
 * Built from the photographs rather than from the locations, because that is
 * the question — and because the count has to be theirs. A place where this
 * member has one frame and four other members have ten reads "1" here and "11"
 * on the map page, which is what both sentences mean.
 */
export function demoPhotographerMapPins(photographerId: string): DemoMapPin[] {
  const pins = new Map<string, DemoMapPin>();

  const own = DEMO_PHOTOGRAPHS.filter(
    (photo) => photo.photographer.id === photographerId && photo.location !== null,
  ).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  for (const photo of own) {
    const place = DEMO_LOCATIONS.find((location) => location.id === photo.location!.id);
    if (!place?.coordinates) continue;

    const existing = pins.get(place.id);
    if (existing) {
      existing.photographCount += 1;
      if (existing.recentImageUrls.length < MAP_PIN_PHOTOGRAPH_SAMPLE) {
        existing.recentImageUrls.push(photo.image.thumbUrl);
      }
      continue;
    }

    pins.set(place.id, {
      id: place.id,
      slug: place.slug,
      name: place.name,
      city: place.city,
      country: place.country,
      countryCode: place.countryCode,
      translations: place.translations,
      // Theirs, not the place's.
      photographCount: 1,
      categories: place.categories,
      latitude: place.coordinates.latitude,
      longitude: place.coordinates.longitude,
      isApproximate: place.coordinates.isApproximate,
      previewImageUrl: photo.image.thumbUrl,
      recentImageUrls: [photo.image.thumbUrl],
      latest: {
        slug: photo.slug,
        title: photo.title,
        category: photo.category,
        appreciationCount: photo.appreciationCount,
        photographer: null,
      },
    });
  }

  return [...pins.values()];
}


/* ------------------------------------------------------------------------ */
/* People                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Which demo members have chosen a cover, by the photograph's slug.
 *
 * It lives here rather than on the records in `demo/photographers.ts` because
 * `demo/photographs.ts` imports that file — writing a photograph into a
 * photographer would be a cycle. Resolving it here also means demo mode obeys
 * the live rule rather than restating it: `withCover` looks the slug up among
 * the member's *own published* photographs, which is exactly what the trigger
 * in migration 0017 and the repository's `mapProfileCover` enforce.
 *
 * Deliberately not everybody. Half the demo profiles have a cover and half do
 * not, because both are what the page has to look right with.
 */
const DEMO_COVERS: Record<string, string> = {
  kenjiwatanabe: 'the-street-that-only-exists-after-dark',
  mayachen: 'everything-arriving-at-once',
  annakeller: 'a-wall-made-entirely-of-type',
};

function withCover(person: PhotographerProfile): PhotographerProfile {
  const slug = DEMO_COVERS[person.username];
  if (!slug) return person;

  const photograph = DEMO_PHOTOGRAPHS.find(
    (photo) =>
      photo.slug === slug && photo.photographer.id === person.id && photo.status === 'published',
  );
  if (!photograph) return person;

  return {
    ...person,
    cover: {
      imageUrl: photograph.image.displayUrl,
      altText: photograph.altText,
      slug: photograph.slug,
    },
  };
}

export function demoPhotographer(username: string): PhotographerProfile | null {
  const needle = username.toLowerCase();
  const person = DEMO_PHOTOGRAPHERS.find((entry) => entry.username.toLowerCase() === needle);
  return person ? withCover(person) : null;
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
    .slice(0, limit)
    .map(withCover);
}

/**
 * The directory, newest first — the same ordering the live query uses, so the
 * two modes answer the same question. The bundled dataset carries no join date
 * ordering of its own, so `memberSince` is what it is sorted by.
 */
export function demoPhotographerDirectory(
  page: number,
  pageSize: number,
): Paginated<PhotographerProfile> {
  const ordered = [...DEMO_PHOTOGRAPHERS]
    .sort((a, b) => b.memberSince.localeCompare(a.memberSince))
    .map(withCover);
  return paginate(ordered, page, pageSize);
}

/* ------------------------------------------------------------------------ */
/* Photobooks                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The demo books, each built from its own owner's published photographs — the
 * same rule the trigger in migration 0018 enforces, obeyed rather than
 * restated. There is more than one because the public shelf is a list, and a
 * list of one tells a reader nothing about how it orders itself.
 */
const DEMO_PHOTOBOOKS: Array<Omit<Photobook, 'owner' | 'pages'> & { ownerUsername: string }> = [
  {
    id: 'b00c0001-0000-4000-8000-000000000001',
    slug: 'kenji-after-hours',
    title: 'Shinjuku, After Hours',
    dedication: 'For the streets that stay open.',
    cover: 'linen',
    paper: 'lustre',
    gearMode: 'model',
    gearBrand: 'Fujifilm',
    gearModel: 'X-Pro3',
    visibility: 'public',
    opens: 412,
    position: 1,
    ownerUsername: 'kenjiwatanabe',
    updatedAt: '2026-10-12T09:00:00Z',
  },
  {
    id: 'b00c0001-0000-4000-8000-000000000002',
    slug: 'maya-night-bus',
    title: 'Night Bus',
    dedication: 'Everyone on the last service home.',
    cover: 'film',
    paper: 'matte',
    gearMode: 'brand',
    gearBrand: 'Ricoh',
    gearModel: null,
    visibility: 'public',
    // Ahead of Kenji's deliberately: the shelf leads with its most-opened
    // book, and the lead is the one shown open beside the copy saying a book
    // needs four published frames. Maya has five; Kenji has three.
    opens: 512,
    position: 1,
    ownerUsername: 'mayachen',
    updatedAt: '2026-10-14T20:30:00Z',
  },
  {
    // Maya's second book: the one profile in the demo with more than one
    // spine on the shelf, so the shelf has an order to show.
    id: 'b00c0001-0000-4000-8000-000000000005',
    slug: 'maya-everything-arriving',
    title: 'Everything Arriving at Once',
    dedication: null,
    cover: 'signal',
    paper: 'matte',
    gearMode: 'none',
    gearBrand: null,
    gearModel: null,
    visibility: 'public',
    opens: 96,
    position: 2,
    ownerUsername: 'mayachen',
    updatedAt: '2026-10-18T09:15:00Z',
  },
  {
    id: 'b00c0001-0000-4000-8000-000000000003',
    slug: 'marco-six-in-the-morning',
    title: 'Six in the Morning',
    dedication: null,
    cover: 'kraft',
    paper: 'fineart',
    gearMode: 'model',
    gearBrand: 'Leica',
    gearModel: 'M6',
    visibility: 'public',
    opens: 143,
    position: 1,
    ownerUsername: 'marcosilva',
    updatedAt: '2026-10-15T06:10:00Z',
  },
  {
    // Unlisted on purpose: it must never appear on the public shelf, which is
    // the one thing the shelf's filter has to get right.
    id: 'b00c0001-0000-4000-8000-000000000004',
    slug: 'anna-rain-on-sheet-glass',
    title: 'Rain on Sheet Glass',
    dedication: 'Kept for myself, for now.',
    cover: 'gallery',
    paper: 'lustre',
    gearMode: 'none',
    gearBrand: null,
    gearModel: null,
    visibility: 'unlisted',
    opens: 31,
    position: 1,
    ownerUsername: 'annakeller',
    updatedAt: '2026-10-16T11:45:00Z',
  },
];

function demoAssemblePhotobook(book: (typeof DEMO_PHOTOBOOKS)[number]): Photobook | null {
  const owner = DEMO_PHOTOGRAPHERS.find((person) => person.username === book.ownerUsername);
  if (!owner) return null;
  const { ownerUsername: _ownerUsername, ...rest } = book;
  const pages = DEMO_PHOTOGRAPHS.filter(
    (photo) => photo.photographer.id === owner.id && photo.status === 'published',
  )
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .map((photograph, index) => ({ position: index + 1, photograph }));
  return { ...rest, owner, pages };
}

export function demoPhotobook(slug: string): Photobook | null {
  const book = DEMO_PHOTOBOOKS.find((entry) => entry.slug === slug);
  return book ? demoAssemblePhotobook(book) : null;
}

/** Public books only, most-opened first — the same order the live shelf uses. */
export function demoPublicPhotobooks(limit: number): Photobook[] {
  return DEMO_PHOTOBOOKS.filter((book) => book.visibility === 'public')
    .map(demoAssemblePhotobook)
    .filter((book): book is Photobook => book !== null)
    .sort((a, b) => b.opens - a.opens || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** The whole shelf, public and unlisted, in the owner's order. */
export function demoPhotobooksByOwner(ownerId: string): Photobook[] {
  const owner = DEMO_PHOTOGRAPHERS.find((person) => person.id === ownerId);
  if (!owner) return [];
  return DEMO_PHOTOBOOKS.filter((entry) => entry.ownerUsername === owner.username)
    .map(demoAssemblePhotobook)
    .filter((book): book is Photobook => book !== null)
    .sort((a, b) => a.position - b.position || a.updatedAt.localeCompare(b.updatedAt));
}

/* ------------------------------------------------------------------------ */
/* Photo series                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Two demo series: one public, one unlisted — the unlisted one is there so the
 * profile tab can be checked for never showing it to a visitor.
 */
const DEMO_SERIES: Array<
  Omit<PhotoSeries, 'owner' | 'items' | 'cover'> & {
    ownerUsername: string;
    photographNumbers: number[];
    captions: Array<string | null>;
    coverNumber: number | null;
  }
> = [
  {
    id: '5e71e5e5-0000-4000-8000-000000000001',
    slug: 'maya-the-last-service-home',
    title: 'The Last Service Home',
    standfirst: 'Five frames from the night bus, between the depot and the river.',
    body:
      'The last service leaves at ten past midnight and nobody on it is going anywhere they want to be. I rode it for a month before I took a single frame, because the bus is small and a camera is loud.\n\nWhat I found was not the passengers, in the end, but the windows: the city arriving in reflection a second before it arrived in fact.\n\nThese five are in the order the route runs. The last one is the stop where I get off.',
    visibility: 'public',
    opens: 188,
    ownerUsername: 'mayachen',
    photographNumbers: [5, 6, 7, 8, 20],
    captions: ['Looking up, because everybody else was looking down.', null, 'The island at the end of the day.', 'Everything arriving at once.', null],
    coverNumber: 8,
    updatedAt: '2026-10-17T22:10:00Z',
  },
  {
    id: '5e71e5e5-0000-4000-8000-000000000002',
    slug: 'kenji-three-corners',
    title: 'Three Corners',
    standfirst: null,
    body: 'Kept for myself, for now.',
    visibility: 'unlisted',
    opens: 4,
    ownerUsername: 'kenjiwatanabe',
    photographNumbers: [1, 2, 3],
    captions: [null, null, null],
    coverNumber: null,
    updatedAt: '2026-10-19T08:00:00Z',
  },
];

const demoPhotoId = (n: number) => `c3e7a200-0000-4000-8000-${String(n).padStart(12, '0')}`;

function demoAssembleSeries(entry: (typeof DEMO_SERIES)[number]): PhotoSeries | null {
  const owner = DEMO_PHOTOGRAPHERS.find((person) => person.username === entry.ownerUsername);
  if (!owner) return null;
  const { ownerUsername: _o, photographNumbers, captions, coverNumber, ...rest } = entry;
  const items = photographNumbers
    .map((n, index) => {
      const photograph = DEMO_PHOTOGRAPHS.find((photo) => photo.id === demoPhotoId(n) && photo.status === 'published');
      return photograph ? { position: index + 1, photograph, caption: captions[index] ?? null } : null;
    })
    .filter((item): item is PhotoSeriesItem => item !== null);
  const cover =
    (coverNumber !== null && items.find((item) => item.photograph.id === demoPhotoId(coverNumber))?.photograph) ||
    items[0]?.photograph ||
    null;
  return { ...rest, owner, items, cover };
}

export function demoSeries(slug: string): PhotoSeries | null {
  const entry = DEMO_SERIES.find((candidate) => candidate.slug === slug);
  return entry ? demoAssembleSeries(entry) : null;
}

export function demoSeriesByOwner(ownerId: string): PhotoSeries[] {
  const owner = DEMO_PHOTOGRAPHERS.find((person) => person.id === ownerId);
  if (!owner) return [];
  return DEMO_SERIES.filter((entry) => entry.ownerUsername === owner.username)
    .map(demoAssembleSeries)
    .filter((series): series is PhotoSeries => series !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
