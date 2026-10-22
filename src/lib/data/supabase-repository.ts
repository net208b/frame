import { createClient as createSessionlessClient } from '@supabase/supabase-js';

import { getViewer } from '@/lib/auth';
import {
  LOCATION_POLICY,
  MAP_PIN_PHOTOGRAPH_SAMPLE,
  PAGE_SIZE,
  publicEnv,
  serverEnv,
  UPLOAD_POLICY,
} from '@/lib/config';
import type { MapPin, MapPinFrame, ModerationQueues } from '@/lib/data/repository';
import { NO_TRANSLATIONS, translationsFor } from '@/lib/data/translations';
import { boundingBoxAround, distanceMetres, publishableCoordinates } from '@/lib/geo';
import { IMAGE_VARIANTS } from '@/lib/images/variants';
import { trendingScore } from '@/lib/ranking';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';
import {
  COLLABORATION_STATUSES,
  CRITIQUE_PREFERENCES,
  CHALLENGE_AWARDS,
  NOTIFICATION_KINDS,
  PIN_PRECISIONS,
  type FeatureDetail,
  type FeatureItem,
  type FeatureSummary,
  type AppNotification,
  type ChallengeAward,
  type ChallengeCandidate,
  type ChallengeDetail,
  type ChallengeEntry,
  type ChallengePhase,
  type ChallengeSummary,
  PHOTO_CATEGORIES,
  PHOTOBOOK_COVERS,
  PHOTOBOOK_GEAR_MODES,
  PHOTOBOOK_MAX_PAGES,
  SERIES_MAX_ITEMS,
  PHOTOBOOK_PAPERS,
  PHOTOGRAPHY_STYLES,
  REPORT_REASONS,
  type Collection,
  type CollectionItem,
  type CollectionVisibility,
  type DiscoverQuery,
  type GearFacets,
  type GearOption,
  type LocationDetail,
  type LocationRestriction,
  type LocationSubmission,
  type LocationSummary,
  type Photobook,
  type PhotobookPage,
  type PhotoSeries,
  type PhotoSeriesItem,
  type PhotographyStyle,
  type ProfileCover,
  type ModerationAction,
  type ModerationDecision,
  type Paginated,
  type PhotoCategory,
  type PhotoImage,
  type PhotographDetail,
  type PhotographComment,
  type PhotographerProfile,
  type PhotographerSummary,
  type PhotographThread,
  type PlatformStats,
  type PublicationStatus,
  type Report,
  type ReportReason,
  type ReportStatus,
  type ReportSubjectType,
  type SubmissionSignal,
  type SubmissionStatus,
  type StaffMember,
  type SuspiciousUpload,
  type UploadSignal,
} from '@/types/domain';

/**
 * The live implementation of the read repository.
 *
 * Rules this module holds to, all of them load-bearing rather than stylistic:
 *
 * - Public reads return published photographs and approved locations only. The
 *   filter is in every query, not in a wrapper somebody can forget.
 * - Reads run through the cookie-bound client, so row-level security is the
 *   real gate and the moderation queues are protected by the database rather
 *   than by a role check in application code.
 * - A query error throws with the operation named. An empty gallery caused by a
 *   failed query looks exactly like an empty gallery caused by an empty table,
 *   and conflating the two is how a broken site ships unnoticed.
 * - Coordinates always leave through `publishableCoordinates`, so a sensitive
 *   place is coarsened or withheld on the way out and precision is never
 *   widened again downstream.
 * - Images are built from the stored derivatives. The original is never served.
 */

/* ------------------------------------------------------------------------ */
/* Bounds                                                                   */
/* ------------------------------------------------------------------------ */

/** The largest page any caller can ask for, whatever the query string says. */
const MAX_PAGE_SIZE = 60;

/**
 * How many recent photographs the trending ordering considers.
 *
 * Trending is `appreciations / 2^(age / 36h)`, which PostgREST cannot express
 * as an ordering, so the newest slice is ranked in process instead. With a
 * 36-hour half-life a two-week-old photograph is divided by roughly 630, so it
 * cannot realistically re-enter the top of the feed; the bound is honest but it
 * is a bound. A `photograph_trending` view ordering on the SQL expression would
 * remove it — see docs/LIMITATIONS.md.
 */
const TRENDING_POOL = 300;

/** Related strips and portfolios are bounded rather than unbounded reads. */
const RELATED_LIMIT = 12;
const AT_LOCATION_LIMIT = PAGE_SIZE.gallery;
const PORTFOLIO_LIMIT = PAGE_SIZE.profile * 2;
const NEARBY_RADIUS_METRES = 25_000;
const NEARBY_LIMIT = 6;
const MAP_PIN_LIMIT = 2_000;
const SLUG_LIMIT = 5_000;
const FACET_SAMPLE_LIMIT = 5_000;
const AGGREGATE_SAMPLE_LIMIT = 5_000;
const DUPLICATE_SCAN_LIMIT = 3_000;
const DUPLICATE_PAIR_LIMIT = 40;
const COLLECTION_LIST_LIMIT = 60;
const COLLECTION_ITEM_LIMIT = 200;
const FEATURED_POOL = 200;

/* ------------------------------------------------------------------------ */
/* Result unwrapping                                                        */
/* ------------------------------------------------------------------------ */

interface QueryOutcome {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Raise a query failure, or hand back the rows in the shape this module asked
 * for.
 *
 * The select string is written by hand, so the row shape is asserted here
 * rather than inferred: this is the one boundary where that assertion is made,
 * and the `Pick<Tables<'…'>, …>` types the callers declare are what keep the
 * asserted columns honest against the schema.
 */
function unwrap<T>(operation: string, outcome: QueryOutcome): T | null {
  if (outcome.error) {
    throw new Error(`FRAME data: ${operation} failed — ${outcome.error.message}`);
  }
  return (outcome.data ?? null) as T | null;
}

function unwrapList<T>(operation: string, outcome: QueryOutcome): T[] {
  return unwrap<T[]>(operation, outcome) ?? [];
}

function unwrapCount(
  operation: string,
  outcome: { count: number | null; error: { message: string } | null },
): number {
  if (outcome.error) {
    throw new Error(`FRAME data: ${operation} failed — ${outcome.error.message}`);
  }
  return outcome.count ?? 0;
}

/* ------------------------------------------------------------------------ */
/* Small conversions                                                        */
/* ------------------------------------------------------------------------ */

type Nullable<T> = { [K in keyof T]: T[K] | null };

/** PostgREST returns a to-one embed as an object, but never assume which. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Postgres `numeric` may arrive as a string depending on the driver path. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function clampPageSize(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return PAGE_SIZE.gallery;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requested)));
}

function clampPage(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 1) return 1;
  return Math.floor(requested);
}

/**
 * Strip the characters that carry meaning in a PostgREST filter.
 *
 * A raw term goes into an `or=(...)` expression, where a comma, a bracket or a
 * quote would change which filter is being asked for rather than what is being
 * searched. Removing them is both the correct escape and the reason a search
 * box cannot be used to rewrite a query.
 */
function sanitiseSearchTerm(term: string): string {
  return term
    // Commas and brackets delimit the filter list, quotes and backslashes
    // escape within it, and asterisk and percent are `ilike` wildcards a search
    // box has no business widening. Full stops, colons and hyphens survive:
    // PostgREST reads only the first two full stops of a filter, so "St. Pauli"
    // searches for what the reader typed.
    .replace(/[,()*%"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function isCategory(value: unknown): value is PhotoCategory {
  return PHOTO_CATEGORIES.some((category) => category === value);
}

const PUBLICATION_STATUSES: readonly PublicationStatus[] = [
  'draft',
  'processing',
  'published',
  'under_review',
  'removed',
];

const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'pending',
  'approved',
  'rejected',
  'changes_requested',
];

const REPORT_STATUSES: readonly ReportStatus[] = ['open', 'reviewing', 'actioned', 'dismissed'];

const REPORT_SUBJECT_TYPES: readonly ReportSubjectType[] = [
  'photograph',
  'location',
  'profile',
  'collection',
];

const MODERATION_DECISIONS: readonly ModerationDecision[] = [
  'approve',
  'reject',
  'request_changes',
  'remove_content',
  'suspend_account',
  'dismiss',
  'change_role',
  'delete',
];

const RESTRICTION_KINDS: readonly LocationRestriction['kind'][] = [
  'permit',
  'private-property',
  'no-tripod',
  'hours',
  'fee',
  'other',
];

const SIGNAL_KINDS: readonly SubmissionSignal['kind'][] = [
  'possible-duplicate',
  'coordinate-country-mismatch',
  'coordinate-out-of-range',
  'low-precision',
  'rate-limited',
  'sensitive-area',
];

const SIGNAL_SEVERITIES: readonly SubmissionSignal['severity'][] = ['info', 'warn', 'high'];

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((entry) => entry === value) ?? fallback;
}

/**
 * The same, for a column where "not set" is a meaning of its own: a member who
 * has not said whether they collaborate has not said "no".
 */
function oneOrNull<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return allowed.find((entry) => entry === value) ?? null;
}

function isPhotographyStyle(value: unknown): value is PhotographyStyle {
  return PHOTOGRAPHY_STYLES.some((style) => style === value);
}

/**
 * Whether a stored link is one this site will put in an href.
 *
 * The database already refuses anything but http(s) on these columns
 * (migration 0016). This is the second refusal, at the boundary where the value
 * stops being a row and becomes a page: a link is the one piece of
 * member-written text the browser executes if it is the wrong scheme.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------------ */
/* Clients                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * A session-less public client, used only where there is no request to read
 * cookies from.
 *
 * `generateStaticParams` and the sitemap run outside a request scope, so
 * `cookies()` is unavailable there. These reads are of published rows only and
 * carry the publishable key, so row-level security still applies — this is not
 * a way around it.
 */
let cachedPublicClient: ReturnType<typeof createSessionlessClient> | null = null;

function publicClient() {
  if (cachedPublicClient) return cachedPublicClient;

  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'FRAME data: Supabase is not configured, so the live repository cannot answer. See docs/ENVIRONMENT.md.',
    );
  }

  cachedPublicClient = createSessionlessClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cachedPublicClient;
}

/* ------------------------------------------------------------------------ */
/* Storage URLs                                                             */
/* ------------------------------------------------------------------------ */

interface StorageBase {
  provider: 'supabase' | 'r2';
  prefix: string;
}

let cachedStorageBase: StorageBase | null = null;

function storageBase(): StorageBase {
  if (cachedStorageBase) return cachedStorageBase;

  const env = serverEnv();
  if (env.storageProvider === 'r2') {
    const host = env.r2.publicHost;
    if (!host) {
      throw new Error(
        'FRAME data: STORAGE_PROVIDER is r2 but NEXT_PUBLIC_IMAGE_HOST is unset, so stored images have no public URL. See docs/ENVIRONMENT.md.',
      );
    }
    cachedStorageBase = { provider: 'r2', prefix: `https://${host}` };
    return cachedStorageBase;
  }

  cachedStorageBase = {
    provider: 'supabase',
    prefix: `${env.supabaseUrl}/storage/v1/object/public/${env.storageBucket}`,
  };
  return cachedStorageBase;
}

/**
 * The public URL for a stored derivative.
 *
 * This mirrors `publicUrl` on the storage driver. It is kept here so the
 * repository has no import-time dependency on the upload side of the app; see
 * the follow-up note about collapsing the two once the driver module lands.
 */
function storagePublicUrl(key: string): string {
  if (/^https?:\/\//i.test(key)) return key;
  const trimmed = key.replace(/^\/+/, '');
  return `${storageBase().prefix}/${trimmed}`;
}

/* ------------------------------------------------------------------------ */
/* Column selections                                                        */
/* ------------------------------------------------------------------------ */

type PhotographColumns = Pick<
  Tables<'photographs'>,
  | 'id'
  | 'slug'
  | 'title'
  | 'alt_text'
  | 'category'
  | 'description'
  | 'status'
  | 'appreciation_count'
  | 'published_at'
  | 'created_at'
  | 'public_captured_at'
  | 'publish_captured_at'
  | 'editors_pick'
  | 'rights_confirmed_at'
  | 'image_width'
  | 'image_height'
  | 'blur_data_url'
>;

type ProfileColumns = Nullable<
  Pick<Tables<'profiles'>, 'id' | 'username' | 'display_name' | 'avatar_url' | 'based_in'>
>;

type ProfileDetailColumns = Nullable<
  Pick<
    Tables<'profiles'>,
    | 'id'
    | 'username'
    | 'display_name'
    | 'avatar_url'
    | 'based_in'
    | 'biography'
    | 'website'
    | 'country_code'
    | 'style_tags'
    | 'collaboration_status'
    | 'critique_preference'
    | 'social_links'
    | 'usual_gear'
    | 'role'
    | 'member_since'
    | 'created_at'
    | 'follower_count'
    | 'following_count'
  >
> & {
  cover?: ProfileCoverColumns | ProfileCoverColumns[] | null;
};

interface ProfileCoverColumns {
  slug: string | null;
  alt_text: string | null;
  owner_id: string | null;
  status: string | null;
  photograph_images: ImageColumns[] | null;
}

type LocationSummaryColumns = Nullable<
  Pick<
    Tables<'locations'>,
    'id' | 'slug' | 'name' | 'city' | 'country' | 'country_code' | 'photograph_count'
  >
>;

type LocationPointColumns = Nullable<
  Pick<Tables<'locations'>, 'latitude' | 'longitude' | 'is_sensitive' | 'withhold_coordinates' | 'pin_precision'>
>;

type ImageColumns = Nullable<
  Pick<Tables<'photograph_images'>, 'variant' | 'storage_key' | 'width' | 'height'>
>;

type MetadataColumns = Nullable<
  Pick<
    Tables<'photograph_metadata'>,
    | 'camera_brand_text'
    | 'camera_model_text'
    | 'lens_brand_text'
    | 'lens_model_text'
    | 'focal_length_mm'
    | 'aperture'
    | 'shutter_speed'
    | 'iso'
    | 'editing_software'
    | 'editing_notes'
    | 'film_stock'
    | 'film_camera'
    | 'film_scanner'
  >
>;

type RestrictionColumns = Nullable<
  Pick<Tables<'location_restrictions'>, 'kind' | 'note' | 'source' | 'recorded_at'>
>;

const PROFILE_SUMMARY_FIELDS = 'id, username, display_name, avatar_url, based_in';
const IMAGE_FIELDS = 'variant, storage_key, width, height';

/**
 * The cover is embedded rather than resolved in a second query, which it can be
 * because `profiles.cover_photograph_id` is a declared foreign key (0017) —
 * unlike `collections.cover_photograph_id`, which is not and therefore is not.
 *
 * The relationship has to be named, and so does every *other* embed between
 * these two tables. `profiles` and `photographs` are joined twice over — a
 * photograph has an owner, and a profile has a cover — so PostgREST refuses any
 * embed between them that does not say which join it means. Adding this column
 * is what made the second join exist: the day it reached production it took the
 * home page, the discover feed and every profile with it, because
 * `profiles(...)` in `photographSelect()` had been unambiguous until then and
 * suddenly was not. The hint is the foreign key's *column*, which is the form
 * used everywhere else here (`profiles!submitted_by`, `profiles!reported_by`)
 * and survives a constraint being renamed.
 *
 * `owner_id` and `status` come back so the mapper can check them. The trigger
 * already refuses a cover that is not the member's own published photograph,
 * but a photograph unpublished *after* it was chosen keeps the reference, and a
 * cover is a public image: it is checked where it is read, every time.
 */
const PROFILE_COVER_FIELDS = `cover:photographs!cover_photograph_id(
  slug, alt_text, owner_id, status, photograph_images(${IMAGE_FIELDS}))`;

const PROFILE_DETAIL_FIELDS = `${PROFILE_SUMMARY_FIELDS}, biography, website, country_code,
  style_tags, collaboration_status, critique_preference, social_links, usual_gear, role,
  member_since, created_at, follower_count, following_count, ${PROFILE_COVER_FIELDS}`;
const LOCATION_SUMMARY_FIELDS = 'id, slug, name, city, country, country_code, photograph_count';
const METADATA_FIELDS =
  'camera_brand_text, camera_model_text, lens_brand_text, lens_model_text, focal_length_mm, aperture, shutter_speed, iso, editing_software, editing_notes, film_stock, film_camera, film_scanner';

const PHOTOGRAPH_OWN_FIELDS = `
  id, slug, title, alt_text, category, description, status, appreciation_count,
  published_at, created_at, public_captured_at, publish_captured_at, editors_pick,
  rights_confirmed_at, image_width, image_height, blur_data_url
`;

/**
 * One embedded select for a photograph and everything a card or a detail page
 * needs, so a gallery is a single round trip rather than one per row.
 *
 * `innerLocation` and `innerMetadata` turn the matching join into an inner one.
 * Filtering an embedded resource without that only empties the embed; it does
 * not remove the parent row, which would quietly return photographs that do not
 * match the filter.
 */
function photographSelect(
  options: { innerLocation?: boolean; innerMetadata?: boolean } = {},
): string {
  const location = options.innerLocation ? 'locations!inner' : 'locations';
  const metadata = options.innerMetadata ? 'photograph_metadata!inner' : 'photograph_metadata';
  return `
    ${PHOTOGRAPH_OWN_FIELDS},
    profiles!owner_id(${PROFILE_SUMMARY_FIELDS}),
    ${location}(${LOCATION_SUMMARY_FIELDS}),
    photograph_images(${IMAGE_FIELDS}),
    ${metadata}(${METADATA_FIELDS})
  `;
}

interface PhotographJoined extends PhotographColumns {
  profiles: ProfileColumns | ProfileColumns[] | null;
  locations: LocationSummaryColumns | LocationSummaryColumns[] | null;
  photograph_images: ImageColumns[] | null;
  photograph_metadata: MetadataColumns | MetadataColumns[] | null;
}

/* ------------------------------------------------------------------------ */
/* Mapping                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * The chosen photograph, if it is still one this profile may show.
 *
 * Two conditions, checked here because this is where the row becomes a page: it
 * has to belong to this member, and it has to be published. The first cannot
 * fail while the trigger in 0017 holds; the second can, the moment a frame is
 * taken down for a day, and then the band quietly disappears until it is back.
 */
function mapProfileCover(row: ProfileDetailColumns, ownerId: string): ProfileCover | null {
  const cover = firstOf<ProfileCoverColumns>(row.cover ?? null);
  if (!cover) return null;
  if (toText(cover.owner_id) !== ownerId || cover.status !== 'published') return null;

  const slug = toText(cover.slug);
  const altText = toText(cover.alt_text);
  if (!slug || !altText) return null;

  const images = asArray<ImageColumns>(cover.photograph_images);
  // The band is as wide as the page, so the detail derivative is the one that
  // holds up; a grid image stretched across 1,200 pixels is visibly soft.
  const key =
    toText(images.find((image) => image.variant === 'display')?.storage_key) ??
    toText(images.find((image) => image.variant === 'grid')?.storage_key);
  if (!key) return null;

  return { imageUrl: storagePublicUrl(key), altText, slug };
}

function mapPhotographerSummary(row: ProfileColumns | null): PhotographerSummary | null {
  if (!row) return null;
  const id = toText(row.id);
  const username = toText(row.username);
  if (!id || !username) return null;

  return {
    id,
    username,
    displayName: toText(row.display_name) ?? username,
    avatarUrl: toText(row.avatar_url),
    basedIn: toText(row.based_in),
  };
}

function mapLocationSummary(row: LocationSummaryColumns | null): LocationSummary | null {
  if (!row) return null;
  const id = toText(row.id);
  const slug = toText(row.slug);
  const name = toText(row.name);
  if (!id || !slug || !name) return null;

  return {
    id,
    slug,
    name,
    city: toText(row.city) ?? '',
    country: toText(row.country) ?? '',
    countryCode: (toText(row.country_code) ?? '').toUpperCase(),
    photographCount: toNumber(row.photograph_count) ?? 0,
    // Filled in by attachLocationNames() for the reads that render the name,
    // which ask once for the whole list rather than once per place.
    translations: NO_TRANSLATIONS,
  };
}

/**
 * The translated name for a list of places, in one query (0035).
 *
 * Mutates in place, like the photograph and profile attachments above it, and
 * for the same reason: the summary is already built and the ids are already
 * known, so the alternative is rebuilding every object to set one field.
 *
 * A place appearing twice in the list — the same location under two
 * photographs — is one id to `translationsFor`, so a feed of twenty-four
 * frames at three places costs one round trip and asks about three rows.
 */
async function attachLocationNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  places: Array<LocationSummary | null | undefined>,
): Promise<void> {
  const present = places.filter((place): place is LocationSummary => Boolean(place));
  if (present.length === 0) return;

  const translations = await translationsFor(
    supabase,
    'location',
    present.map((place) => place.id),
  );
  if (translations.size === 0) return;

  for (const place of present) {
    place.translations = translations.get(place.id) ?? NO_TRANSLATIONS;
  }
}

/**
 * Build the served image set from the stored derivatives.
 *
 * The fallback chain exists because a photograph may be mid-reprocessing: a
 * missing `display` row should degrade to the next largest derivative rather
 * than fall back to the original, which is the one file a reader must never be
 * sent.
 */
function buildImage(rows: ImageColumns[], photo: PhotographColumns): PhotoImage | null {
  const byVariant = new Map<string, ImageColumns>();
  for (const row of rows) {
    const variant = toText(row.variant);
    const key = toText(row.storage_key);
    if (variant && key) byVariant.set(variant, row);
  }

  // `full` first, which is the point of generating it: 2560 pixels at 92 is
  // what a photograph on a laptop or a 27-inch screen deserves, and `sizes` on
  // the component is what keeps a phone from downloading it. Until this line,
  // `full` was built on every upload and served to nobody.
  const display =
    byVariant.get('full') ?? byVariant.get('display') ?? byVariant.get('grid') ?? byVariant.get('thumb');
  if (!display) return null;

  const grid = byVariant.get('grid') ?? display;
  const thumb = byVariant.get('thumb') ?? grid;

  const displayKey = toText(display.storage_key);
  const gridKey = toText(grid.storage_key);
  const thumbKey = toText(thumb.storage_key);
  if (!displayKey || !gridKey || !thumbKey) return null;

  const width =
    toNumber(display.width) ?? toNumber(photo.image_width) ?? IMAGE_VARIANTS.display.width;
  const heightFromRow = toNumber(display.height);
  const height =
    heightFromRow ??
    toNumber(photo.image_height) ??
    Math.round(IMAGE_VARIANTS.display.width / (3 / 2));

  const image: PhotoImage = {
    thumbUrl: storagePublicUrl(thumbKey),
    gridUrl: storagePublicUrl(gridKey),
    displayUrl: storagePublicUrl(displayKey),
    width,
    height,
  };

  const blur = toText(photo.blur_data_url);
  return blur ? { ...image, blurDataUrl: blur } : image;
}

function mapPhotograph(
  row: PhotographJoined,
  viewerHasAppreciated: boolean | null,
): PhotographDetail | null {
  const id = toText(row.id);
  const slug = toText(row.slug);
  if (!id || !slug) return null;

  const photographer = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
  if (!photographer) {
    // A photograph with no owner row cannot be credited, and publishing an
    // uncredited photograph is exactly what this platform must not do.
    console.warn(`FRAME data: photograph ${slug} has no owner profile and was skipped.`);
    return null;
  }

  const image = buildImage(asArray<ImageColumns>(row.photograph_images), row);
  if (!image) {
    console.warn(`FRAME data: photograph ${slug} has no stored derivatives and was skipped.`);
    return null;
  }

  const category: PhotoCategory = isCategory(row.category) ? row.category : 'street';
  if (!isCategory(row.category)) {
    console.warn(`FRAME data: photograph ${slug} has unknown category "${String(row.category)}".`);
  }

  const metadata = firstOf<MetadataColumns>(row.photograph_metadata);

  return {
    id,
    slug,
    title: toText(row.title) ?? 'Untitled',
    altText: toText(row.alt_text) ?? '',
    category,
    image,
    appreciationCount: toNumber(row.appreciation_count) ?? 0,
    viewerHasAppreciated,
    photographer,
    location: mapLocationSummary(firstOf<LocationSummaryColumns>(row.locations)),
    publishedAt: toText(row.published_at) ?? toText(row.created_at) ?? '',
    editorsPick: row.editors_pick === true,
    description: toText(row.description),
    // Filled in by mapPhotographRows, which asks for the whole page's
    // translations in one query rather than one per photograph.
    translations: NO_TRANSLATIONS,
    capture: {
      cameraBrand: toText(metadata?.camera_brand_text),
      cameraModel: toText(metadata?.camera_model_text),
      lensBrand: toText(metadata?.lens_brand_text),
      lensModel: toText(metadata?.lens_model_text),
      focalLengthMm: toNumber(metadata?.focal_length_mm),
      aperture: toNumber(metadata?.aperture),
      shutterSpeed: toText(metadata?.shutter_speed),
      iso: toNumber(metadata?.iso),
      filmStock: toText(metadata?.film_stock),
      filmCamera: toText(metadata?.film_camera),
      filmScanner: toText(metadata?.film_scanner),
    },
    editing: {
      software: toText(metadata?.editing_software),
      notes: toText(metadata?.editing_notes),
    },
    // Capture dates are published only when the owner chose to publish them: a
    // timestamp is itself information about where somebody was and when. The
    // database decides that now (0028–0029): `public_captured_at` is null when
    // the owner withheld it, and the raw column is not readable at all.
    capturedAt: toText(row.public_captured_at),
    status: oneOf(PUBLICATION_STATUSES, row.status, 'published'),
    rightsConfirmedAt: toText(row.rights_confirmed_at),
  };
}

/* ------------------------------------------------------------------------ */
/* Appreciation state                                                       */
/* ------------------------------------------------------------------------ */

interface AppreciationLookup {
  has(photographId: string): boolean | null;
}

const NO_VIEWER_LOOKUP: AppreciationLookup = { has: () => null };

/**
 * Which of these photographs the viewer has already appreciated.
 *
 * One query for the whole page rather than one per card, and `null` — not
 * `false` — when nobody is signed in, so the control can send a visitor to sign
 * in instead of showing an un-appreciated state it cannot know.
 */
async function appreciationLookup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photographIds: string[],
): Promise<AppreciationLookup> {
  const viewer = await getViewer();
  if (!viewer) return NO_VIEWER_LOOKUP;
  if (photographIds.length === 0) return { has: () => false };

  const rows = unwrapList<{ photograph_id: string | null }>(
    'reading the viewer’s appreciations',
    await supabase
      .from('photograph_appreciations')
      .select('photograph_id')
      .eq('profile_id', viewer.id)
      .in('photograph_id', photographIds),
  );

  const appreciated = new Set(
    rows
      .map((row) => toText(row.photograph_id))
      .filter((value): value is string => value !== null),
  );

  return { has: (photographId: string) => appreciated.has(photographId) };
}

async function mapPhotographRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: PhotographJoined[],
): Promise<PhotographDetail[]> {
  const ids = rows.map((row) => toText(row.id)).filter((value): value is string => value !== null);
  // The place ids come off the raw rows rather than the mapped photographs so
  // that both translation queries go out with the appreciation lookup instead
  // of waiting behind it.
  const placeIds = rows
    .map((row) => toText(firstOf<LocationSummaryColumns>(row.locations)?.id))
    .filter((value): value is string => value !== null);

  const [lookup, translations, placeNames] = await Promise.all([
    appreciationLookup(supabase, ids),
    // One query for the page, not one per photograph (0035).
    translationsFor(supabase, 'photograph', ids),
    // The place is named on the photograph as well as on its own page, so the
    // frame carries the translated name with it.
    translationsFor(supabase, 'location', placeIds),
  ]);

  const mapped: PhotographDetail[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const photo = mapPhotograph(row, id ? lookup.has(id) : null);
    if (!photo) continue;
    if (id) photo.translations = translations.get(id) ?? NO_TRANSLATIONS;
    if (photo.location) {
      photo.location.translations = placeNames.get(photo.location.id) ?? NO_TRANSLATIONS;
    }
    mapped.push(photo);
  }
  return mapped;
}

/* ------------------------------------------------------------------------ */
/* Photograph queries                                                       */
/* ------------------------------------------------------------------------ */

interface PhotographQuery {
  operation: string;
  limit: number;
  offset?: number;
  order?: 'recent' | 'appreciated';
  category?: PhotoCategory | null;
  place?: string | null;
  cameraBrand?: string | null;
  cameraModel?: string | null;
  lensBrand?: string | null;
  ownerId?: string | null;
  /** Several owners at once, for the following feed. An empty array matches nothing. */
  ownerIds?: readonly string[] | null;
  locationId?: string | null;
  excludeId?: string | null;
  editorsOnly?: boolean;
}

async function fetchPhotographRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: PhotographQuery,
): Promise<PhotographJoined[]> {
  const place = options.place ? sanitiseSearchTerm(options.place) : '';
  const gearFilters: Array<[column: string, value: string]> = [];
  if (options.cameraBrand) gearFilters.push(['camera_brand_text', options.cameraBrand]);
  if (options.cameraModel) gearFilters.push(['camera_model_text', options.cameraModel]);
  if (options.lensBrand) gearFilters.push(['lens_brand_text', options.lensBrand]);

  let query = supabase
    .from('photographs')
    .select(
      photographSelect({
        innerLocation: place.length > 0 || Boolean(options.locationId),
        innerMetadata: gearFilters.length > 0,
      }),
    )
    .eq('status', 'published');

  if (options.category) query = query.eq('category', options.category);
  if (options.ownerId) query = query.eq('owner_id', options.ownerId);
  if (options.ownerIds) query = query.in('owner_id', [...options.ownerIds]);
  if (options.locationId) query = query.eq('location_id', options.locationId);
  if (options.excludeId) query = query.neq('id', options.excludeId);
  if (options.editorsOnly) query = query.eq('editors_pick', true);

  for (const [column, value] of gearFilters) {
    query = query.eq(`photograph_metadata.${column}`, value);
  }

  if (place.length > 0) {
    query = query.or(
      `name.ilike.*${place}*,city.ilike.*${place}*,country.ilike.*${place}*`,
      { referencedTable: 'locations' },
    );
  }

  if (options.order === 'appreciated') {
    query = query.order('appreciation_count', { ascending: false });
  }
  // Editors' picks come in the order they were picked (0030), so "the latest
  // picks" means what an editor chose most recently, not what was uploaded.
  if (options.editorsOnly) {
    query = query.order('editors_picked_at', { ascending: false, nullsFirst: false });
  }
  query = query.order('published_at', { ascending: false, nullsFirst: false });

  const offset = options.offset ?? 0;
  query = query.range(offset, offset + options.limit - 1);

  return unwrapList<PhotographJoined>(options.operation, await query);
}

export async function discoverFeed(query: DiscoverQuery): Promise<Paginated<PhotographDetail>> {
  const supabase = await createClient();
  const pageSize = clampPageSize(query.pageSize);
  const page = clampPage(query.page);

  const filters = {
    category: query.category ?? null,
    place: query.place ?? null,
    cameraBrand: query.cameraBrand ?? null,
    cameraModel: query.cameraModel ?? null,
    lensBrand: query.lensBrand ?? null,
  } satisfies Partial<PhotographQuery>;

  if (query.sort === 'trending') {
    const pool = await fetchPhotographRows(supabase, {
      ...filters,
      operation: 'the trending feed',
      order: 'recent',
      limit: TRENDING_POOL,
    });

    const ranked = [...pool].sort(
      (a, b) =>
        trendingScore(
          toNumber(b.appreciation_count) ?? 0,
          toText(b.published_at) ?? toText(b.created_at) ?? '',
        ) -
        trendingScore(
          toNumber(a.appreciation_count) ?? 0,
          toText(a.published_at) ?? toText(a.created_at) ?? '',
        ),
    );

    const start = (page - 1) * pageSize;
    const items = await mapPhotographRows(supabase, ranked.slice(start, start + pageSize));
    return {
      items,
      page,
      pageSize,
      totalCount: null,
      hasMore: ranked.length > start + pageSize,
    };
  }

  // One row beyond the page answers "is there a next page" without an exact
  // count, which on a growing photographs table is the expensive part.
  const rows = await fetchPhotographRows(supabase, {
    ...filters,
    operation: 'the discover feed',
    order: query.sort === 'appreciated' ? 'appreciated' : 'recent',
    editorsOnly: query.sort === 'editors',
    offset: (page - 1) * pageSize,
    limit: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = await mapPhotographRows(supabase, rows.slice(0, pageSize));

  return { items, page, pageSize, totalCount: null, hasMore };
}

/**
 * Gear facets, counted from the column the filter actually uses.
 *
 * Only the free-text columns are counted, because those are what a discover
 * filter matches on. Deriving a label from the catalogue tables instead would
 * produce options that match nothing, which is worse than a shorter list. The
 * sample is bounded; a materialised view is the fix at scale.
 */
export async function gearFacets(): Promise<GearFacets> {
  const supabase = await createClient();

  const rows = unwrapList<
    Nullable<
      Pick<
        Tables<'photograph_metadata'>,
        'camera_brand_text' | 'camera_model_text' | 'lens_brand_text'
      >
    >
  >(
    'reading gear facets',
    await supabase
      .from('photograph_metadata')
      .select('camera_brand_text, camera_model_text, lens_brand_text, photographs!inner(status)')
      .eq('photographs.status', 'published')
      .limit(FACET_SAMPLE_LIMIT),
  );

  const tally = (pick: (row: (typeof rows)[number]) => string | null): GearOption[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = pick(row);
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, photographCount]) => ({ id: label, label, photographCount }))
      .sort((a, b) => b.photographCount - a.photographCount || a.label.localeCompare(b.label));
  };

  return {
    cameraBrands: tally((row) => toText(row.camera_brand_text)),
    cameraModels: tally((row) => toText(row.camera_model_text)),
    lensBrands: tally((row) => toText(row.lens_brand_text)),
  };
}

export async function photographBySlug(slug: string): Promise<PhotographDetail | null> {
  const supabase = await createClient();

  const row = unwrap<PhotographJoined>(
    `reading photograph "${slug}"`,
    await supabase
      .from('photographs')
      .select(photographSelect())
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle(),
  );

  if (!row) return null;
  const [mapped] = await mapPhotographRows(supabase, [row]);
  return mapped ?? null;
}

export async function photographsAtLocation(
  locationId: string | null,
  excludePhotographId: string,
): Promise<PhotographDetail[]> {
  if (!locationId) return [];
  const supabase = await createClient();

  const rows = await fetchPhotographRows(supabase, {
    operation: 'reading photographs at a location',
    locationId,
    excludeId: excludePhotographId || null,
    order: 'recent',
    limit: AT_LOCATION_LIMIT,
  });

  return mapPhotographRows(supabase, rows);
}

export async function morePhotographsBy(
  photographerId: string,
  excludePhotographId: string,
): Promise<PhotographDetail[]> {
  const supabase = await createClient();

  const rows = await fetchPhotographRows(supabase, {
    operation: 'reading more photographs by a photographer',
    ownerId: photographerId,
    excludeId: excludePhotographId || null,
    order: 'recent',
    limit: RELATED_LIMIT,
  });

  return mapPhotographRows(supabase, rows);
}

export async function publishedPhotographSlugs(): Promise<string[]> {
  const rows = unwrapList<{ slug: string | null }>(
    'listing published photograph slugs',
    await publicClient()
      .from('photographs')
      .select('slug')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(SLUG_LIMIT),
  );

  return rows.map((row) => toText(row.slug)).filter((value): value is string => value !== null);
}

export async function portfolio(photographerId: string): Promise<PhotographDetail[]> {
  const supabase = await createClient();

  const rows = await fetchPhotographRows(supabase, {
    operation: 'reading a portfolio',
    ownerId: photographerId,
    order: 'recent',
    limit: PORTFOLIO_LIMIT,
  });

  return mapPhotographRows(supabase, rows);
}

/* ------------------------------------------------------------------------ */
/* Locations                                                                */
/* ------------------------------------------------------------------------ */

interface LocationJoined extends LocationSummaryColumns, LocationPointColumns {
  description: string | null;
  categories: unknown;
  shooting_notes: unknown;
  best_time_of_day: string | null;
  approved_at: string | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
  location_restrictions: RestrictionColumns[] | null;
}

const LOCATION_DETAIL_SELECT: string = `
  ${LOCATION_SUMMARY_FIELDS}, description, latitude, longitude, is_sensitive,
  withhold_coordinates, pin_precision, categories, shooting_notes, best_time_of_day, approved_at,
  profiles!submitted_by(${PROFILE_SUMMARY_FIELDS}),
  location_restrictions(kind, note, source, recorded_at)
`;

function mapRestrictions(rows: RestrictionColumns[]): LocationRestriction[] {
  const restrictions: LocationRestriction[] = [];
  for (const row of rows) {
    const note = toText(row.note);
    const source = toText(row.source);
    // A restriction without a recorded source is not shown at all: a wrong
    // claim about whether photography is allowed somewhere is worse than none.
    if (!note || !source) continue;
    restrictions.push({
      kind: oneOf(RESTRICTION_KINDS, row.kind, 'other'),
      note,
      source,
      recordedAt: toText(row.recorded_at) ?? '',
    });
  }
  return restrictions;
}

function mapLocationDetail(row: LocationJoined): LocationDetail | null {
  const summary = mapLocationSummary(row);
  if (!summary) return null;

  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  const coordinates =
    latitude === null || longitude === null
      ? null
      : publishableCoordinates(latitude, longitude, {
          precision: oneOrNull(PIN_PRECISIONS, row.pin_precision),
          isSensitive: row.is_sensitive === true,
          withhold: row.withhold_coordinates === true,
        });

  return {
    ...summary,
    description: toText(row.description),
    translations: NO_TRANSLATIONS,
    coordinates,
    pinPrecision: oneOrNull(PIN_PRECISIONS, row.pin_precision) ?? 'approximate',
    categories: toStringList(row.categories).filter(isCategory),
    shootingNotes: toStringList(row.shooting_notes),
    restrictions: mapRestrictions(asArray<RestrictionColumns>(row.location_restrictions)),
    bestTimeOfDay: toText(row.best_time_of_day),
    submittedBy: mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles)),
    approvedAt: toText(row.approved_at),
  };
}

export async function locations(
  options: { search?: string; page?: number } = {},
): Promise<Paginated<LocationDetail>> {
  const supabase = await createClient();
  const pageSize = PAGE_SIZE.locations;
  const page = clampPage(options.page ?? 1);
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('locations')
    // The approved-locations table stays small enough for an exact count, and a
    // location index reads better with one.
    .select(LOCATION_DETAIL_SELECT, { count: 'exact' })
    .eq('status', 'approved');

  const search = options.search ? sanitiseSearchTerm(options.search) : '';
  if (search.length > 0) {
    query = query.or(`name.ilike.*${search}*,city.ilike.*${search}*,country.ilike.*${search}*`);
  }

  const outcome = await query
    .order('photograph_count', { ascending: false })
    .order('name', { ascending: true })
    .range(offset, offset + pageSize - 1);

  const rows = unwrapList<LocationJoined>('reading the location index', outcome);
  const totalCount = outcome.count ?? null;

  const items: LocationDetail[] = [];
  for (const row of rows) {
    const mapped = mapLocationDetail(row);
    if (mapped) items.push(mapped);
  }
  // The index names every place on it, so it needs the names in the reader's
  // language as much as a place's own page does.
  await attachLocationNames(supabase, items);

  return {
    items,
    page,
    pageSize,
    totalCount,
    hasMore: totalCount === null ? rows.length === pageSize : offset + rows.length < totalCount,
  };
}

export async function locationBySlug(slug: string): Promise<LocationDetail | null> {
  const supabase = await createClient();

  const row = unwrap<LocationJoined>(
    `reading location "${slug}"`,
    await supabase
      .from('locations')
      .select(LOCATION_DETAIL_SELECT)
      .eq('slug', slug)
      .eq('status', 'approved')
      .maybeSingle(),
  );

  if (!row) return null;
  const place = mapLocationDetail(row);
  if (!place) return null;
  // The place's own name and description in the other language (0035).
  const translations = await translationsFor(supabase, 'location', [place.id]);
  place.translations = translations.get(place.id) ?? NO_TRANSLATIONS;
  return place;
}

/**
 * Nearby approved locations.
 *
 * PostGIS is not assumed here: `ST_DWithin` would need a database function to
 * call through PostgREST, and this module is restricted to the two functions the
 * schema guarantees. So the candidate set comes from a bounding box on the
 * indexed latitude and longitude columns and is then sorted by true great-circle
 * distance in process — see `boundingBoxAround` in lib/geo.ts.
 *
 * Distances are measured between *published* coordinates, so a sensitive place
 * cannot have its real position inferred from how far away it is said to be.
 */
export async function nearbyLocations(
  location: LocationDetail,
): Promise<Array<LocationSummary & { distanceMetres: number }>> {
  const origin = location.coordinates;
  if (!origin) return [];
  return approvedLocationsAround(origin, {
    excludeId: location.id,
    radiusMetres: NEARBY_RADIUS_METRES,
    limit: NEARBY_LIMIT,
  });
}

/**
 * The approved places within a radius of a point the member is about to
 * propose, for the upload wizard: "is it one of these?" before a duplicate
 * is created. The duplicate scan the moderator sees (`submitLocation`) looks
 * at the same radius; this shows the member the same places first.
 */
export async function locationsNear(
  point: { latitude: number; longitude: number },
  radiusMetres: number,
  limit: number,
): Promise<Array<LocationSummary & { distanceMetres: number }>> {
  return approvedLocationsAround(point, { excludeId: null, radiusMetres, limit });
}

async function approvedLocationsAround(
  origin: { latitude: number; longitude: number },
  options: { excludeId: string | null; radiusMetres: number; limit: number },
): Promise<Array<LocationSummary & { distanceMetres: number }>> {
  const supabase = await createClient();
  const box = boundingBoxAround(origin.latitude, origin.longitude, options.radiusMetres);

  let query = supabase
    .from('locations')
    .select(`${LOCATION_SUMMARY_FIELDS}, latitude, longitude, is_sensitive, withhold_coordinates, pin_precision`)
    .eq('status', 'approved')
    .eq('withhold_coordinates', false)
    .gte('latitude', box.south)
    .lte('latitude', box.north);
  if (options.excludeId) query = query.neq('id', options.excludeId);

  // Near the antimeridian the box wraps past ±180, where a simple between
  // filter would exclude everything. The latitude band plus the distance check
  // below still bounds the result, so the longitude filter is simply dropped.
  if (box.west >= -180 && box.east <= 180) {
    query = query.gte('longitude', box.west).lte('longitude', box.east);
  }

  const rows = unwrapList<LocationSummaryColumns & LocationPointColumns>(
    'reading nearby locations',
    await query.limit(120),
  );

  const nearby: Array<LocationSummary & { distanceMetres: number }> = [];
  for (const row of rows) {
    const summary = mapLocationSummary(row);
    const latitude = toNumber(row.latitude);
    const longitude = toNumber(row.longitude);
    if (!summary || latitude === null || longitude === null) continue;

    const point = publishableCoordinates(latitude, longitude, {
      precision: oneOrNull(PIN_PRECISIONS, row.pin_precision),
      isSensitive: row.is_sensitive === true,
      withhold: row.withhold_coordinates === true,
    });
    if (!point) continue;

    const metres = Math.round(distanceMetres(origin, point));
    if (metres > options.radiusMetres) continue;
    nearby.push({ ...summary, distanceMetres: metres });
  }

  const closest = nearby.sort((a, b) => a.distanceMetres - b.distanceMetres).slice(0, options.limit);
  // After the slice, so the query is about the places actually listed.
  await attachLocationNames(supabase, closest);
  return closest;
}

interface MapPinPhotograph {
  id: string | null;
  slug: string | null;
  title: string | null;
  category: string | null;
  appreciation_count: number | null;
  photograph_images: ImageColumns[] | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
}

/** The pin's card is drawn from the newest frame that actually has a thumbnail. */
function mapPinFrame(photograph: MapPinPhotograph | undefined, withPhotographer: boolean): MapPinFrame | null {
  const slug = toText(photograph?.slug);
  if (!photograph || !slug) return null;
  return {
    slug,
    title: toText(photograph.title) ?? 'Untitled',
    category: isCategory(photograph.category) ? photograph.category : 'street',
    appreciationCount: toNumber(photograph.appreciation_count) ?? 0,
    photographer: withPhotographer ? mapPhotographerSummary(firstOf<ProfileColumns>(photograph.profiles)) : null,
  };
}

interface MapPinJoined extends LocationSummaryColumns, LocationPointColumns {
  categories: unknown;
  photographs: MapPinPhotograph | MapPinPhotograph[] | null;
}

interface PhotographerPinLocation extends LocationSummaryColumns, LocationPointColumns {
  categories: unknown;
  status: string | null;
}

interface PhotographerPinRow {
  published_at: string | null;
  slug: string | null;
  title: string | null;
  category: string | null;
  appreciation_count: number | null;
  photograph_images: ImageColumns[] | null;
  location: PhotographerPinLocation | PhotographerPinLocation[] | null;
}

export async function mapPins(): Promise<MapPin[]> {
  const supabase = await createClient();

  const rows = unwrapList<MapPinJoined>(
    'reading map pins',
    await supabase
      .from('locations')
      .select(
        `${LOCATION_SUMMARY_FIELDS}, latitude, longitude, is_sensitive, withhold_coordinates, pin_precision,
         categories, photographs(id, slug, title, category, appreciation_count, published_at,
           photograph_images(${IMAGE_FIELDS}), profiles!owner_id(${PROFILE_SUMMARY_FIELDS}))`,
      )
      .eq('status', 'approved')
      .eq('withhold_coordinates', false)
      .eq('photographs.status', 'published')
      // Newest first, and more than one of them: a pin shows the latest frame
      // from the place with the ones before it stacked behind. The order is the
      // product rule — see `MapPin.recentImageUrls`.
      .order('published_at', { ascending: false, referencedTable: 'photographs' })
      .limit(MAP_PIN_PHOTOGRAPH_SAMPLE, { referencedTable: 'photographs' })
      .limit(MAP_PIN_LIMIT),
  );

  const pins: MapPin[] = [];
  for (const row of rows) {
    const summary = mapLocationSummary(row);
    const latitude = toNumber(row.latitude);
    const longitude = toNumber(row.longitude);
    if (!summary || latitude === null || longitude === null) continue;

    const point = publishableCoordinates(latitude, longitude, {
      precision: oneOrNull(PIN_PRECISIONS, row.pin_precision),
      isSensitive: row.is_sensitive === true,
      withhold: row.withhold_coordinates === true,
    });
    if (!point) continue;

    // One URL per photograph, in the order the query returned them. A
    // photograph whose thumbnail is missing is skipped rather than held as a
    // null, so the stack never has a hole in it.
    const recentImageUrls: string[] = [];
    let newest: MapPinPhotograph | undefined;
    for (const photograph of asArray<MapPinPhotograph>(row.photographs)) {
      const images = asArray<ImageColumns>(photograph?.photograph_images);
      const key =
        toText(images.find((image) => image.variant === 'thumb')?.storage_key) ??
        toText(images.find((image) => image.variant === 'grid')?.storage_key);
      if (key) {
        recentImageUrls.push(storagePublicUrl(key));
        newest ??= photograph;
      }
    }

    pins.push({
      ...summary,
      categories: toStringList(row.categories).filter(isCategory),
      latitude: point.latitude,
      longitude: point.longitude,
      isApproximate: point.isApproximate,
      previewImageUrl: recentImageUrls[0] ?? null,
      recentImageUrls,
      latest: mapPinFrame(newest, true),
    });
  }

  // The selected pin opens a LocationCard, which names the place.
  await attachLocationNames(supabase, pins);
  return pins;
}

/**
 * The places one photographer has actually stood — their own map.
 *
 * The same shape as `mapPins()` and deliberately not the same query. That one
 * answers "every place on FRAME"; this one answers "every place *this member*
 * has published a frame from", which is a different question with a different
 * join and, importantly, a different count: the number on a pin here is how many
 * of **their** photographs were made there, not the place's total. A profile
 * that claimed somebody had taken forty photographs at a corner because forty
 * other members had would be lying in the member's own name.
 *
 * It starts from `photographs` rather than from `locations` because the owner is
 * the filter, and RLS on `photographs` already restricts what may be read. The
 * same privacy rules still apply at the end: a place whose coordinates are
 * withheld is dropped, and a sensitive one is rounded, both by
 * `publishableCoordinates`.
 */
/**
 * Ids of the places where a member has a published photograph. Distinct, and
 * only places the map would show: approved, with a publishable point.
 */
export async function ownPhotographedLocationIds(ownerId: string): Promise<string[]> {
  const supabase = await createClient();
  const rows = unwrapList<{ location_id: string | null }>(
    'reading where a member has photographed',
    await supabase
      .from('photographs')
      .select('location_id, locations!inner(status, withhold_coordinates)')
      .eq('owner_id', ownerId)
      .eq('status', 'published')
      .eq('locations.status', 'approved')
      .eq('locations.withhold_coordinates', false)
      .not('location_id', 'is', null)
      .limit(AGGREGATE_SAMPLE_LIMIT),
  );
  return [...new Set(rows.map((row) => toText(row.location_id)).filter((id): id is string => id !== null))];
}

export async function photographerMapPins(ownerId: string): Promise<MapPin[]> {
  const supabase = await createClient();

  const rows = unwrapList<PhotographerPinRow>(
    'reading a photographer\'s map pins',
    await supabase
      .from('photographs')
      .select(
        `published_at, slug, title, category, appreciation_count,
         photograph_images(${IMAGE_FIELDS}),
         location:locations!inner(${LOCATION_SUMMARY_FIELDS}, latitude, longitude,
           is_sensitive, withhold_coordinates, categories, status)`,
      )
      .eq('owner_id', ownerId)
      .eq('status', 'published')
      .eq('locations.status', 'approved')
      .eq('locations.withhold_coordinates', false)
      .order('published_at', { ascending: false })
      .limit(MAP_PIN_LIMIT),
  );

  // Grouped here rather than in SQL: PostgREST cannot aggregate across an
  // embedded resource, and the alternative — a view or an RPC — is a migration
  // for an arithmetic this page can do while it reads the rows it already has.
  const byLocation = new Map<string, MapPin>();

  for (const row of rows) {
    const location = firstOf<PhotographerPinLocation>(row.location);
    const summary = mapLocationSummary(location ?? null);
    const latitude = toNumber(location?.latitude);
    const longitude = toNumber(location?.longitude);
    if (!summary || latitude === null || longitude === null) continue;

    const point = publishableCoordinates(latitude, longitude, {
      isSensitive: location?.is_sensitive === true,
      withhold: location?.withhold_coordinates === true,
    });
    if (!point) continue;

    const images = asArray<ImageColumns>(row.photograph_images);
    const key =
      toText(images.find((image) => image.variant === 'thumb')?.storage_key) ??
      toText(images.find((image) => image.variant === 'grid')?.storage_key);
    const url = key ? storagePublicUrl(key) : null;

    const existing = byLocation.get(summary.id);
    if (existing) {
      // Rows arrive newest first, so the frames already collected are newer than
      // this one and the stack keeps its order.
      existing.photographCount += 1;
      if (url && existing.recentImageUrls.length < MAP_PIN_PHOTOGRAPH_SAMPLE) {
        existing.recentImageUrls.push(url);
      }
      continue;
    }

    byLocation.set(summary.id, {
      ...summary,
      // Their count at this place, not the place's own.
      photographCount: 1,
      categories: toStringList(location?.categories).filter(isCategory),
      latitude: point.latitude,
      longitude: point.longitude,
      isApproximate: point.isApproximate,
      previewImageUrl: null,
      recentImageUrls: url ? [url] : [],
      latest: url
        ? mapPinFrame(
            {
              id: null,
              slug: toText(row.slug),
              title: toText(row.title),
              category: toText(row.category),
              appreciation_count: toNumber(row.appreciation_count),
              photograph_images: null,
              profiles: null,
            },
            false,
          )
        : null,
    });
  }

  // The preview is the newest frame that actually has a thumbnail, which is not
  // always the newest frame — the same rule as `mapPins()`, and the reason it is
  // read off the collected stack rather than set while grouping.
  const pins = [...byLocation.values()].map((pin) => ({
    ...pin,
    previewImageUrl: pin.recentImageUrls[0] ?? null,
  }));

  await attachLocationNames(supabase, pins);
  return pins;
}

export async function approvedLocationSlugs(): Promise<string[]> {
  const rows = unwrapList<{ slug: string | null }>(
    'listing approved location slugs',
    await publicClient()
      .from('locations')
      .select('slug')
      .eq('status', 'approved')
      .order('name', { ascending: true })
      .limit(SLUG_LIMIT),
  );

  return rows.map((row) => toText(row.slug)).filter((value): value is string => value !== null);
}

/* ------------------------------------------------------------------------ */
/* People                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Build full profiles for a set of accounts with a fixed number of queries.
 *
 * The three aggregates a profile shows are counted here rather than read from a
 * denormalised column, so they cannot drift from the photographs and locations
 * they claim to describe. The samples are bounded, which is noted on each
 * figure's follow-up rather than hidden.
 */
async function buildProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ProfileDetailColumns[],
): Promise<PhotographerProfile[]> {
  const ids = rows.map((row) => toText(row.id)).filter((value): value is string => value !== null);
  if (ids.length === 0) return [];

  const [photographRows, locationRows] = await Promise.all([
    supabase
      .from('photographs')
      .select('owner_id, appreciation_count')
      .in('owner_id', ids)
      .eq('status', 'published')
      .limit(AGGREGATE_SAMPLE_LIMIT),
    supabase
      .from('locations')
      .select('submitted_by')
      .in('submitted_by', ids)
      .eq('status', 'approved')
      .limit(AGGREGATE_SAMPLE_LIMIT),
  ]);

  const photographs = unwrapList<{ owner_id: string | null; appreciation_count: number | null }>(
    'counting published photographs per photographer',
    photographRows,
  );
  const contributions = unwrapList<{ submitted_by: string | null }>(
    'counting approved locations per photographer',
    locationRows,
  );

  const photographCounts = new Map<string, number>();
  const appreciationTotals = new Map<string, number>();
  for (const row of photographs) {
    const ownerId = toText(row.owner_id);
    if (!ownerId) continue;
    photographCounts.set(ownerId, (photographCounts.get(ownerId) ?? 0) + 1);
    appreciationTotals.set(
      ownerId,
      (appreciationTotals.get(ownerId) ?? 0) + (toNumber(row.appreciation_count) ?? 0),
    );
  }

  const locationCounts = new Map<string, number>();
  for (const row of contributions) {
    const submitter = toText(row.submitted_by);
    if (!submitter) continue;
    locationCounts.set(submitter, (locationCounts.get(submitter) ?? 0) + 1);
  }

  const profiles: PhotographerProfile[] = [];
  for (const row of rows) {
    const summary = mapPhotographerSummary(row);
    if (!summary) continue;

    profiles.push({
      ...summary,
      biography: toText(row.biography),
      translations: NO_TRANSLATIONS,
      website: toText(row.website),
      countryCode: toText(row.country_code),
      styles: toStringList(row.style_tags).filter(isPhotographyStyle),
      collaboration: oneOrNull(COLLABORATION_STATUSES, row.collaboration_status),
      critique: oneOrNull(CRITIQUE_PREFERENCES, row.critique_preference),
      // Filtered on the way out as well as on the way in: the column is
      // constrained to http(s) by the database, and a value that somehow is not
      // would become an href on a public page.
      socialLinks: toStringList(row.social_links).filter(isHttpUrl),
      cover: mapProfileCover(row, summary.id),
      usualGear: toStringList(row.usual_gear),
      photographCount: photographCounts.get(summary.id) ?? 0,
      appreciationsReceived: appreciationTotals.get(summary.id) ?? 0,
      locationsContributed: locationCounts.get(summary.id) ?? 0,
      // These two are columns rather than aggregates: a trigger recounts them
      // from profile_follows, so reading a profile costs nothing extra.
      followerCount: toNumber(row.follower_count) ?? 0,
      followingCount: toNumber(row.following_count) ?? 0,
      memberSince: toText(row.member_since) ?? toText(row.created_at) ?? '',
      role: oneOf(['member', 'moderator', 'admin'] as const, row.role, 'member'),
    });
  }

  // One query for every profile being built (0035).
  const translations = await translationsFor(supabase, 'profile', ids);
  for (const profile of profiles) {
    profile.translations = translations.get(profile.id) ?? NO_TRANSLATIONS;
  }

  return profiles;
}

export async function photographerByUsername(
  username: string,
): Promise<PhotographerProfile | null> {
  const supabase = await createClient();

  const row = unwrap<ProfileDetailColumns>(
    `reading photographer "${username}"`,
    await supabase
      .from('profiles')
      .select(PROFILE_DETAIL_FIELDS)
      .eq('username', username.trim().toLowerCase())
      // A suspended account has no public profile page. The row still exists
      // for moderators; it is simply not served here.
      .eq('is_suspended', false)
      .maybeSingle(),
  );

  if (!row) return null;
  const [profile] = await buildProfiles(supabase, [row]);
  return profile ?? null;
}

/**
 * The photographers whose published work has earned the most appreciation.
 *
 * Computed from a bounded window of the most-appreciated published
 * photographs. When nothing has been published yet this returns an empty list
 * rather than falling back to "newest members", because presenting new accounts
 * as featured ones would be a quiet fiction.
 */
export async function featuredPhotographers(limit = 4): Promise<PhotographerProfile[]> {
  const supabase = await createClient();
  const wanted = Math.max(1, Math.min(24, Math.floor(limit) || 4));

  const topPhotographs = unwrapList<{ owner_id: string | null; appreciation_count: number | null }>(
    'reading the featured photographers pool',
    await supabase
      .from('photographs')
      .select('owner_id, appreciation_count')
      .eq('status', 'published')
      .order('appreciation_count', { ascending: false })
      .limit(FEATURED_POOL),
  );

  const totals = new Map<string, number>();
  for (const row of topPhotographs) {
    const ownerId = toText(row.owner_id);
    if (!ownerId) continue;
    totals.set(ownerId, (totals.get(ownerId) ?? 0) + (toNumber(row.appreciation_count) ?? 0));
  }

  const ranked = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, wanted)
    .map(([id]) => id);

  if (ranked.length === 0) return [];

  const rows = unwrapList<ProfileDetailColumns>(
    'reading featured photographer profiles',
    await supabase
      .from('profiles')
      .select(PROFILE_DETAIL_FIELDS)
      .in('id', ranked)
      .eq('is_suspended', false),
  );

  const profiles = await buildProfiles(supabase, rows);
  const order = new Map(ranked.map((id, index) => [id, index]));
  return profiles.sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export async function photographerUsernames(): Promise<string[]> {
  const rows = unwrapList<{ username: string | null }>(
    'listing photographer usernames',
    await publicClient()
      .from('profiles')
      .select('username')
      .eq('is_suspended', false)
      .order('username', { ascending: true })
      .limit(SLUG_LIMIT),
  );

  return rows.map((row) => toText(row.username)).filter((value): value is string => value !== null);
}

/* ------------------------------------------------------------------------ */
/* Collections                                                              */
/* ------------------------------------------------------------------------ */

type CollectionColumns = Nullable<
  Pick<
    Tables<'collections'>,
    | 'id'
    | 'slug'
    | 'title'
    | 'description'
    | 'visibility'
    | 'item_count'
    | 'updated_at'
    | 'cover_photograph_id'
  >
>;

interface CollectionJoined extends CollectionColumns {
  profiles: ProfileColumns | ProfileColumns[] | null;
}

const COLLECTION_SELECT: string = `
  id, slug, title, description, visibility, item_count, updated_at, cover_photograph_id,
  profiles(${PROFILE_SUMMARY_FIELDS})
`;

/**
 * Cover images for several collections in one query.
 *
 * `cover_photograph_id` is not declared as a foreign key in the schema, so it
 * cannot be embedded; resolving it separately keeps this to two queries instead
 * of one per collection.
 */
async function coverImageUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photographIds: string[],
): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  if (photographIds.length === 0) return covers;

  const rows = unwrapList<{ photograph_id: string | null } & ImageColumns>(
    'reading collection cover images',
    await supabase
      .from('photograph_images')
      .select(`photograph_id, ${IMAGE_FIELDS}`)
      .in('photograph_id', photographIds)
      .in('variant', ['grid', 'thumb']),
  );

  for (const row of rows) {
    const photographId = toText(row.photograph_id);
    const key = toText(row.storage_key);
    if (!photographId || !key) continue;
    // Prefer the gallery derivative; a thumb only fills in when there is no grid.
    if (row.variant === 'grid' || !covers.has(photographId)) {
      covers.set(photographId, storagePublicUrl(key));
    }
  }

  return covers;
}

function mapCollection(
  row: CollectionJoined,
  coverImageUrl: string | null,
): Collection | null {
  const id = toText(row.id);
  const slug = toText(row.slug);
  const title = toText(row.title);
  const owner = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
  if (!id || !slug || !title || !owner) return null;

  const visibility: CollectionVisibility = row.visibility === 'public' ? 'public' : 'private';

  return {
    id,
    slug,
    title,
    description: toText(row.description),
    visibility,
    owner,
    itemCount: toNumber(row.item_count) ?? 0,
    coverImageUrl,
    updatedAt: toText(row.updated_at) ?? '',
  };
}

export async function collections(
  options: { ownerId?: string; includePrivate?: boolean } = {},
): Promise<Collection[]> {
  const supabase = await createClient();

  let query = supabase.from('collections').select(COLLECTION_SELECT);
  if (options.ownerId) query = query.eq('owner_id', options.ownerId);
  // `includePrivate` only shapes the query. Whether the viewer may actually see
  // a private collection is decided by row-level security, which is why this is
  // not a permission check.
  if (!options.includePrivate) query = query.eq('visibility', 'public');

  const rows = unwrapList<CollectionJoined>(
    'reading collections',
    await query.order('updated_at', { ascending: false }).limit(COLLECTION_LIST_LIMIT),
  );

  const coverIds = rows
    .map((row) => toText(row.cover_photograph_id))
    .filter((value): value is string => value !== null);
  const covers = await coverImageUrls(supabase, coverIds);

  const mapped: Collection[] = [];
  for (const row of rows) {
    const coverId = toText(row.cover_photograph_id);
    const collection = mapCollection(row, (coverId ? covers.get(coverId) : null) ?? null);
    if (collection) mapped.push(collection);
  }
  return mapped;
}

interface CollectionItemColumns {
  id: string | null;
  note: string | null;
  added_at: string | null;
  photograph_id: string | null;
  location_id: string | null;
}

/* ------------------------------------------------------------------------ */
/* Photobooks                                                               */
/* ------------------------------------------------------------------------ */

type PhotobookColumns = Nullable<
  Pick<
    Tables<'photobooks'>,
    | 'id' | 'owner_id' | 'slug' | 'title' | 'dedication' | 'cover_preset' | 'paper_preset'
    | 'gear_mode' | 'gear_brand' | 'gear_model' | 'visibility' | 'opens' | 'position' | 'updated_at'
  >
>;

interface PhotobookJoined extends PhotobookColumns {
  profiles: ProfileColumns | ProfileColumns[] | null;
}

/**
 * The owner is named by column: `profiles` and `photobooks` have one join, but
 * every embed between a photograph and a profile in this file names its
 * relationship, and a reader should not have to work out which tables need it.
 */
const PHOTOBOOK_SELECT = `
  id, owner_id, slug, title, dedication, cover_preset, paper_preset, gear_mode, gear_brand,
  gear_model, visibility, opens, position, updated_at, profiles!owner_id(${PROFILE_SUMMARY_FIELDS})
`;

/**
 * A book and its pages, in order. A page whose photograph is no longer
 * published is left out rather than shown as a hole: the pages table keeps the
 * member's order, the photographs table says what may be seen, and only the
 * second one is a permission.
 */
async function assemblePhotobook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: PhotobookJoined,
): Promise<Photobook | null> {
  const id = toText(row.id);
  const slug = toText(row.slug);
  const title = toText(row.title);
  const owner = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
  if (!id || !slug || !title || !owner) return null;

  const pageRows = unwrapList<{ photograph_id: string | null; position: number | null }>(
    `reading the pages of photobook "${slug}"`,
    await supabase
      .from('photobook_pages')
      .select('photograph_id, position')
      .eq('photobook_id', id)
      .order('position', { ascending: true })
      .limit(PHOTOBOOK_MAX_PAGES),
  );

  const photographIds = pageRows
    .map((page) => toText(page.photograph_id))
    .filter((value): value is string => value !== null);

  const photographs =
    photographIds.length > 0
      ? await mapPhotographRows(
          supabase,
          unwrapList<PhotographJoined>(
            `reading the photographs of photobook "${slug}"`,
            await supabase
              .from('photographs')
              .select(photographSelect())
              .in('id', photographIds)
              .eq('status', 'published'),
          ),
        )
      : [];
  const byId = new Map(photographs.map((photo) => [photo.id, photo]));

  const pages: PhotobookPage[] = [];
  for (const page of pageRows) {
    const photograph = byId.get(toText(page.photograph_id) ?? '');
    const position = toNumber(page.position);
    if (!photograph || position === null) continue;
    pages.push({ position, photograph });
  }

  return photobookFromRow(row, { id, slug, title, owner, pages });
}

/**
 * The scalar fields of a book, shared by the single-book reads and the public
 * listing so a cover or a visibility cannot be mapped two different ways.
 */
function photobookFromRow(
  row: PhotobookColumns,
  parts: { id: string; slug: string; title: string; owner: PhotographerSummary; pages: PhotobookPage[] },
): Photobook {
  return {
    id: parts.id,
    slug: parts.slug,
    title: parts.title,
    dedication: toText(row.dedication),
    cover: oneOf(PHOTOBOOK_COVERS, row.cover_preset, 'linen'),
    paper: oneOf(PHOTOBOOK_PAPERS, row.paper_preset, 'lustre'),
    gearMode: oneOf(PHOTOBOOK_GEAR_MODES, row.gear_mode, 'none'),
    gearBrand: toText(row.gear_brand),
    gearModel: toText(row.gear_model),
    visibility: row.visibility === 'public' ? 'public' : 'unlisted',
    opens: toNumber(row.opens) ?? 0,
    position: toNumber(row.position) ?? 1,
    owner: parts.owner,
    pages: parts.pages,
    updatedAt: toText(row.updated_at) ?? '',
  };
}

/** Public or unlisted both answer by address; the policy already says so. */
export async function photobookBySlug(slug: string): Promise<Photobook | null> {
  const supabase = await createClient();
  const row = unwrap<PhotobookJoined>(
    `reading photobook "${slug}"`,
    await supabase.from('photobooks').select(PHOTOBOOK_SELECT).eq('slug', slug).maybeSingle(),
  );
  return row ? assemblePhotobook(supabase, row) : null;
}

/**
 * The books on the public shelf, most-opened first.
 *
 * ONLY `public` BOOKS. An unlisted book answers by its address and appears on
 * nothing that lists books — that is the whole difference between the two
 * visibilities, and it is enforced here as well as by the policy, so a shelf
 * can never become the thing that reveals a book its owner kept off their
 * profile.
 *
 * Three queries however long the shelf is: the books, then every page of those
 * books, then every photograph those pages name. Assembling each book on its
 * own would be two more queries per book, which is how a shelf of twelve turns
 * into twenty-five round trips.
 */
export async function publicPhotobooks(limit: number): Promise<Photobook[]> {
  const supabase = await createClient();
  const rows = unwrapList<PhotobookJoined>(
    'reading the public photobooks',
    await supabase
      .from('photobooks')
      .select(PHOTOBOOK_SELECT)
      .eq('visibility', 'public')
      .order('opens', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit),
  );
  return assemblePhotobooks(supabase, rows, 'the public photobooks');
}

/**
 * One member's shelf, in the order they put it. Every book, public and
 * unlisted: the caller decides what a given reader may see on a profile,
 * which the policy already allows them to read by address anyway.
 */
export async function photobooksByOwner(ownerId: string): Promise<Photobook[]> {
  const supabase = await createClient();
  const rows = unwrapList<PhotobookJoined>(
    "reading a member's photobooks",
    await supabase
      .from('photobooks')
      .select(PHOTOBOOK_SELECT)
      .eq('owner_id', ownerId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  );
  return assemblePhotobooks(supabase, rows, "a member's photobooks");
}

/** Many books in three queries, whatever the count — see `publicPhotobooks`. */
async function assemblePhotobooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: readonly PhotobookJoined[],
  what: string,
): Promise<Photobook[]> {
  if (rows.length === 0) return [];

  const bookIds = rows
    .map((row) => toText(row.id))
    .filter((value): value is string => value !== null);
  if (bookIds.length === 0) return [];

  const pageRows = unwrapList<{
    photobook_id: string | null;
    photograph_id: string | null;
    position: number | null;
  }>(
    `reading the pages of ${what}`,
    await supabase
      .from('photobook_pages')
      .select('photobook_id, photograph_id, position')
      .in('photobook_id', bookIds)
      .order('position', { ascending: true })
      .limit(bookIds.length * PHOTOBOOK_MAX_PAGES),
  );

  const photographIds = [
    ...new Set(
      pageRows
        .map((page) => toText(page.photograph_id))
        .filter((value): value is string => value !== null),
    ),
  ];

  const photographs =
    photographIds.length > 0
      ? await mapPhotographRows(
          supabase,
          unwrapList<PhotographJoined>(
            `reading the photographs of ${what}`,
            await supabase
              .from('photographs')
              .select(photographSelect())
              .in('id', photographIds)
              .eq('status', 'published'),
          ),
        )
      : [];
  const byId = new Map(photographs.map((photo) => [photo.id, photo]));

  const pagesByBook = new Map<string, PhotobookPage[]>();
  for (const page of pageRows) {
    const bookId = toText(page.photobook_id);
    const position = toNumber(page.position);
    const photograph = byId.get(toText(page.photograph_id) ?? '');
    // A page whose photograph is no longer published is left out, exactly as
    // the single-book read leaves it out.
    if (!bookId || position === null || !photograph) continue;
    const list = pagesByBook.get(bookId);
    if (list) list.push({ position, photograph });
    else pagesByBook.set(bookId, [{ position, photograph }]);
  }

  const books: Photobook[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const slug = toText(row.slug);
    const title = toText(row.title);
    const owner = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
    if (!id || !slug || !title || !owner) continue;
    books.push(photobookFromRow(row, { id, slug, title, owner, pages: pagesByBook.get(id) ?? [] }));
  }
  return books;
}

/**
 * Counts an open. Fire-and-forget from the page: a failure to count is logged
 * and never stops the book being shown.
 */
export async function countPhotobookOpen(slug: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('bump_photobook_opens', { p_slug: slug });
  if (error) console.error(`FRAME data: counting an open of photobook "${slug}" failed — ${error.message}`);
}

export async function collectionBySlug(
  slug: string,
  options: { includePrivate?: boolean } = {},
): Promise<(Collection & { items: CollectionItem[] }) | null> {
  const supabase = await createClient();

  const row = unwrap<CollectionJoined>(
    `reading collection "${slug}"`,
    await supabase.from('collections').select(COLLECTION_SELECT).eq('slug', slug).maybeSingle(),
  );
  if (!row) return null;
  if (row.visibility !== 'public' && !options.includePrivate) return null;

  const collectionId = toText(row.id);
  if (!collectionId) return null;

  const itemRows = unwrapList<CollectionItemColumns>(
    `reading the items in collection "${slug}"`,
    await supabase
      .from('collection_items')
      .select('id, note, added_at, photograph_id, location_id')
      .eq('collection_id', collectionId)
      .order('added_at', { ascending: false })
      .limit(COLLECTION_ITEM_LIMIT),
  );

  const photographIds = itemRows
    .map((item) => toText(item.photograph_id))
    .filter((value): value is string => value !== null);
  const locationIds = itemRows
    .map((item) => toText(item.location_id))
    .filter((value): value is string => value !== null);

  // `collection_items` references photographs and locations without a declared
  // foreign key, so the two sides are fetched by id and stitched here. Still two
  // queries for the whole collection rather than one per item.
  const [photographRows, locationRows] = await Promise.all([
    photographIds.length > 0
      ? supabase
          .from('photographs')
          .select(photographSelect())
          .in('id', photographIds)
          .eq('status', 'published')
      : null,
    locationIds.length > 0
      ? supabase
          .from('locations')
          .select(LOCATION_SUMMARY_FIELDS)
          .in('id', locationIds)
          .eq('status', 'approved')
      : null,
  ]);

  const photographs = photographRows
    ? await mapPhotographRows(
        supabase,
        unwrapList<PhotographJoined>(`reading photographs in collection "${slug}"`, photographRows),
      )
    : [];
  const locationSummaries = locationRows
    ? unwrapList<LocationSummaryColumns>(
        `reading locations in collection "${slug}"`,
        locationRows,
      )
        .map(mapLocationSummary)
        .filter((value): value is LocationSummary => value !== null)
    : [];
  await attachLocationNames(supabase, locationSummaries);

  const photographsById = new Map(photographs.map((photo) => [photo.id, photo]));
  const locationsById = new Map(locationSummaries.map((location) => [location.id, location]));

  const items: CollectionItem[] = [];
  for (const item of itemRows) {
    const id = toText(item.id);
    if (!id) continue;

    const photographId = toText(item.photograph_id);
    const locationId = toText(item.location_id);
    const photograph = photographId ? photographsById.get(photographId) ?? null : null;
    const location = locationId ? locationsById.get(locationId) ?? null : null;

    // An item whose subject is no longer published or approved is left out
    // rather than rendered as an empty card.
    if (!photograph && !location) continue;

    items.push({
      id,
      note: toText(item.note),
      addedAt: toText(item.added_at) ?? '',
      photograph,
      location,
    });
  }

  const coverId = toText(row.cover_photograph_id);
  const covers = await coverImageUrls(supabase, coverId ? [coverId] : []);
  const fallbackCover = items.find((item) => item.photograph)?.photograph?.image.gridUrl ?? null;
  const collection = mapCollection(row, (coverId ? covers.get(coverId) : null) ?? fallbackCover);
  if (!collection) return null;

  return { ...collection, items };
}

export async function publicCollectionSlugs(): Promise<string[]> {
  const rows = unwrapList<{ slug: string | null }>(
    'listing public collection slugs',
    await publicClient()
      .from('collections')
      .select('slug')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(SLUG_LIMIT),
  );

  return rows.map((row) => toText(row.slug)).filter((value): value is string => value !== null);
}

/* ------------------------------------------------------------------------ */
/* Stats                                                                    */
/* ------------------------------------------------------------------------ */

export async function platformStats(): Promise<PlatformStats> {
  const supabase = await createClient();

  const [photographRows, locationRows, photographerRows, countryRows] = await Promise.all([
    supabase
      .from('photographs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase.from('locations').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    // Every account that has not been suspended, which is what "photographers"
    // means here: members who have joined. It is deliberately not "members with
    // published work", because PostgREST cannot count that distinctly and an
    // estimate presented as a count would be the wrong kind of number.
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_suspended', false),
    // Postgres has no DISTINCT through PostgREST, so the distinct countries are
    // counted here over a bounded sample of approved locations.
    supabase
      .from('locations')
      .select('country_code')
      .eq('status', 'approved')
      .limit(AGGREGATE_SAMPLE_LIMIT),
  ]);

  const countries = new Set(
    unwrapList<{ country_code: string | null }>('counting countries', countryRows)
      .map((row) => toText(row.country_code)?.toUpperCase())
      .filter((value): value is string => value !== undefined && value !== null),
  );

  return {
    photographs: unwrapCount('counting published photographs', photographRows),
    locations: unwrapCount('counting approved locations', locationRows),
    countries: countries.size,
    photographers: unwrapCount('counting photographers', photographerRows),
    // These are real figures from a real database, which is the whole point of
    // the flag travelling with them.
    isDemoData: false,
  };
}

/* ------------------------------------------------------------------------ */
/* Moderation                                                               */
/* ------------------------------------------------------------------------ */

interface SubmissionJoined {
  id: string | null;
  proposed_name: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  status: string | null;
  signals: unknown;
  rejection_reason: string | null;
  created_at: string | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
}

function mapSignals(value: unknown): SubmissionSignal[] {
  if (!Array.isArray(value)) return [];

  const signals: SubmissionSignal[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    const message = toText(candidate.message);
    if (!message) continue;

    const signal: SubmissionSignal = {
      kind: oneOf(SIGNAL_KINDS, candidate.kind, 'low-precision'),
      severity: oneOf(SIGNAL_SEVERITIES, candidate.severity, 'info'),
      message,
    };

    const relatedId = toText(candidate.relatedId);
    const relatedLabel = toText(candidate.relatedLabel);
    const metres = toNumber(candidate.distanceMetres);

    signals.push({
      ...signal,
      ...(relatedId ? { relatedId } : {}),
      ...(relatedLabel ? { relatedLabel } : {}),
      ...(metres === null ? {} : { distanceMetres: Math.round(metres) }),
    });
  }
  return signals;
}

async function pendingSubmissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<LocationSubmission[]> {
  const rows = unwrapList<SubmissionJoined>(
    'reading the location submission queue',
    await supabase
      .from('location_submissions')
      .select(
        `id, proposed_name, city, country, country_code, latitude, longitude, note, status,
         signals, rejection_reason, created_at,
         profiles!submitted_by(${PROFILE_SUMMARY_FIELDS})`,
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE.moderation),
  );

  const submissions: LocationSubmission[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const proposedName = toText(row.proposed_name);
    const submittedBy = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
    const latitude = toNumber(row.latitude);
    const longitude = toNumber(row.longitude);

    // An unattributed submission cannot be moderated: the decision has to be
    // communicated to somebody.
    if (!id || !proposedName || !submittedBy || latitude === null || longitude === null) {
      if (id) {
        console.warn(`FRAME data: location submission ${id} is incomplete and was skipped.`);
      }
      continue;
    }

    submissions.push({
      id,
      proposedName,
      city: toText(row.city) ?? '',
      country: toText(row.country) ?? '',
      countryCode: (toText(row.country_code) ?? '').toUpperCase(),
      latitude,
      longitude,
      note: toText(row.note),
      status: oneOf(SUBMISSION_STATUSES, row.status, 'pending'),
      submittedBy,
      createdAt: toText(row.created_at) ?? '',
      signals: mapSignals(row.signals),
      rejectionReason: toText(row.rejection_reason),
    });
  }
  return submissions;
}

interface ReportJoined {
  id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  subject_label: string | null;
  reason: string | null;
  details: string | null;
  status: string | null;
  created_at: string | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
}

async function openReports(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Report[]> {
  const rows = unwrapList<ReportJoined>(
    'reading the report queue',
    await supabase
      .from('reports')
      .select(
        `id, subject_type, subject_id, subject_label, reason, details, status, created_at,
         profiles!reported_by(${PROFILE_SUMMARY_FIELDS})`,
      )
      .in('status', ['open', 'reviewing'])
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE.moderation),
  );

  const reports: Report[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const subjectId = toText(row.subject_id);
    if (!id || !subjectId) continue;

    reports.push({
      id,
      subjectType: oneOf(REPORT_SUBJECT_TYPES, row.subject_type, 'photograph'),
      subjectId,
      subjectLabel: toText(row.subject_label) ?? 'Unlabelled subject',
      reason: oneOf(REPORT_REASONS as readonly ReportReason[], row.reason, 'other'),
      details: toText(row.details),
      status: oneOf(REPORT_STATUSES, row.status, 'open'),
      createdAt: toText(row.created_at) ?? '',
      // Null for a report filed by a signed-out visitor, which is allowed.
      reportedBy: mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles)),
    });
  }
  return reports;
}

type SuspiciousMetadataColumns = Nullable<
  Pick<
    Tables<'photograph_metadata'>,
    | 'camera_brand_text'
    | 'camera_model_text'
    | 'lens_brand_text'
    | 'lens_model_text'
    | 'focal_length_mm'
    | 'aperture'
    | 'shutter_speed'
    | 'iso'
    | 'editing_software'
    | 'editing_notes'
    | 'exif_source'
    | 'film_stock'
    | 'film_camera'
    | 'film_scanner'
  >
>;

type SuspiciousLocationColumns = Nullable<
  Pick<Tables<'locations'>, 'name' | 'slug' | 'latitude' | 'longitude'>
>;

interface SuspiciousJoined {
  id: string | null;
  title: string | null;
  description: string | null;
  alt_text: string | null;
  category: string | null;
  public_captured_at: string | null;
  publish_captured_at: boolean | null;
  created_at: string | null;
  image_width: number | null;
  image_height: number | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
  photograph_images: ImageColumns[] | null;
  photograph_metadata: SuspiciousMetadataColumns | SuspiciousMetadataColumns[] | null;
  locations: SuspiciousLocationColumns | SuspiciousLocationColumns[] | null;
  photograph_content_checks: ContentCheckColumns | ContentCheckColumns[] | null;
}

interface ContentCheckColumns {
  verdict: string | null;
  note: string | null;
}

/** How far EXIF may sit from the stated location before it is worth a look. */
const EXIF_CONFLICT_METRES = 2_000;
const BURST_WINDOW_MINUTES = 10;
const BURST_THRESHOLD = 3;

/**
 * The upload review queue, with its signals derived rather than stored.
 *
 * The schema keeps no signals table for uploads, so each signal is recomputed
 * from the row it describes. They are hints for a human: none of them is
 * evidence of anything, and none of them removes a photograph on its own.
 */
async function suspiciousUploads(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<SuspiciousUpload[]> {
  const rows = unwrapList<SuspiciousJoined>(
    'reading the upload review queue',
    await supabase
      .from('photographs')
      .select(
        `id, title, description, alt_text, category, public_captured_at, publish_captured_at,
         created_at, image_width, image_height,
         profiles!owner_id(${PROFILE_SUMMARY_FIELDS}),
         photograph_images(${IMAGE_FIELDS}),
         photograph_metadata(camera_brand_text, camera_model_text, lens_brand_text, lens_model_text,
           focal_length_mm, aperture, shutter_speed, iso, editing_software, editing_notes,
           exif_source, film_stock, film_camera, film_scanner),
         locations(name, slug, latitude, longitude),
         photograph_content_checks(verdict, note)`,
      )
      .eq('status', 'under_review')
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE.moderation),
  );

  // The raw camera position is not readable column by column (0015); moderators
  // read it through photograph_exif_positions(), once for the whole queue.
  const positionById = new Map<string, { latitude: number; longitude: number }>();
  const queuedIds = rows.map((row) => toText(row.id)).filter((id): id is string => Boolean(id));
  if (queuedIds.length > 0) {
    const { data: positions, error: positionsError } = await supabase.rpc('photograph_exif_positions', {
      p_photograph_ids: queuedIds,
    });
    if (positionsError) {
      console.error(`FRAME data: reading camera positions for the review queue failed — ${positionsError.message}`);
    } else {
      for (const position of (positions ?? []) as Array<{
        photograph_id: string | null;
        latitude: number | null;
        longitude: number | null;
      }>) {
        if (position.photograph_id && position.latitude !== null && position.longitude !== null) {
          positionById.set(position.photograph_id, { latitude: position.latitude, longitude: position.longitude });
        }
      }
    }
  }

  // Published frames each queued upload looks like (0037), once for the whole
  // queue. The RPC admits a moderator and gives anyone else no rows, so this
  // is also what keeps the fingerprint comparison off every other page.
  const matchesById = new Map<string, UploadSignal[]>();
  if (queuedIds.length > 0) {
    const { data: matches, error: matchesError } = await supabase.rpc('similar_photographs', {
      p_photograph_ids: queuedIds,
      p_max_distance: UPLOAD_POLICY.perceptualMatchMaxDistance,
    });
    if (matchesError) {
      console.error(`FRAME data: comparing fingerprints for the review queue failed — ${matchesError.message}`);
    } else {
      for (const match of matches ?? []) {
        const list = matchesById.get(match.photograph_id) ?? [];
        list.push({
          kind: 'perceptual-hash-match',
          severity: 'high',
          message: match.same_owner
            ? `Looks like “${match.match_title}”, already published by this member — ${match.distance} of 64 bits differ. A re-upload of their own work, or a near-duplicate frame.`
            : `Looks like “${match.match_title}” by @${match.match_username} — ${match.distance} of 64 bits differ. Put the two side by side; the fingerprint cannot say which came first.`,
          relatedLabel: `/photographs/${match.match_slug}`,
        });
        matchesById.set(match.photograph_id, list);
      }
    }
  }

  const uploadsPerOwner = new Map<string, string[]>();
  for (const row of rows) {
    const owner = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
    const createdAt = toText(row.created_at);
    if (!owner || !createdAt) continue;
    const list = uploadsPerOwner.get(owner.id) ?? [];
    list.push(createdAt);
    uploadsPerOwner.set(owner.id, list);
  }

  const uploads: SuspiciousUpload[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const uploader = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
    if (!id || !uploader) continue;

    const images = asArray<ImageColumns>(row.photograph_images);
    const thumbKey =
      toText(images.find((image) => image.variant === 'thumb')?.storage_key) ??
      toText(images.find((image) => image.variant === 'grid')?.storage_key);
    if (!thumbKey) {
      // Nothing has been stored yet, so there is nothing to review visually.
      console.warn(`FRAME data: photograph ${id} is under review with no stored derivative.`);
      continue;
    }

    const metadata = firstOf<SuspiciousMetadataColumns>(row.photograph_metadata);
    const location = firstOf<SuspiciousLocationColumns>(row.locations);
    const signals: UploadSignal[] = [];

    // The automated content check comes first: when it is why the upload is
    // here, it is what the moderator needs to read before anything else.
    const contentCheck = firstOf<ContentCheckColumns>(row.photograph_content_checks);
    const checkVerdict = toText(contentCheck?.verdict);
    if (checkVerdict === 'review') {
      signals.push({
        kind: 'content-flagged',
        severity: 'high',
        message: toText(contentCheck?.note) ?? 'The automated content check held this image.',
      });
    } else if (checkVerdict !== 'clear') {
      signals.push({
        kind: 'content-unchecked',
        severity: 'info',
        message:
          toText(contentCheck?.note) ?? 'No automated content check was recorded, so it needs a person.',
      });
    }

    // A possible re-upload is the second thing to read: it is why the server
    // held the frame, and the caveat under the signals says what it cannot mean.
    signals.push(...(matchesById.get(id) ?? []));

    const width = toNumber(row.image_width);
    const height = toNumber(row.image_height);
    if (
      (width !== null && width < UPLOAD_POLICY.minPixelWidth) ||
      (height !== null && height < UPLOAD_POLICY.minPixelHeight)
    ) {
      signals.push({
        kind: 'low-resolution',
        severity: 'warn',
        message: `Stored at ${width ?? '?'}×${height ?? '?'}, below the ${UPLOAD_POLICY.minPixelWidth}×${UPLOAD_POLICY.minPixelHeight} minimum.`,
      });
    }

    const hasCamera = Boolean(toText(metadata?.camera_brand_text) ?? toText(metadata?.camera_model_text));
    if (!metadata || (!hasCamera && !metadata.exif_source)) {
      signals.push({
        kind: 'exif-missing',
        severity: 'info',
        message: 'No EXIF was read from the file. Missing EXIF is common and proves nothing.',
      });
    }

    const exifLatitude = positionById.get(id)?.latitude ?? null;
    const exifLongitude = positionById.get(id)?.longitude ?? null;
    const locationLatitude = toNumber(location?.latitude);
    const locationLongitude = toNumber(location?.longitude);
    if (
      exifLatitude !== null &&
      exifLongitude !== null &&
      locationLatitude !== null &&
      locationLongitude !== null
    ) {
      const metres = Math.round(
        distanceMetres(
          { latitude: exifLatitude, longitude: exifLongitude },
          { latitude: locationLatitude, longitude: locationLongitude },
        ),
      );
      if (metres > EXIF_CONFLICT_METRES) {
        signals.push({
          kind: 'exif-conflict',
          severity: 'warn',
          message: `EXIF position sits ${metres} m from the chosen place.`,
          relatedLabel: toText(location?.name) ?? undefined,
        });
      }
    }

    const createdAt = toText(row.created_at);
    if (createdAt) {
      const createdMs = new Date(createdAt).getTime();
      const neighbours = (uploadsPerOwner.get(uploader.id) ?? []).filter((other) => {
        const otherMs = new Date(other).getTime();
        if (Number.isNaN(createdMs) || Number.isNaN(otherMs)) return false;
        return Math.abs(otherMs - createdMs) <= BURST_WINDOW_MINUTES * 60_000;
      });
      if (neighbours.length >= BURST_THRESHOLD) {
        signals.push({
          kind: 'burst-upload',
          severity: 'info',
          message: `${neighbours.length} uploads from this account within ${BURST_WINDOW_MINUTES} minutes.`,
        });
      }
    }

    const displayKey = toText(images.find((image) => image.variant === 'display')?.storage_key);
    const joinText = (...parts: Array<string | null | undefined>): string | null => {
      const text = parts.map((part) => toText(part)).filter(Boolean).join(' ');
      return text.length > 0 ? text : null;
    };
    const locationName = toText(location?.name);

    uploads.push({
      // There is no separate queue table, so the photograph identifies the entry.
      id,
      photographId: id,
      title: toText(row.title) ?? 'Untitled',
      thumbUrl: storagePublicUrl(thumbKey),
      uploader,
      createdAt: createdAt ?? '',
      signals,
      details: {
        displayUrl: displayKey ? storagePublicUrl(displayKey) : null,
        description: toText(row.description),
        altText: toText(row.alt_text),
        category: toText(row.category),
        location: locationName ? { name: locationName, slug: toText(location?.slug) } : null,
        camera: joinText(metadata?.camera_brand_text, metadata?.camera_model_text),
        lens: joinText(metadata?.lens_brand_text, metadata?.lens_model_text),
        focalLengthMm: toNumber(metadata?.focal_length_mm),
        aperture: toNumber(metadata?.aperture),
        shutterSpeed: toText(metadata?.shutter_speed),
        iso: toNumber(metadata?.iso),
        capturedAt: toText(row.public_captured_at),
        editingSoftware: toText(metadata?.editing_software),
        editingNotes: toText(metadata?.editing_notes),
        film: joinText(metadata?.film_stock, metadata?.film_camera, metadata?.film_scanner),
        width,
        height,
      },
    });
  }

  return uploads;
}

interface ModerationActionJoined {
  id: string | null;
  decision: string | null;
  subject_type: string | null;
  subject_id: string | null;
  reason: string | null;
  created_at: string | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
}

async function recentModerationActions(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ModerationAction[]> {
  const rows = unwrapList<ModerationActionJoined>(
    'reading recent moderation actions',
    await supabase
      .from('moderation_actions')
      .select(
        `id, decision, subject_type, subject_id, reason, created_at,
         profiles(${PROFILE_SUMMARY_FIELDS})`,
      )
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE.moderation),
  );

  const actions: ModerationAction[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const subjectId = toText(row.subject_id);
    const moderator = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
    if (!id || !subjectId || !moderator) continue;

    const subjectType: ReportSubjectType | 'location_submission' =
      row.subject_type === 'location_submission'
        ? 'location_submission'
        : oneOf(REPORT_SUBJECT_TYPES, row.subject_type, 'photograph');

    actions.push({
      id,
      decision: oneOf(MODERATION_DECISIONS, row.decision, 'dismiss'),
      subjectType,
      subjectId,
      reason: toText(row.reason),
      moderator,
      createdAt: toText(row.created_at) ?? '',
    });
  }
  return actions;
}

/**
 * Approved locations close enough together to be worth a second look.
 *
 * Without a PostGIS function to call this is computed here, over a latitude-
 * sorted sweep so that only genuinely close rows are compared rather than every
 * pair. The raw stored coordinates are used on purpose: a moderator deciding
 * whether two entries are the same place needs the true distance, and only the
 * rounded distance ever leaves this function.
 */
async function possibleDuplicateLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Array<{ a: LocationSummary; b: LocationSummary; distanceMetres: number }>> {
  const rows = unwrapList<LocationSummaryColumns & Nullable<Pick<Tables<'locations'>, 'latitude' | 'longitude'>>>(
    'scanning for duplicate locations',
    await supabase
      .from('locations')
      .select(`${LOCATION_SUMMARY_FIELDS}, latitude, longitude`)
      .eq('status', 'approved')
      .order('latitude', { ascending: true })
      .limit(DUPLICATE_SCAN_LIMIT),
  );

  interface Candidate {
    summary: LocationSummary;
    latitude: number;
    longitude: number;
  }

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const summary = mapLocationSummary(row);
    const latitude = toNumber(row.latitude);
    const longitude = toNumber(row.longitude);
    if (!summary || latitude === null || longitude === null) continue;
    candidates.push({ summary, latitude, longitude });
  }
  candidates.sort((a, b) => a.latitude - b.latitude);

  const radius = LOCATION_POLICY.duplicateRadiusMetres;
  const pairs: Array<{ a: LocationSummary; b: LocationSummary; distanceMetres: number }> = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const first = candidates[i];
    if (!first) continue;
    const latitudeCeiling = boundingBoxAround(first.latitude, first.longitude, radius).north;

    for (let j = i + 1; j < candidates.length; j += 1) {
      const second = candidates[j];
      if (!second) break;
      if (second.latitude > latitudeCeiling) break;

      const metres = Math.round(distanceMetres(first, second));
      if (metres <= radius) {
        pairs.push({ a: first.summary, b: second.summary, distanceMetres: metres });
      }
    }
  }

  return pairs.sort((x, y) => x.distanceMetres - y.distanceMetres).slice(0, DUPLICATE_PAIR_LIMIT);
}

/**
 * The moderation dashboard's four queues plus the duplicate scan.
 *
 * Every query runs as the signed-in moderator through the cookie-bound client,
 * so row-level security is what actually protects this data. `requireModerator`
 * on the route decides what the page renders; the database decides what can be
 * read at all.
 */
/**
 * Moderators and administrators, administrators first. Read with the
 * caller's own session: role is a public column on profiles, and the team
 * panel that shows this list is only rendered for administrators.
 */
export async function staffMembers(): Promise<StaffMember[]> {
  const supabase = await createClient();
  const rows = unwrapList<ProfileColumns & { role: string | null }>(
    'reading the staff list',
    await supabase
      .from('profiles')
      .select(`${PROFILE_SUMMARY_FIELDS}, role`)
      .in('role', ['moderator', 'admin'])
      .order('role', { ascending: true })
      .order('username', { ascending: true }),
  );

  const staff: StaffMember[] = [];
  for (const row of rows) {
    const member = mapPhotographerSummary(row);
    if (!member) continue;
    staff.push({ member, role: row.role === 'admin' ? 'admin' : 'moderator' });
  }
  return staff;
}

export async function moderationQueues(): Promise<ModerationQueues> {
  const supabase = await createClient();

  const [submissions, reports, uploads, actions, duplicates] = await Promise.all([
    pendingSubmissions(supabase),
    openReports(supabase),
    suspiciousUploads(supabase),
    recentModerationActions(supabase),
    possibleDuplicateLocations(supabase),
  ]);

  return {
    submissions,
    reports,
    suspiciousUploads: uploads,
    recentActions: actions,
    possibleDuplicates: duplicates,
  };
}

/* ------------------------------------------------------------------------ */
/* Photo series                                                              */
/* ------------------------------------------------------------------------ */

type SeriesColumns = Nullable<
  Pick<
    Tables<'photo_series'>,
    | 'id' | 'owner_id' | 'slug' | 'title' | 'standfirst' | 'body' | 'cover_photograph_id'
    | 'visibility' | 'opens' | 'updated_at'
  >
>;

interface SeriesJoined extends SeriesColumns {
  profiles: ProfileColumns | ProfileColumns[] | null;
}

/**
 * The owner is named by column. `photo_series` joins `profiles` one way only,
 * but `photographs` two ways (the cover, and through the items), and the rule
 * in this file is that every embed says which — see the 0017 post-mortem.
 */
const SERIES_SELECT = `
  id, owner_id, slug, title, standfirst, body, cover_photograph_id, visibility, opens,
  updated_at, profiles!owner_id(${PROFILE_SUMMARY_FIELDS})
`;

/**
 * Many series in three queries: the series, every item of those series, then
 * every photograph the items name — the same shape as the photobook shelf. An
 * item whose photograph is no longer published is left out, never shown as a
 * hole; a cover that has gone falls back to the first item.
 */
async function assembleSeries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: readonly SeriesJoined[],
  what: string,
): Promise<PhotoSeries[]> {
  if (rows.length === 0) return [];

  const seriesIds = rows
    .map((row) => toText(row.id))
    .filter((value): value is string => value !== null);
  if (seriesIds.length === 0) return [];

  const itemRows = unwrapList<{
    series_id: string | null;
    photograph_id: string | null;
    position: number | null;
    caption: string | null;
  }>(
    `reading the items of ${what}`,
    await supabase
      .from('photo_series_items')
      .select('series_id, photograph_id, position, caption')
      .in('series_id', seriesIds)
      .order('position', { ascending: true })
      .limit(seriesIds.length * SERIES_MAX_ITEMS),
  );

  const photographIds = [
    ...new Set(
      itemRows
        .map((item) => toText(item.photograph_id))
        .filter((value): value is string => value !== null),
    ),
  ];

  const photographs =
    photographIds.length > 0
      ? await mapPhotographRows(
          supabase,
          unwrapList<PhotographJoined>(
            `reading the photographs of ${what}`,
            await supabase
              .from('photographs')
              .select(photographSelect())
              .in('id', photographIds)
              .eq('status', 'published'),
          ),
        )
      : [];
  const byId = new Map(photographs.map((photo) => [photo.id, photo]));

  const itemsBySeries = new Map<string, PhotoSeriesItem[]>();
  for (const item of itemRows) {
    const seriesId = toText(item.series_id);
    const position = toNumber(item.position);
    const photograph = byId.get(toText(item.photograph_id) ?? '');
    if (!seriesId || position === null || !photograph) continue;
    const entry = { position, photograph, caption: toText(item.caption) };
    const list = itemsBySeries.get(seriesId);
    if (list) list.push(entry);
    else itemsBySeries.set(seriesId, [entry]);
  }

  const result: PhotoSeries[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const slug = toText(row.slug);
    const title = toText(row.title);
    const owner = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
    if (!id || !slug || !title || !owner) continue;
    const items = itemsBySeries.get(id) ?? [];
    const coverId = toText(row.cover_photograph_id);
    const cover = (coverId && byId.get(coverId)) || items[0]?.photograph || null;
    result.push({
      id,
      slug,
      title,
      standfirst: toText(row.standfirst),
      body: toText(row.body) ?? '',
      cover,
      visibility: row.visibility === 'public' ? 'public' : 'unlisted',
      opens: toNumber(row.opens) ?? 0,
      owner,
      items,
      updatedAt: toText(row.updated_at) ?? '',
    });
  }
  return result;
}

/** Public or unlisted both answer by address; the policy already says so. */
export async function seriesBySlug(slug: string): Promise<PhotoSeries | null> {
  const supabase = await createClient();
  const row = unwrap<SeriesJoined>(
    `reading series "${slug}"`,
    await supabase.from('photo_series').select(SERIES_SELECT).eq('slug', slug).maybeSingle(),
  );
  if (!row) return null;
  const [series] = await assembleSeries(supabase, [row], `series "${slug}"`);
  return series ?? null;
}

/** A member's series, newest first, public and unlisted alike. */
export async function seriesByOwner(ownerId: string): Promise<PhotoSeries[]> {
  const supabase = await createClient();
  const rows = unwrapList<SeriesJoined>(
    "reading a member's series",
    await supabase
      .from('photo_series')
      .select(SERIES_SELECT)
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }),
  );
  return assembleSeries(supabase, rows, "a member's series");
}

/** Counts an open. Fire-and-forget from the page; a failure is logged, never shown. */
export async function countSeriesOpen(slug: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('bump_series_opens', { p_slug: slug });
  if (error) console.error(`FRAME series: counting an open of "${slug}" failed — ${error.message}`);
}

/* ------------------------------------------------------------------------ */
/* Comments                                                                 */
/* ------------------------------------------------------------------------ */

const COMMENT_FIELDS =
  'id, parent_id, author_id, body, created_at, edited_at, deleted_at, hidden_at, hidden_by, hidden_reason';

interface CommentJoined
  extends Pick<
    Tables<'photograph_comments'>,
    | 'id'
    | 'parent_id'
    | 'author_id'
    | 'body'
    | 'created_at'
    | 'edited_at'
    | 'deleted_at'
    | 'hidden_at'
    | 'hidden_by'
    | 'hidden_reason'
  > {
  profiles: ProfileColumns | ProfileColumns[] | null;
}

/**
 * A comment row becomes a node with no replies yet; the thread is assembled
 * from the nodes afterwards. A comment whose author row is missing is dropped,
 * for the same reason an uncredited photograph is: there is nobody to attribute
 * it to.
 */
function mapComment(row: CommentJoined): PhotographComment | null {
  const id = toText(row.id);
  if (!id) return null;
  const author = mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles));
  if (!author) return null;

  const isDeleted = toText(row.deleted_at) !== null;
  const isHidden = toText(row.hidden_at) !== null;

  return {
    id,
    parentId: toText(row.parent_id),
    author,
    // A deleted comment carries an empty body from the database already; this
    // keeps the shape honest even if a row is read mid-delete.
    body: isDeleted ? '' : (toText(row.body) ?? ''),
    translations: NO_TRANSLATIONS,
    createdAt: toText(row.created_at) ?? '',
    editedAt: toText(row.edited_at),
    isDeleted,
    isHidden,
    hiddenReason: isHidden ? toText(row.hidden_reason) : null,
    hiddenById: isHidden ? toText(row.hidden_by) : null,
    replies: [],
  };
}

/**
 * The whole conversation under a photograph, as the viewer is allowed to see
 * it.
 *
 * Row-level security does the hiding: a comment hidden by the owner or a
 * moderator simply is not in the rows unless the reader is its author, the
 * photograph's owner or a moderator, so this function never has to decide who
 * sees what. Ordered oldest-first, which is also parent-before-reply, so one
 * pass can attach every reply to a parent that is already in the map.
 *
 * A deleted comment is kept when it has at least one reply that is still
 * standing — the thread needs the remark those replies were answering, even as
 * "this comment was deleted" — and dropped when it is a dead leaf, so a thread
 * does not fill up with tombstones.
 */
export async function photographThread(photographId: string): Promise<PhotographThread> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('photograph_comments')
    .select(`${COMMENT_FIELDS}, profiles!author_id(${PROFILE_SUMMARY_FIELDS})`)
    .eq('photograph_id', photographId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`FRAME comments: reading the thread failed — ${error.message}`);
  }

  const rows = asArray<CommentJoined>(data as CommentJoined[] | null);
  const byId = new Map<string, PhotographComment>();
  const topLevel: PhotographComment[] = [];

  for (const row of rows) {
    const node = mapComment(row);
    if (!node) continue;
    byId.set(node.id, node);
    if (node.parentId === null) {
      topLevel.push(node);
    } else {
      const parent = byId.get(node.parentId);
      // A reply whose parent the reader cannot see (hidden, and not theirs) has
      // no home in the tree; it is left out rather than promoted to the top.
      if (parent) parent.replies.push(node);
    }
  }

  // One query for the whole conversation (0035). A deleted comment has no body
  // left to translate, so it is not asked about.
  const translatable = [...byId.values()].filter((node) => !node.isDeleted).map((node) => node.id);
  const translations = await translationsFor(supabase, 'comment', translatable);
  for (const node of byId.values()) {
    node.translations = translations.get(node.id) ?? NO_TRANSLATIONS;
  }

  // The number a card shows: live comments the reader can see, counting a
  // deleted comment's surviving replies but not the tombstone itself.
  let count = 0;
  const prune = (node: PhotographComment): boolean => {
    node.replies = node.replies.filter(prune);
    const alive = !node.isDeleted && !node.isHidden;
    if (alive) count += 1;
    return alive || node.replies.length > 0;
  };
  const comments = topLevel.filter(prune);

  return { comments, count };
}

/* ------------------------------------------------------------------------ */
/* Following, and the feed it feeds                                         */
/* ------------------------------------------------------------------------ */

/**
 * Whether the viewer follows this member.
 *
 * `null` — not `false` — when nobody is signed in, so the control can send a
 * visitor to sign in rather than showing an un-followed state it cannot know.
 * The same distinction appreciation makes, for the same reason.
 */
export async function viewerFollows(profileId: string): Promise<boolean | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profile_follows')
    .select('followee_id')
    .eq('follower_id', viewer.id)
    .eq('followee_id', profileId)
    .maybeSingle();

  if (error) {
    console.error(`FRAME follows: reading the viewer's follow failed — ${error.message}`);
    return null;
  }
  return data !== null;
}

/** The ids this member follows. The feed's first query, and nothing else's. */
async function followeeIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  followerId: string,
): Promise<string[]> {
  const rows = unwrapList<{ followee_id: string | null }>(
    "the people a member follows",
    await supabase.from('profile_follows').select('followee_id').eq('follower_id', followerId),
  );
  return rows.map((row) => toText(row.followee_id)).filter((id): id is string => id !== null);
}

/**
 * Published photographs by the people this member follows, newest first.
 *
 * Two queries rather than an embedded filter: PostgREST can express "owner is
 * one of these" far more plainly than a join through the follow table, and the
 * first query is a handful of uuids. Following nobody short-circuits to an
 * empty page without touching the photographs table at all — the page has a
 * different thing to say in that case, and it needs to know which it is.
 */
export async function followingFeed(options: {
  followerId: string;
  page: number;
  pageSize: number;
}): Promise<Paginated<PhotographDetail> & { followsAnybody: boolean }> {
  const supabase = await createClient();
  const page = clampPage(options.page);
  const pageSize = clampPageSize(options.pageSize);

  const ids = await followeeIds(supabase, options.followerId);
  if (ids.length === 0) {
    return { items: [], page, pageSize, totalCount: null, hasMore: false, followsAnybody: false };
  }

  // One row beyond the page answers "is there a next page" without an exact
  // count, the same way the discover feed does.
  const rows = await fetchPhotographRows(supabase, {
    operation: 'the following feed',
    ownerIds: ids,
    order: 'recent',
    offset: (page - 1) * pageSize,
    limit: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = await mapPhotographRows(supabase, rows.slice(0, pageSize));

  return { items, page, pageSize, totalCount: null, hasMore, followsAnybody: true };
}

/**
 * The members following this one, newest first, for the profile's follower
 * list. Bounded: a follower list is a glance, not an archive.
 */
export async function followersOf(profileId: string, limit = 24): Promise<PhotographerSummary[]> {
  const supabase = await createClient();
  const rows = unwrapList<{ profiles: ProfileColumns | ProfileColumns[] | null }>(
    'a profile\'s followers',
    await supabase
      .from('profile_follows')
      .select(`profiles!follower_id(${PROFILE_SUMMARY_FIELDS})`)
      .eq('followee_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );

  return rows
    .map((row) => mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles)))
    .filter((summary): summary is PhotographerSummary => summary !== null);
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                            */
/* ------------------------------------------------------------------------ */

const NOTIFICATION_FIELDS =
  'id, kind, actor_id, subject_type, subject_id, subject_label, subject_slug, message, read_at, created_at';

interface NotificationJoined
  extends Pick<
    Tables<'notifications'>,
    | 'id'
    | 'kind'
    | 'actor_id'
    | 'subject_type'
    | 'subject_id'
    | 'subject_label'
    | 'subject_slug'
    | 'message'
    | 'read_at'
    | 'created_at'
  > {
  profiles: ProfileColumns | ProfileColumns[] | null;
}

/**
 * This member's notifications, newest first.
 *
 * Row-level security scopes them to the caller, so there is no recipient
 * filter here to forget. A row whose kind the application does not recognise
 * is dropped rather than rendered as an empty sentence — the check constraint
 * makes that unreachable today, and it stays correct if a later migration adds
 * a kind this build has never heard of.
 */
export async function notificationsFor(limit = 40): Promise<AppNotification[]> {
  const supabase = await createClient();
  const rows = unwrapList<NotificationJoined>(
    'the notification list',
    await supabase
      .from('notifications')
      .select(`${NOTIFICATION_FIELDS}, profiles!actor_id(${PROFILE_SUMMARY_FIELDS})`)
      .order('created_at', { ascending: false })
      .limit(limit),
  );

  const notifications: AppNotification[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const kind = NOTIFICATION_KINDS.find((candidate) => candidate === row.kind);
    const subjectId = toText(row.subject_id);
    const subjectType = (['photograph', 'profile', 'comment', 'challenge', 'feature'] as const).find(
      (candidate) => candidate === row.subject_type,
    );
    if (!id || !kind || !subjectId || !subjectType) continue;

    notifications.push({
      id,
      kind,
      actor: mapPhotographerSummary(firstOf<ProfileColumns>(row.profiles)),
      subjectType,
      subjectId,
      subjectLabel: toText(row.subject_label) ?? '',
      subjectSlug: toText(row.subject_slug),
      message: toText(row.message),
      readAt: toText(row.read_at),
      createdAt: toText(row.created_at) ?? '',
    });
  }
  return notifications;
}

/**
 * How many are unread.
 *
 * A head count against the partial index, not a stored column: this number
 * changes every time the member reads one, and a badge that has drifted is
 * worse than a cheap query. Returns 0 rather than throwing — a header that
 * cannot render is a worse failure than a missing badge.
 */
export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) {
    console.error(`FRAME notifications: counting the unread failed — ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/* ------------------------------------------------------------------------ */
/* Challenges                                                               */
/* ------------------------------------------------------------------------ */

const CHALLENGE_FIELDS =
  'id, slug, title_en, title_th, brief_en, brief_th, opens_at, closes_at, max_entries, requires_new_work, results_published_at';

type ChallengeColumns = Nullable<
  Pick<
    Tables<'challenges'>,
    | 'id'
    | 'slug'
    | 'title_en'
    | 'title_th'
    | 'brief_en'
    | 'brief_th'
    | 'opens_at'
    | 'closes_at'
    | 'max_entries'
    | 'requires_new_work'
    | 'results_published_at'
  >
>;

/** Where a challenge is, from its dates and its results — never from a stored flag. */
function challengePhase(
  opensAt: string,
  closesAt: string,
  resultsPublishedAt: string | null,
  now: number = Date.now(),
): ChallengePhase {
  if (resultsPublishedAt) return 'closed';
  if (now < Date.parse(opensAt)) return 'upcoming';
  if (now < Date.parse(closesAt)) return 'open';
  return 'judging';
}

function mapChallenge(row: ChallengeColumns): Omit<ChallengeSummary, 'entryCount' | 'winner'> | null {
  const id = toText(row.id);
  const slug = toText(row.slug);
  const opensAt = toText(row.opens_at);
  const closesAt = toText(row.closes_at);
  if (!id || !slug || !opensAt || !closesAt) return null;

  const resultsPublishedAt = toText(row.results_published_at);
  return {
    id,
    slug,
    title: { en: toText(row.title_en) ?? '', th: toText(row.title_th) ?? '' },
    brief: { en: toText(row.brief_en) ?? '', th: toText(row.brief_th) ?? '' },
    opensAt,
    closesAt,
    maxEntries: toNumber(row.max_entries) ?? 3,
    requiresNewWork: row.requires_new_work === true,
    resultsPublishedAt,
    phase: challengePhase(opensAt, closesAt, resultsPublishedAt),
  };
}

/**
 * Published photographs by id, keyed for lookup. A challenge never shows an
 * entry whose photograph has since been taken down, so the status filter is
 * here rather than trusted to the caller.
 */
async function publishedPhotographsById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: readonly string[],
): Promise<Map<string, PhotographDetail>> {
  if (ids.length === 0) return new Map();
  const rows = unwrapList<PhotographJoined>(
    'challenge photographs',
    await supabase
      .from('photographs')
      .select(photographSelect())
      .in('id', [...ids])
      .eq('status', 'published'),
  );
  const photos = await mapPhotographRows(supabase, rows);
  return new Map(photos.map((photo) => [photo.id, photo]));
}

const AWARD_ORDER: Record<ChallengeAward, number> = {
  winner: 0,
  runner_up: 1,
  honourable_mention: 2,
};

/**
 * Every challenge, newest window first, with its entry count and — once the
 * results are out — its winner. Bounded: a list of themes, not an archive.
 */
export async function challengeList(limit = 24): Promise<ChallengeSummary[]> {
  const supabase = await createClient();
  const rows = unwrapList<ChallengeColumns>(
    'the challenge list',
    await supabase
      .from('challenges')
      .select(CHALLENGE_FIELDS)
      .order('opens_at', { ascending: false })
      .limit(limit),
  );

  const challenges = rows
    .map(mapChallenge)
    .filter((challenge): challenge is NonNullable<typeof challenge> => challenge !== null);
  if (challenges.length === 0) return [];

  const ids = challenges.map((challenge) => challenge.id);
  const entries = unwrapList<{ challenge_id: string | null; photograph_id: string | null }>(
    'challenge entry counts',
    await supabase.from('challenge_entries').select('challenge_id, photograph_id').in('challenge_id', ids),
  );
  // Row-level security already limits these to entries whose photograph is
  // still published (or the viewer's own), which is what the count should be.
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const challengeId = toText(entry.challenge_id);
    if (challengeId) counts.set(challengeId, (counts.get(challengeId) ?? 0) + 1);
  }

  // Awards are only readable once published, so this is the winners of the
  // closed challenges and nothing else.
  const winners = unwrapList<{ challenge_id: string | null; photograph_id: string | null }>(
    'challenge winners',
    await supabase
      .from('challenge_awards')
      .select('challenge_id, photograph_id')
      .in('challenge_id', ids)
      .eq('award', 'winner'),
  );
  const winnerIdByChallenge = new Map<string, string>();
  for (const row of winners) {
    const challengeId = toText(row.challenge_id);
    const photographId = toText(row.photograph_id);
    if (challengeId && photographId) winnerIdByChallenge.set(challengeId, photographId);
  }
  const winnerPhotos = await publishedPhotographsById(supabase, [...winnerIdByChallenge.values()]);

  return challenges.map((challenge) => {
    const winnerId = winnerIdByChallenge.get(challenge.id);
    return {
      ...challenge,
      entryCount: counts.get(challenge.id) ?? 0,
      winner: challenge.phase === 'closed' && winnerId ? (winnerPhotos.get(winnerId) ?? null) : null,
    };
  });
}

/**
 * One challenge with everything entered into it. Awards come through only
 * where row-level security lets them — the public sees them once published,
 * staff see them while judging — so the same read serves both.
 */
export async function challengeBySlug(slug: string): Promise<ChallengeDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('challenges')
    .select(CHALLENGE_FIELDS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`FRAME challenges: reading "${slug}" failed — ${error.message}`);
  if (!data) return null;

  const challenge = mapChallenge(data as ChallengeColumns);
  if (!challenge) return null;

  const [entryRows, awardRows] = await Promise.all([
    supabase
      .from('challenge_entries')
      .select('photograph_id, created_at')
      .eq('challenge_id', challenge.id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('challenge_awards').select('photograph_id, award, note').eq('challenge_id', challenge.id),
  ]);

  const entries = unwrapList<{ photograph_id: string | null; created_at: string | null }>(
    'challenge entries',
    entryRows,
  );
  const awards = unwrapList<{ photograph_id: string | null; award: string | null; note: string | null }>(
    'challenge awards',
    awardRows,
  );

  const awardByPhotograph = new Map<string, { award: ChallengeAward; note: string | null }>();
  for (const row of awards) {
    const photographId = toText(row.photograph_id);
    const award = CHALLENGE_AWARDS.find((candidate) => candidate === row.award);
    if (photographId && award) awardByPhotograph.set(photographId, { award, note: toText(row.note) });
  }

  const photos = await publishedPhotographsById(
    supabase,
    entries.map((entry) => toText(entry.photograph_id)).filter((id): id is string => id !== null),
  );

  const mapped: ChallengeEntry[] = [];
  for (const entry of entries) {
    const photographId = toText(entry.photograph_id);
    const photograph = photographId ? photos.get(photographId) : undefined;
    if (!photograph) continue;
    const award = awardByPhotograph.get(photograph.id);
    mapped.push({
      photograph,
      enteredAt: toText(entry.created_at) ?? '',
      award: award?.award ?? null,
      note: award?.note ?? null,
    });
  }

  // Awarded first, in award order, then everything else newest first — the
  // order the entries already arrived in.
  mapped.sort((a, b) => {
    if (a.award && b.award) return AWARD_ORDER[a.award] - AWARD_ORDER[b.award];
    if (a.award) return -1;
    if (b.award) return 1;
    return 0;
  });

  const winner = mapped.find((entry) => entry.award === 'winner')?.photograph ?? null;
  return {
    ...challenge,
    entryCount: mapped.length,
    winner: challenge.phase === 'closed' ? winner : null,
    entries: mapped,
  };
}

/**
 * The viewer's own published photographs, as the entry panel offers them:
 * which are already entered, and which a new-work challenge would refuse.
 * Capture times come through own_photograph_capture_times(), which answers
 * only for the caller's own photographs. The database makes the same check on
 * entry; this is so the panel can say so before the member tries.
 */
export async function challengeCandidates(
  challenge: Pick<ChallengeSummary, 'id' | 'opensAt' | 'requiresNewWork'>,
  viewerId: string,
): Promise<ChallengeCandidate[]> {
  const supabase = await createClient();
  const rows = await fetchPhotographRows(supabase, {
    operation: "a member's photographs for a challenge",
    ownerId: viewerId,
    order: 'recent',
    limit: 60,
  });
  const photos = await mapPhotographRows(supabase, rows);
  if (photos.length === 0) return [];

  const ids = photos.map((photo) => photo.id);
  const [entered, captures] = await Promise.all([
    supabase
      .from('challenge_entries')
      .select('photograph_id')
      .eq('challenge_id', challenge.id)
      .eq('entrant_id', viewerId),
    challenge.requiresNewWork
      ? supabase.rpc('own_photograph_capture_times', { p_ids: ids })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const enteredIds = new Set(
    unwrapList<{ photograph_id: string | null }>('the viewer\'s entries', entered)
      .map((row) => toText(row.photograph_id))
      .filter((id): id is string => id !== null),
  );

  if (captures.error) {
    throw new Error(`FRAME challenges: reading capture times failed — ${captures.error.message}`);
  }
  const capturedById = new Map<string, string | null>();
  for (const row of (captures.data ?? []) as Array<{ photograph_id: string; captured_at: string | null }>) {
    capturedById.set(row.photograph_id, row.captured_at);
  }
  const opensAt = Date.parse(challenge.opensAt);

  return photos.map((photograph) => {
    const captured = capturedById.get(photograph.id) ?? null;
    return {
      photograph,
      entered: enteredIds.has(photograph.id),
      eligible:
        !challenge.requiresNewWork || (captured !== null && Date.parse(captured) >= opensAt),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Features                                                                 */
/* ------------------------------------------------------------------------ */

const FEATURE_FIELDS = 'id, slug, title_en, title_th, intro_en, intro_th, status, published_at';

type FeatureColumns = Nullable<
  Pick<
    Tables<'features'>,
    'id' | 'slug' | 'title_en' | 'title_th' | 'intro_en' | 'intro_th' | 'status' | 'published_at'
  >
>;

type FeatureItemColumns = Nullable<
  Pick<Tables<'feature_items'>, 'feature_id' | 'photograph_id' | 'position' | 'caption_en' | 'caption_th'>
>;

function mapFeature(row: FeatureColumns): Omit<FeatureSummary, 'cover' | 'itemCount'> | null {
  const id = toText(row.id);
  const slug = toText(row.slug);
  if (!id || !slug) return null;
  return {
    id,
    slug,
    title: { en: toText(row.title_en) ?? '', th: toText(row.title_th) ?? '' },
    intro: { en: toText(row.intro_en) ?? '', th: toText(row.intro_th) ?? '' },
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: toText(row.published_at),
  };
}

/**
 * The items of these features, in position order, with their photographs.
 * Row-level security already leaves out a photograph that has been taken
 * down (and, for the public, every item of a draft); the published-photograph
 * read drops anything that slipped through between the two reads.
 */
async function featureItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  featureIds: readonly string[],
): Promise<Map<string, FeatureItem[]>> {
  const byFeature = new Map<string, FeatureItem[]>();
  if (featureIds.length === 0) return byFeature;

  const rows = unwrapList<FeatureItemColumns>(
    'feature items',
    await supabase
      .from('feature_items')
      .select('feature_id, photograph_id, position, caption_en, caption_th')
      .in('feature_id', [...featureIds])
      .order('position', { ascending: true }),
  );
  const photos = await publishedPhotographsById(
    supabase,
    rows.map((row) => toText(row.photograph_id)).filter((id): id is string => id !== null),
  );

  for (const row of rows) {
    const featureId = toText(row.feature_id);
    const photographId = toText(row.photograph_id);
    const photograph = photographId ? photos.get(photographId) : undefined;
    if (!featureId || !photograph) continue;
    const list = byFeature.get(featureId) ?? [];
    list.push({
      photograph,
      position: toNumber(row.position) ?? list.length + 1,
      caption: { en: toText(row.caption_en), th: toText(row.caption_th) },
    });
    byFeature.set(featureId, list);
  }
  return byFeature;
}

/**
 * Features, newest published first; staff also get their drafts, which
 * row-level security hands them and nobody else.
 */
export async function featureList(limit = 24): Promise<FeatureSummary[]> {
  const supabase = await createClient();
  const rows = unwrapList<FeatureColumns>(
    'the feature list',
    await supabase
      .from('features')
      .select(FEATURE_FIELDS)
      .order('published_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  const features = rows
    .map(mapFeature)
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
  const items = await featureItems(
    supabase,
    features.map((feature) => feature.id),
  );
  return features.map((feature) => {
    const list = items.get(feature.id) ?? [];
    return { ...feature, cover: list[0]?.photograph ?? null, itemCount: list.length };
  });
}

export async function featureBySlug(slug: string): Promise<FeatureDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('features')
    .select(FEATURE_FIELDS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`FRAME features: reading "${slug}" failed — ${error.message}`);
  if (!data) return null;

  const feature = mapFeature(data as FeatureColumns);
  if (!feature) return null;
  const list = (await featureItems(supabase, [feature.id])).get(feature.id) ?? [];
  return { ...feature, cover: list[0]?.photograph ?? null, itemCount: list.length, items: list };
}
