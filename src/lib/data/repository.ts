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
  AppNotification,
  ChallengeCandidate,
  ChallengeDetail,
  ChallengeSummary,
  PhotographDetail,
  PhotographerProfile,
  PhotographerSummary,
  PhotographThread,
  PlatformStats,
  Report,
  LocationSubmission,
  StaffMember,
  SuspiciousUpload,
  Photobook,
  PhotoSeries,
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

/**
 * The comment thread under a photograph. The bundled demo dataset has no
 * conversations, so it answers with an empty thread rather than inventing one.
 */
export async function getPhotographThread(photographId: string): Promise<PhotographThread> {
  if (useLive()) return live.photographThread(photographId);
  return { comments: [], count: 0 };
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

/** A series by its address — public or unlisted, as the policy allows. */
export async function getSeries(slug: string): Promise<PhotoSeries | null> {
  if (useLive()) return live.seriesBySlug(slug);
  return demo.demoSeries(slug);
}

/** A member's series, newest first, public and unlisted alike. */
export async function getSeriesByOwner(ownerId: string): Promise<PhotoSeries[]> {
  if (useLive()) return live.seriesByOwner(ownerId);
  return demo.demoSeriesByOwner(ownerId);
}

/** Demo mode counts nothing: there is no series to count against. */
export async function countSeriesOpen(slug: string): Promise<void> {
  if (useLive()) return live.countSeriesOpen(slug);
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

/* ------------------------------------------------------------------------ */
/* Following, and being told about it                                        */
/* ------------------------------------------------------------------------ */

/**
 * Whether the viewer follows this member. Null when nobody is signed in — and
 * also in the demo deployment, where there is nobody to be.
 */
export async function getViewerFollows(profileId: string): Promise<boolean | null> {
  if (useLive()) return live.viewerFollows(profileId);
  return null;
}

/** The feed of the people a member follows. Empty where there is no database. */
export async function getFollowingFeed(options: {
  followerId: string;
  page: number;
  pageSize: number;
}): Promise<Paginated<PhotographDetail> & { followsAnybody: boolean }> {
  if (useLive()) return live.followingFeed(options);
  return {
    items: [],
    page: options.page,
    pageSize: options.pageSize,
    totalCount: null,
    hasMore: false,
    followsAnybody: false,
  };
}

/** Who follows this member, newest first. */
export async function getFollowers(
  profileId: string,
  limit?: number,
): Promise<PhotographerSummary[]> {
  if (useLive()) return live.followersOf(profileId, limit);
  return [];
}

/** This member's notifications. The demo deployment has nothing to tell anyone. */
export async function getNotifications(limit?: number): Promise<AppNotification[]> {
  if (useLive()) return live.notificationsFor(limit);
  return [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  if (useLive()) return live.unreadNotificationCount();
  return 0;
}

/* ------------------------------------------------------------------------ */
/* Challenges                                                                */
/* ------------------------------------------------------------------------ */

/** Every challenge, newest first. The demo deployment has none to show. */
export async function getChallenges(limit?: number): Promise<ChallengeSummary[]> {
  if (useLive()) return live.challengeList(limit);
  return [];
}

export async function getChallenge(slug: string): Promise<ChallengeDetail | null> {
  if (useLive()) return live.challengeBySlug(slug);
  return null;
}

export async function getChallengeCandidates(
  challenge: Pick<ChallengeSummary, 'id' | 'opensAt' | 'requiresNewWork'>,
  viewerId: string,
): Promise<ChallengeCandidate[]> {
  if (useLive()) return live.challengeCandidates(challenge, viewerId);
  return [];
}
