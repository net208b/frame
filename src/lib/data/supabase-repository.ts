import { createClient as createSessionlessClient } from '@supabase/supabase-js';

import { getViewer } from '@/lib/auth';
import { LOCATION_POLICY, PAGE_SIZE, publicEnv, serverEnv, UPLOAD_POLICY } from '@/lib/config';
import type { MapPin, ModerationQueues } from '@/lib/data/repository';
import { boundingBoxAround, distanceMetres, publishableCoordinates } from '@/lib/geo';
import { IMAGE_VARIANTS } from '@/lib/images/variants';
import { trendingScore } from '@/lib/ranking';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';
import {
  PHOTO_CATEGORIES,
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
  type ModerationAction,
  type ModerationDecision,
  type Paginated,
  type PhotoCategory,
  type PhotoImage,
  type PhotographDetail,
  type PhotographerProfile,
  type PhotographerSummary,
  type PlatformStats,
  type PublicationStatus,
  type Report,
  type ReportReason,
  type ReportStatus,
  type ReportSubjectType,
  type SubmissionSignal,
  type SubmissionStatus,
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
  | 'captured_at'
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
    | 'usual_gear'
    | 'role'
    | 'member_since'
    | 'created_at'
  >
>;

type LocationSummaryColumns = Nullable<
  Pick<
    Tables<'locations'>,
    'id' | 'slug' | 'name' | 'city' | 'country' | 'country_code' | 'photograph_count'
  >
>;

type LocationPointColumns = Nullable<
  Pick<Tables<'locations'>, 'latitude' | 'longitude' | 'is_sensitive' | 'withhold_coordinates'>
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
  >
>;

type RestrictionColumns = Nullable<
  Pick<Tables<'location_restrictions'>, 'kind' | 'note' | 'source' | 'recorded_at'>
>;

const PROFILE_SUMMARY_FIELDS = 'id, username, display_name, avatar_url, based_in';
const PROFILE_DETAIL_FIELDS = `${PROFILE_SUMMARY_FIELDS}, biography, website, usual_gear, role, member_since, created_at`;
const LOCATION_SUMMARY_FIELDS = 'id, slug, name, city, country, country_code, photograph_count';
const IMAGE_FIELDS = 'variant, storage_key, width, height';
const METADATA_FIELDS =
  'camera_brand_text, camera_model_text, lens_brand_text, lens_model_text, focal_length_mm, aperture, shutter_speed, iso, editing_software, editing_notes';

const PHOTOGRAPH_OWN_FIELDS = `
  id, slug, title, alt_text, category, description, status, appreciation_count,
  published_at, created_at, captured_at, publish_captured_at, editors_pick,
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
    profiles(${PROFILE_SUMMARY_FIELDS}),
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
  };
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

  const display =
    byVariant.get('display') ?? byVariant.get('full') ?? byVariant.get('grid') ?? byVariant.get('thumb');
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
    capture: {
      cameraBrand: toText(metadata?.camera_brand_text),
      cameraModel: toText(metadata?.camera_model_text),
      lensBrand: toText(metadata?.lens_brand_text),
      lensModel: toText(metadata?.lens_model_text),
      focalLengthMm: toNumber(metadata?.focal_length_mm),
      aperture: toNumber(metadata?.aperture),
      shutterSpeed: toText(metadata?.shutter_speed),
      iso: toNumber(metadata?.iso),
    },
    editing: {
      software: toText(metadata?.editing_software),
      notes: toText(metadata?.editing_notes),
    },
    // Capture dates are published only when the owner chose to publish them: a
    // timestamp is itself information about where somebody was and when.
    capturedAt: row.publish_captured_at === true ? toText(row.captured_at) : null,
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
  const lookup = await appreciationLookup(supabase, ids);

  const mapped: PhotographDetail[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const photo = mapPhotograph(row, id ? lookup.has(id) : null);
    if (photo) mapped.push(photo);
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
  withhold_coordinates, categories, shooting_notes, best_time_of_day, approved_at,
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
          isSensitive: row.is_sensitive === true,
          withhold: row.withhold_coordinates === true,
        });

  return {
    ...summary,
    description: toText(row.description),
    coordinates,
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

  return row ? mapLocationDetail(row) : null;
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

  const supabase = await createClient();
  const box = boundingBoxAround(origin.latitude, origin.longitude, NEARBY_RADIUS_METRES);

  let query = supabase
    .from('locations')
    .select(`${LOCATION_SUMMARY_FIELDS}, latitude, longitude, is_sensitive, withhold_coordinates`)
    .eq('status', 'approved')
    .eq('withhold_coordinates', false)
    .neq('id', location.id)
    .gte('latitude', box.south)
    .lte('latitude', box.north);

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
      isSensitive: row.is_sensitive === true,
      withhold: row.withhold_coordinates === true,
    });
    if (!point) continue;

    const metres = Math.round(distanceMetres(origin, point));
    if (metres > NEARBY_RADIUS_METRES) continue;
    nearby.push({ ...summary, distanceMetres: metres });
  }

  return nearby.sort((a, b) => a.distanceMetres - b.distanceMetres).slice(0, NEARBY_LIMIT);
}

interface MapPinPhotograph {
  id: string | null;
  photograph_images: ImageColumns[] | null;
}

interface MapPinJoined extends LocationSummaryColumns, LocationPointColumns {
  categories: unknown;
  photographs: MapPinPhotograph | MapPinPhotograph[] | null;
}

export async function mapPins(): Promise<MapPin[]> {
  const supabase = await createClient();

  const rows = unwrapList<MapPinJoined>(
    'reading map pins',
    await supabase
      .from('locations')
      .select(
        `${LOCATION_SUMMARY_FIELDS}, latitude, longitude, is_sensitive, withhold_coordinates,
         categories, photographs(id, published_at, photograph_images(${IMAGE_FIELDS}))`,
      )
      .eq('status', 'approved')
      .eq('withhold_coordinates', false)
      .eq('photographs.status', 'published')
      .order('published_at', { ascending: false, referencedTable: 'photographs' })
      .limit(1, { referencedTable: 'photographs' })
      .limit(MAP_PIN_LIMIT),
  );

  const pins: MapPin[] = [];
  for (const row of rows) {
    const summary = mapLocationSummary(row);
    const latitude = toNumber(row.latitude);
    const longitude = toNumber(row.longitude);
    if (!summary || latitude === null || longitude === null) continue;

    const point = publishableCoordinates(latitude, longitude, {
      isSensitive: row.is_sensitive === true,
      withhold: row.withhold_coordinates === true,
    });
    if (!point) continue;

    const preview = firstOf<MapPinPhotograph>(row.photographs);
    const previewImages = asArray<ImageColumns>(preview?.photograph_images);
    const previewKey =
      toText(previewImages.find((image) => image.variant === 'thumb')?.storage_key) ??
      toText(previewImages.find((image) => image.variant === 'grid')?.storage_key);

    pins.push({
      ...summary,
      categories: toStringList(row.categories).filter(isCategory),
      latitude: point.latitude,
      longitude: point.longitude,
      isApproximate: point.isApproximate,
      previewImageUrl: previewKey ? storagePublicUrl(previewKey) : null,
    });
  }

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
      website: toText(row.website),
      usualGear: toStringList(row.usual_gear),
      photographCount: photographCounts.get(summary.id) ?? 0,
      appreciationsReceived: appreciationTotals.get(summary.id) ?? 0,
      locationsContributed: locationCounts.get(summary.id) ?? 0,
      memberSince: toText(row.member_since) ?? toText(row.created_at) ?? '',
      role: oneOf(['member', 'moderator', 'admin'] as const, row.role, 'member'),
    });
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
    | 'exif_source'
    | 'exif_gps_latitude'
    | 'exif_gps_longitude'
  >
>;

type SuspiciousLocationColumns = Nullable<
  Pick<Tables<'locations'>, 'name' | 'latitude' | 'longitude'>
>;

interface SuspiciousJoined {
  id: string | null;
  title: string | null;
  created_at: string | null;
  image_width: number | null;
  image_height: number | null;
  profiles: ProfileColumns | ProfileColumns[] | null;
  photograph_images: ImageColumns[] | null;
  photograph_metadata: SuspiciousMetadataColumns | SuspiciousMetadataColumns[] | null;
  locations: SuspiciousLocationColumns | SuspiciousLocationColumns[] | null;
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
        `id, title, created_at, image_width, image_height,
         profiles(${PROFILE_SUMMARY_FIELDS}),
         photograph_images(${IMAGE_FIELDS}),
         photograph_metadata(camera_brand_text, camera_model_text, exif_source, exif_gps_latitude, exif_gps_longitude),
         locations(name, latitude, longitude)`,
      )
      .eq('status', 'under_review')
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE.moderation),
  );

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

    const exifLatitude = toNumber(metadata?.exif_gps_latitude);
    const exifLongitude = toNumber(metadata?.exif_gps_longitude);
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

    uploads.push({
      // There is no separate queue table, so the photograph identifies the entry.
      id,
      photographId: id,
      title: toText(row.title) ?? 'Untitled',
      thumbUrl: storagePublicUrl(thumbKey),
      uploader,
      createdAt: createdAt ?? '',
      signals,
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
