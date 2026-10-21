/**
 * Domain types shared by the demo dataset, the Supabase repository and the UI.
 *
 * The UI only ever depends on these shapes, which is what makes it possible to
 * swap the demo dataset for live queries, or Supabase Storage for R2, without
 * touching a component.
 */

/* ------------------------------------------------------------------------ */
/* Taxonomy                                                                  */
/* ------------------------------------------------------------------------ */

export const PHOTO_CATEGORIES = [
  'street',
  'architecture',
  'night',
  'urban-landscape',
  'documentary',
  'portrait',
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  street: 'Street',
  architecture: 'Architecture',
  night: 'Night',
  'urban-landscape': 'Urban landscape',
  documentary: 'Documentary',
  portrait: 'Street portrait',
};

export type PublicationStatus = 'draft' | 'processing' | 'published' | 'under_review' | 'removed';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

/* ------------------------------------------------------------------------ */
/* Images                                                                    */
/* ------------------------------------------------------------------------ */

/** The derivative sizes generated for every upload. See lib/images/variants.ts. */
export type ImageVariantName = 'thumb' | 'grid' | 'display' | 'full';

export interface PhotoImage {
  /** Small square-ish derivative for dense lists and avatars in cards. */
  thumbUrl: string;
  /** Gallery derivative. This is what a Discover page request downloads. */
  gridUrl: string;
  /** Largest derivative served to a viewer. Never the untouched original. */
  displayUrl: string;
  /** Intrinsic pixel size of the display derivative, for layout without jank. */
  width: number;
  height: number;
  /** Tiny inline placeholder, when one has been generated. */
  blurDataUrl?: string;
}

/* ------------------------------------------------------------------------ */
/* People                                                                    */
/* ------------------------------------------------------------------------ */

export type ProfileRole = 'member' | 'moderator' | 'admin';

/**
 * How a member shoots, as opposed to what they shoot.
 *
 * A closed vocabulary, and a different axis from {@link PHOTO_CATEGORIES}: a
 * category describes one photograph's subject, a style describes a
 * photographer's way of working, and the two are chosen in different places by
 * different people — the category on each upload, the style once in Settings.
 * The labels are translated, because unlike a biography these are FRAME's words
 * rather than the member's.
 *
 * Kept in step with profiles_style_tags_allowed (migration 0016).
 */
export const PHOTOGRAPHY_STYLES = [
  'black-and-white',
  'colour',
  'film',
  'candid',
  'flash',
  'minimal',
  'geometry',
  'layered',
] as const;

export type PhotographyStyle = (typeof PHOTOGRAPHY_STYLES)[number];

/** At most this many, so the row under a name stays readable. */
export const MAX_PHOTOGRAPHY_STYLES = 5;

/**
 * Whether the member is open to working with somebody — a shoot, a zine, a
 * walk. `null` on a profile means they have not said, which the page shows as
 * nothing at all rather than as "closed": silence is not a refusal.
 *
 * Kept in step with profiles_collaboration_status_allowed (migration 0016).
 */
export const COLLABORATION_STATUSES = ['open', 'selective', 'closed'] as const;

export type CollaborationStatus = (typeof COLLABORATION_STATUSES)[number];

/**
 * How a member wants their frames talked about.
 *
 * It is a sentence to other members, not a permission. FRAME has no comments,
 * so there is nothing here for the application to enforce, and the Settings
 * form says so where it is set. Presenting it as a control would be the kind of
 * promise this project does not make.
 *
 * Kept in step with profiles_critique_preference_allowed (migration 0016).
 */
export const CRITIQUE_PREFERENCES = ['any', 'technical', 'none'] as const;

export type CritiquePreference = (typeof CRITIQUE_PREFERENCES)[number];

/** Up to this many other places a member publishes. */
export const MAX_SOCIAL_LINKS = 4;

export interface PhotographerSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Free-text, member-supplied. Never derived from an IP address. */
  basedIn: string | null;
}

/**
 * The photograph a member chose to stand at the top of their profile.
 *
 * A reference to one of their own published frames, never an uploaded banner —
 * see migration 0017 for why. It carries the photograph's own alt text and slug
 * because it *is* a photograph: it is described in the member's words and it
 * links to itself.
 */
export interface ProfileCover {
  imageUrl: string;
  altText: string;
  slug: string;
}

export interface PhotographerProfile extends PhotographerSummary {
  biography: string | null;
  website: string | null;
  /**
   * The country the member chose, ISO 3166-1 alpha-2, beside the free-text
   * `basedIn` city. Chosen, never inferred: a country guessed from an address
   * and shown as a fact is the same privacy problem as a guessed city.
   */
  countryCode: string | null;
  /** How they shoot. Empty when they have not said. */
  styles: PhotographyStyle[];
  /** Open to working with somebody. Null means they have not said. */
  collaboration: CollaborationStatus | null;
  /** How they want their work discussed. A statement, not a permission. */
  critique: CritiquePreference | null;
  /** Other places they publish. Already filtered to http(s). */
  socialLinks: string[];
  /**
   * The cover, or null — which is also what a cover whose photograph is no
   * longer published resolves to, so the band simply does not appear.
   */
  cover: ProfileCover | null;
  /** Gear the member chose to show. Absent when they have not filled it in. */
  usualGear: string[];
  photographCount: number;
  appreciationsReceived: number;
  locationsContributed: number;
  /** Month precision only — the exact signup day is not public. */
  memberSince: string;
  role: ProfileRole;
}

/* ------------------------------------------------------------------------ */
/* Places                                                                    */
/* ------------------------------------------------------------------------ */

export interface LocationSummary {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  photographCount: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  /**
   * Decimal places actually published. Reduced for privacy-sensitive places,
   * so a consumer can never mistake a blurred point for a precise one.
   */
  precisionDecimals: number;
  /** True when the exact position is withheld on purpose. */
  isApproximate: boolean;
}

export interface LocationDetail extends LocationSummary {
  description: string | null;
  /** Null when the place is sensitive and no coordinate may be published. */
  coordinates: Coordinates | null;
  /** Categories this place is actually good for, from approved photographs. */
  categories: PhotoCategory[];
  /** Community-written, moderator-approved shooting advice. */
  shootingNotes: string[];
  /**
   * Access and photography restrictions. Only shown when a moderator has
   * recorded a source, because a wrong restriction note is worse than none.
   */
  restrictions: LocationRestriction[];
  bestTimeOfDay: string | null;
  submittedBy: PhotographerSummary | null;
  approvedAt: string | null;
}

export interface LocationRestriction {
  kind: 'permit' | 'private-property' | 'no-tripod' | 'hours' | 'fee' | 'other';
  note: string;
  /** Where the claim comes from. Required — see docs/LIMITATIONS.md. */
  source: string;
  recordedAt: string;
}

/* ------------------------------------------------------------------------ */
/* Photographs                                                               */
/* ------------------------------------------------------------------------ */

export interface PhotographCard {
  id: string;
  slug: string;
  title: string;
  /** Required for every image. Authored by the uploader, not generated. */
  altText: string;
  category: PhotoCategory;
  image: PhotoImage;
  appreciationCount: number;
  /** Whether the viewer has already appreciated it. Null when signed out. */
  viewerHasAppreciated: boolean | null;
  photographer: PhotographerSummary;
  location: LocationSummary | null;
  publishedAt: string;
  editorsPick: boolean;
}

export interface CaptureSettings {
  cameraBrand: string | null;
  cameraModel: string | null;
  lensBrand: string | null;
  lensModel: string | null;
  /** Millimetres, as written on the lens. */
  focalLengthMm: number | null;
  /** f-number, e.g. 1.8. */
  aperture: number | null;
  /** Human-readable, e.g. "1/250" or "4s". */
  shutterSpeed: string | null;
  iso: number | null;
}

export interface EditingDetails {
  software: string | null;
  notes: string | null;
}

export interface PhotographDetail extends PhotographCard {
  description: string | null;
  capture: CaptureSettings;
  editing: EditingDetails;
  /** Only present when EXIF held a date *and* the owner chose to publish it. */
  capturedAt: string | null;
  status: PublicationStatus;
  /** Set by the uploader at step 6 of the wizard. Required to publish. */
  rightsConfirmedAt: string | null;
}

/* ------------------------------------------------------------------------ */
/* Collections                                                               */
/* ------------------------------------------------------------------------ */

export type CollectionVisibility = 'public' | 'private';

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: CollectionVisibility;
  owner: PhotographerSummary;
  itemCount: number;
  coverImageUrl: string | null;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  note: string | null;
  addedAt: string;
  photograph: PhotographCard | null;
  location: LocationSummary | null;
}

/* ------------------------------------------------------------------------ */
/* Photobooks                                                                */
/* ------------------------------------------------------------------------ */

/**
 * A member's own published photographs bound as a book, under a cover they
 * chose, at an address meant to be pasted into a bio. One per member for now.
 *
 * Not a collection: a collection is a working list, a photobook is a finished
 * object. Every vocabulary here is also a CHECK constraint in migration 0018.
 */
export const PHOTOBOOK_COVERS = [
  'linen', 'darkroom', 'kraft', 'gallery', 'signal',
  'contact', 'zine', 'archive', 'monolith', 'mat',
  'ticket', 'film', 'newsprint', 'blueprint', 'label',
] as const;
export type PhotobookCover = (typeof PHOTOBOOK_COVERS)[number];

export const PHOTOBOOK_PAPERS = ['matte', 'lustre', 'fineart'] as const;
export type PhotobookPaper = (typeof PHOTOBOOK_PAPERS)[number];

/** The gear line on the cover: words in the cover's own type, never a logo. */
export const PHOTOBOOK_GEAR_MODES = ['none', 'brand', 'model'] as const;
export type PhotobookGearMode = (typeof PHOTOBOOK_GEAR_MODES)[number];

/** No `private`: a book nobody can open is not what this feature is for. */
export type PhotobookVisibility = 'public' | 'unlisted';

export const PHOTOBOOK_MAX_PAGES = 24;
/** Fewer than this and it is a leaflet. The form says how many more are needed. */
export const PHOTOBOOK_MIN_PAGES = 4;

export interface PhotobookPage {
  /** 1-based, the order the member chose. */
  position: number;
  photograph: PhotographCard;
}

export interface Photobook {
  id: string;
  slug: string;
  title: string;
  dedication: string | null;
  cover: PhotobookCover;
  paper: PhotobookPaper;
  gearMode: PhotobookGearMode;
  gearBrand: string | null;
  gearModel: string | null;
  visibility: PhotobookVisibility;
  /** Times the book page has been served. A number, never who. */
  opens: number;
  /** Where it sits on the owner's shelf, 1..12. */
  position: number;
  owner: PhotographerSummary;
  /** In position order. A page whose photograph is no longer published is absent. */
  pages: PhotobookPage[];
  updatedAt: string;
}

/* ------------------------------------------------------------------------ */
/* Photo series                                                              */
/* ------------------------------------------------------------------------ */

/** A few frames and the words around them, read on the page. */
export const SERIES_MIN_ITEMS = 3;
export const SERIES_MAX_ITEMS = 10;
export const SERIES_MAX_PER_MEMBER = 24;

export interface PhotoSeriesItem {
  position: number;
  photograph: PhotographDetail;
  caption: string | null;
}

export interface PhotoSeries {
  id: string;
  slug: string;
  title: string;
  /** The standfirst: one or two lines under the title. */
  standfirst: string | null;
  /** Plain paragraphs separated by blank lines. Never HTML. */
  body: string;
  /** The frame that stands for the series; one of its own items, or the first. */
  cover: PhotographDetail | null;
  visibility: PhotobookVisibility;
  opens: number;
  owner: PhotographerSummary;
  /** In position order. An item whose photograph is no longer published is absent. */
  items: PhotoSeriesItem[];
  updatedAt: string;
}

/* ------------------------------------------------------------------------ */
/* Reports and moderation                                                    */
/* ------------------------------------------------------------------------ */

export type ReportSubjectType = 'photograph' | 'location' | 'profile' | 'collection';

export const REPORT_REASONS = [
  'copyright',
  'not-my-photograph',
  'wrong-location',
  'privacy',
  'inappropriate',
  'spam',
  'duplicate',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  copyright: 'Copyright infringement',
  'not-my-photograph': 'This photograph is not the uploader’s work',
  'wrong-location': 'The location is wrong or misleading',
  privacy: 'Privacy concern about a person or a private place',
  inappropriate: 'Inappropriate or unsafe content',
  spam: 'Spam or misleading upload',
  duplicate: 'Duplicate of an existing entry',
  other: 'Something else',
};

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export interface Report {
  id: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  subjectLabel: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  /** Null for a report filed by a signed-out visitor. */
  reportedBy: PhotographerSummary | null;
}

export type ModerationDecision =
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'remove_content'
  | 'suspend_account'
  | 'dismiss'
  | 'change_role';

/** A member of staff, as the team panel lists them. */
export interface StaffMember {
  member: PhotographerSummary;
  role: 'moderator' | 'admin';
}

export interface ModerationAction {
  id: string;
  decision: ModerationDecision;
  subjectType: ReportSubjectType | 'location_submission';
  subjectId: string;
  /** Required for every negative decision, and shown to the member. */
  reason: string | null;
  moderator: PhotographerSummary;
  createdAt: string;
}

/* ------------------------------------------------------------------------ */
/* Queues                                                                    */
/* ------------------------------------------------------------------------ */

export interface LocationSubmission {
  id: string;
  proposedName: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  note: string | null;
  status: SubmissionStatus;
  submittedBy: PhotographerSummary;
  createdAt: string;
  /** Automated checks. Signals for a human, never an automatic decision. */
  signals: SubmissionSignal[];
  rejectionReason: string | null;
}

export interface SubmissionSignal {
  kind:
    | 'possible-duplicate'
    | 'coordinate-country-mismatch'
    | 'coordinate-out-of-range'
    | 'low-precision'
    | 'rate-limited'
    | 'sensitive-area';
  severity: 'info' | 'warn' | 'high';
  message: string;
  /** For a duplicate signal: the location it may duplicate. */
  relatedId?: string;
  relatedLabel?: string;
  distanceMetres?: number;
}

export interface SuspiciousUpload {
  id: string;
  photographId: string;
  title: string;
  thumbUrl: string;
  uploader: PhotographerSummary;
  createdAt: string;
  signals: UploadSignal[];
  /**
   * What the member wrote and chose, for the reviewer to check against the
   * image. Absent in the bundled demo queue, which predates review of every
   * upload.
   */
  details?: UploadReviewDetails;
}

/** Everything a member entered on the upload form, as a reviewer reads it. */
export interface UploadReviewDetails {
  /** The larger size, for looking closely. Null when only a thumbnail exists. */
  displayUrl: string | null;
  description: string | null;
  altText: string | null;
  category: string | null;
  location: { name: string; slug: string | null } | null;
  camera: string | null;
  lens: string | null;
  focalLengthMm: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  /** Only when the member chose to publish the capture date. */
  capturedAt: string | null;
  editingSoftware: string | null;
  editingNotes: string | null;
  width: number | null;
  height: number | null;
}

export interface UploadSignal {
  kind:
    | 'perceptual-hash-match'
    | 'content-flagged'
    | 'content-unchecked'
    | 'exif-missing'
    | 'exif-conflict'
    | 'burst-upload'
    | 'embedded-credit-mismatch'
    | 'low-resolution';
  severity: 'info' | 'warn' | 'high';
  message: string;
  relatedLabel?: string;
}

/* ------------------------------------------------------------------------ */
/* Query options                                                             */
/* ------------------------------------------------------------------------ */

export const SORT_OPTIONS = ['recent', 'appreciated', 'trending', 'editors'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Recently added',
  appreciated: 'Most appreciated',
  trending: 'Trending',
  editors: 'Editor’s picks',
};

/** How each ordering is computed, shown in the UI so ranking is not a mystery. */
export const SORT_EXPLANATIONS: Record<SortOption, string> = {
  recent: 'Newest published photographs first.',
  appreciated: 'Highest lifetime appreciation count first.',
  trending:
    'Appreciations earned recently count for more than older ones, so new work can surface.',
  editors: 'Chosen by FRAME editors. Always labelled, never paid for.',
};

export interface DiscoverQuery {
  category?: PhotoCategory | null;
  /** Free text matched against location name, city and country. */
  place?: string | null;
  cameraBrand?: string | null;
  cameraModel?: string | null;
  lensBrand?: string | null;
  sort: SortOption;
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** Null when an exact count would be too expensive to compute. */
  totalCount: number | null;
  hasMore: boolean;
}

/** Aggregate counts. Only ever rendered when they come from real data. */
export interface PlatformStats {
  photographs: number;
  locations: number;
  countries: number;
  photographers: number;
  /** True when these numbers describe the bundled demo dataset. */
  isDemoData: boolean;
}

export interface GearOption {
  id: string;
  label: string;
  photographCount: number;
}

export interface GearFacets {
  cameraBrands: GearOption[];
  cameraModels: GearOption[];
  lensBrands: GearOption[];
}
