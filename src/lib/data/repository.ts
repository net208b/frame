import { isDatabaseConfigured, PAGE_SIZE } from '@/lib/config';
import type {
  Collection,
  CollectionItem,
  DiscoverQuery,
  GearFacets,
  LocationDetail,
  LocationSummary,
  ModerationAction,
  Paginated,
  PhotographDetail,
  PhotographerProfile,
  PlatformStats,
  Report,
  LocationSubmission,
  StaffMember,
  SuspiciousUpload,
  Photobook,
} from '@/types/domain';

import * as demo from './demo-repository';
import * as live from './supabase-repository';

/**
 * The single read API the UI depends on.
 *
 * Which implementation answers is decided by configuration, not by a flag
 * somebody can forget to flip: with Supabase credentials present the live
 * queries run, and without them the bundled demo dataset answers instead. No
 * component imports either implementation directly.
 */

function useLive(): boolean {
  return isDatabaseConfigured();
}

/* ------------------------------------------------------------------------ */
/* Discover                                                                  */
/* ------------------------------------------------------------------------ */

export function normaliseDiscoverQuery(input: Partial<DiscoverQuery>): DiscoverQuery {
  return {
    category: input.category ?? null,
    place: input.place ?? null,
    cameraBrand: input.cameraBrand ?? null,
    cameraModel: input.cameraModel ?? null,
    lensBrand: input.lensBrand ?? null,
    sort: input.sort ?? 'recent',
    page: Math.max(1, input.page ?? 1),
    pageSize: input.pageSize ?? PAGE_SIZE.gallery,
  };
}

export async function getDiscoverFeed(
  query: DiscoverQuery,
): Promise<Paginated<PhotographDetail>> {
  if (useLive()) return live.discoverFeed(query);
  return demo.demoDiscover(query);
}

export async function getGearFacets(): Promise<GearFacets> {
  if (useLive()) return live.gearFacets();
  return demo.demoGearFacets();
}

/* ------------------------------------------------------------------------ */
/* Photographs                                                               */
/* ------------------------------------------------------------------------ */

export async function getPhotograph(slug: string): Promise<PhotographDetail | null> {
  if (useLive()) return live.photographBySlug(slug);
  return demo.demoPhotograph(slug);
}

export async function getPhotographsAtSameLocation(
  locationId: string | null,
  excludePhotographId: string,
): Promise<PhotographDetail[]> {
  if (useLive()) return live.photographsAtLocation(locationId, excludePhotographId);
  return demo.demoSameLocation(locationId, excludePhotographId);
}

export async function getMoreByPhotographer(
  photographerId: string,
  excludePhotographId: string,
): Promise<PhotographDetail[]> {
  if (useLive()) return live.morePhotographsBy(photographerId, excludePhotographId);
  return demo.demoMoreByPhotographer(photographerId, excludePhotographId);
}

/** Slugs for static generation and the sitemap. Published photographs only. */
export async function getPhotographSlugs(): Promise<string[]> {
  if (useLive()) return live.publishedPhotographSlugs();
  return demo.demoPhotographSlugs();
}

/* ------------------------------------------------------------------------ */
/* Locations                                                                 */
/* ------------------------------------------------------------------------ */

export async function getLocations(options: { search?: string; page?: number } = {}) {
  if (useLive()) return live.locations(options);
  return demo.demoLocations(options);
}

export async function getLocation(slug: string): Promise<LocationDetail | null> {
  if (useLive()) return live.locationBySlug(slug);
  return demo.demoLocation(slug);
}

export async function getPhotographsAt(locationId: string): Promise<PhotographDetail[]> {
  if (useLive()) return live.photographsAtLocation(locationId, '');
  return demo.demoPhotographsAtLocation(locationId);
}

export async function getNearbyLocations(
  location: LocationDetail,
): Promise<Array<LocationSummary & { distanceMetres: number }>> {
  if (useLive()) return live.nearbyLocations(location);
  return demo.demoNearbyLocations(location);
}

export interface MapPin {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  photographCount: number;
  categories: LocationDetail['categories'];
  latitude: number;
  longitude: number;
  isApproximate: boolean;
  /**
   * The newest published photograph made at this place, or null. The same URL
   * as `recentImageUrls[0]`, kept because the location card, the trending row
   * and the location index all want exactly one image and nothing more.
   */
  previewImageUrl: string | null;
  /**
   * Up to {@link MAP_PIN_PHOTOGRAPH_SAMPLE} of the place's published
   * photographs, **newest first**.
   *
   * The order is the product rule, not an implementation detail: when several
   * members have photographed the same place, the map shows the most recent
   * one on top. It is the order the query asks the database for, so the pin and
   * the place's own page agree about which frame is the latest.
   */
  recentImageUrls: string[];
}



export async function getMapPins(): Promise<MapPin[]> {
  if (useLive()) return live.mapPins();
  return demo.demoMapPins();
}

/**
 * One photographer's footprints: every place they have published a frame from.
 *
 * Separate from {@link getMapPins} because the number on each pin is their own
 * count at that place, not the place's total. See `photographerMapPins()`.
 */
export async function getPhotographerMapPins(photographerId: string): Promise<MapPin[]> {
  if (useLive()) return live.photographerMapPins(photographerId);
  return demo.demoPhotographerMapPins(photographerId);
}

export async function getLocationSlugs(): Promise<string[]> {
  if (useLive()) return live.approvedLocationSlugs();
  return demo.demoLocationSlugs();
}

/* ------------------------------------------------------------------------ */
/* People                                                                    */
/* ------------------------------------------------------------------------ */

export async function getPhotographer(username: string): Promise<PhotographerProfile | null> {
  if (useLive()) return live.photographerByUsername(username);
  return demo.demoPhotographer(username);
}

export async function getPortfolio(photographerId: string): Promise<PhotographDetail[]> {
  if (useLive()) return live.portfolio(photographerId);
  return demo.demoPortfolio(photographerId);
}

export async function getFeaturedPhotographers(limit = 4): Promise<PhotographerProfile[]> {
  if (useLive()) return live.featuredPhotographers(limit);
  return demo.demoFeaturedPhotographers(limit);
}

export async function getPhotographerUsernames(): Promise<string[]> {
  if (useLive()) return live.photographerUsernames();
  return demo.demoPhotographerUsernames();
}

/* ------------------------------------------------------------------------ */
/* Collections                                                               */
/* ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------ */
/* Photobooks                                                               */
/* ------------------------------------------------------------------------ */

export async function getPhotobook(slug: string): Promise<Photobook | null> {
  if (useLive()) return live.photobookBySlug(slug);
  return demo.demoPhotobook(slug);
}

/**
 * The public shelf. Unlisted books are not on it in either mode — see
 * `publicPhotobooks` for why that is enforced in the query and not only by the
 * row-level policy.
 */
export async function getPublicPhotobooks(limit: number): Promise<Photobook[]> {
  if (useLive()) return live.publicPhotobooks(limit);
  return demo.demoPublicPhotobooks(limit);
}

/** A member's whole shelf, public and unlisted, in their order. */
export async function getPhotobooksByOwner(ownerId: string): Promise<Photobook[]> {
  if (useLive()) return live.photobooksByOwner(ownerId);
  return demo.demoPhotobooksByOwner(ownerId);
}

/** Demo mode counts nothing: there is no book to count against. */
export async function countPhotobookOpen(slug: string): Promise<void> {
  if (useLive()) return live.countPhotobookOpen(slug);
}

export async function getCollections(
  options: { ownerId?: string; includePrivate?: boolean } = {},
): Promise<Collection[]> {
  if (useLive()) return live.collections(options);
  return demo.demoCollections(options);
}

export async function getCollection(
  slug: string,
  options: { includePrivate?: boolean } = {},
): Promise<(Collection & { items: CollectionItem[] }) | null> {
  if (useLive()) return live.collectionBySlug(slug, options);
  return demo.demoCollection(slug, options);
}

export async function getPublicCollectionSlugs(): Promise<string[]> {
  if (useLive()) return live.publicCollectionSlugs();
  return demo.demoPublicCollectionSlugs();
}

/* ------------------------------------------------------------------------ */
/* Stats                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Aggregate counts.
 *
 * `isDemoData` travels with the numbers so a component can never render demo
 * figures as if they described a real community — the spec is explicit that
 * mock statistics must not appear as real ones in production.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  if (useLive()) return live.platformStats();
  return demo.demoStats();
}

/* ------------------------------------------------------------------------ */
/* Moderation                                                                */
/* ------------------------------------------------------------------------ */

export interface ModerationQueues {
  submissions: LocationSubmission[];
  reports: Report[];
  suspiciousUploads: SuspiciousUpload[];
  recentActions: ModerationAction[];
  possibleDuplicates: Array<{ a: LocationSummary; b: LocationSummary; distanceMetres: number }>;
}

/** Moderators and administrators. Demo mode has no accounts, so no staff. */
export async function getStaffMembers(): Promise<StaffMember[]> {
  if (useLive()) return live.staffMembers();
  return [];
}

export async function getModerationQueues(): Promise<ModerationQueues> {
  if (useLive()) return live.moderationQueues();
  return {
    ...demo.demoModerationQueues(),
    possibleDuplicates: demo.demoPossibleDuplicateLocations(),
  };
}
