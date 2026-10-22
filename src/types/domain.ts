/**
 * Domain types shared by the demo dataset, the Supabase repository and the UI.
 *
 * The UI only ever depends on these shapes, which is what makes it possible to
 * swap the demo dataset for live queries, or Supabase Storage for R2, without
 * touching a component.
 */

/* ------------------------------------------------------------------------ */
/* Machine translation                                                       */
/* ------------------------------------------------------------------------ */

/**
 * One field of member-written text, put into the language its author did not
 * write in (migration 0035).
 *
 * The original always stays on the field it has always been on. This is an
 * addition beside it, never a replacement: a reader is shown the translation
 * when it is in their language, and can always ask for the words as written.
 */
export interface ContentTranslation {
  /** The language this text is in. Never the one the author wrote in. */
  language: 'en' | 'th';
  value: string;
}

/**
 * The translated fields of one subject, keyed by the domain field name. A
 * field with no translation is absent — there is no placeholder to mistake
 * for a translation that failed.
 */
export type Translations<Field extends string> = Partial<Record<Field, ContentTranslation>>;

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
 * It is a sentence to other members, not a permission. The comment thread
 * shows it above the box so the next person reads it before they write, but
 * nothing here is enforced: a member who asks for no critique still receives
 * whatever is said, and the Settings form says as much where it is set.
 * Presenting it as a control would be the kind of promise this project does
 * not make.
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
  /**
   * The biography and the approach in the other language — 0035 for the
   * biography, 0041 for the approach.
   */
  translations: Translations<'biography' | 'approach'>;
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
  /**
   * Cities the member keeps returning to, in their own words (0040).
   *
   * Free text rather than a reference to a city hub: a city somebody loves may
   * have no approved place on FRAME at all, and saying so should not require
   * one.
   */
  favouriteCities: string[];
  /** How the member goes about the work, in their own words (0040). */
  approach: string | null;
  /**
   * One way to reach the member, OUTSIDE FRAME (0040) — http(s), or a mailto:
   * they typed themselves. Not messaging: FRAME has no inbox and this is not
   * one, it is a link the member chose to publish.
   */
  contactUrl: string | null;
  photographCount: number;
  appreciationsReceived: number;
  locationsContributed: number;
  /** How many members follow this one, and how many it follows. */
  followerCount: number;
  followingCount: number;
  /** Month precision only — the exact signup day is not public. */
  memberSince: string;
  role: ProfileRole;
}

/* ------------------------------------------------------------------------ */
/* Places                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * How precisely a place is pinned, chosen by staff at approval and changeable
 * afterwards. Kept in step with locations_pin_precision_allowed (0033).
 */
export const PIN_PRECISIONS = ['exact', 'approximate', 'area', 'none'] as const;

export type PinPrecision = (typeof PIN_PRECISIONS)[number];

export interface LocationSummary {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  photographCount: number;
  /**
   * The place's name in the other language (0035), so a reader sees "Bang
   * Kapi" wherever a Thai-named place is credited rather than only on the
   * place's own page.
   *
   * It travels with the summary because the name is written on a photograph
   * too — in its breadcrumb, under its frame and in its `<title>` — and those
   * readers hold a summary, not the full record.
   *
   * Empty unless the read fetched it. `translationsFor` is one query per list,
   * so a read pays for it only where the name is rendered to a member: the
   * photograph reads, the nearby list and a collection's places.
   * `findDuplicateLocationCandidates` deliberately does not — it is a staff
   * tool for comparing the names as written. `MapPin` is its own shape rather
   * than a summary, so the map still labels a pin with the name as written.
   */
  translations: Translations<'name'>;
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
  /** The name and the description, where the summary carries only the name. */
  translations: Translations<'name' | 'description'>;
  /** Null when the place is sensitive and no coordinate may be published. */
  coordinates: Coordinates | null;
  /** The staff's precision choice for this place (0033). */
  pinPrecision: PinPrecision;
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

/**
 * Where a published photograph's capture values came from.
 *
 * `camera` means the file's own EXIF readout carries every value shown;
 * `edited` means at least one was typed or corrected; `unknown` means there is
 * no readout to compare against — a scan from film, or a row from before the
 * readout was kept. It is a statement about these fields, never about whether
 * the photograph is genuine: EXIF is editable with a free tool, which is why
 * the schema calls `exif_source` evidence for review and not proof.
 */
export type CaptureProvenance = 'camera' | 'edited' | 'unknown';

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
  /**
   * For a frame scanned from film (0038): the stock, the film camera and the
   * scanner, in the member's words. All null for a digital frame. Shown on
   * the page the way aperture and ISO are shown for a digital one.
   */
  filmStock: string | null;
  filmCamera: string | null;
  filmScanner: string | null;
  /**
   * Whether the values above are the ones the file carried.
   *
   * One marker for the whole block rather than a flag per field: the page is
   * craft information, not a properties panel, and a reader needs to know how
   * to read the numbers, not which individual cell was retyped. Computed by
   * `lib/images/provenance.ts` from `photograph_metadata.exif_source`, which
   * 0015 grants to anon and authenticated.
   */
  provenance: CaptureProvenance;
}

export interface EditingDetails {
  software: string | null;
  notes: string | null;
}

/**
 * What the photographer was doing, in their own words (0044).
 *
 * Deliberately not part of {@link EditingDetails}: that is what happened after
 * the shutter, this is before it. And deliberately not part of
 * {@link CaptureSettings}, which is what the camera was set to — no file holds
 * this. It is shown beside the numbers and never as proof that a photograph is
 * good (§7.3).
 */
export type PhotographExplanation = string | null;

export interface PhotographDetail extends PhotographCard {
  description: string | null;
  /** The title, description and alt text in the other language (0035). */
  translations: Translations<'title' | 'description' | 'altText'>;
  capture: CaptureSettings;
  editing: EditingDetails;
  /** The photographer's account of what they were doing (0044). */
  explanation: PhotographExplanation;
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
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

/**
 * What a member can be told about.
 *
 * Kept in step with notifications_kind_allowed (migration 0023). Every one of
 * these is something that happened to the member's own work or account —
 * nothing here is a suggestion, a digest or a promotion.
 */
export const NOTIFICATION_KINDS = [
  'comment',
  'reply',
  'appreciation',
  'follow',
  'photograph_published',
  'challenge_award',
  'editors_pick',
  'featured',
  'admin_notice',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * One thing that happened.
 *
 * `subjectLabel` and `subjectSlug` are frozen copies taken when the row was
 * written, for the same reason `Report.subjectLabel` is one: a notification
 * outlives its subject, and the sentence has to still read after the
 * photograph is removed. `actor` is null for a notice with no author — a
 * photograph clearing review is the platform's doing, not a person's.
 */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  actor: PhotographerSummary | null;
  subjectType: 'photograph' | 'profile' | 'comment' | 'challenge' | 'feature';
  subjectId: string;
  subjectLabel: string;
  /** The photograph's slug or the member's username, for the link. */
  subjectSlug: string | null;
  /** What the admin wrote, for an admin notice. Null for every other kind. */
  message: string | null;
  readAt: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------------ */
/* Features                                                                  */
/* ------------------------------------------------------------------------ */

/** A feature needs at least this many published photographs to go up (0030). */
export const FEATURE_MIN_ITEMS = 3;
export const FEATURE_MAX_ITEMS = 24;

/** One photograph in a feature, with the editors' caption. */
export interface FeatureItem {
  photograph: PhotographDetail;
  position: number;
  caption: { en: string | null; th: string | null };
}

/**
 * A short piece by FRAME's editors: a title and an introduction in both
 * languages, and a sequence of published photographs. Drafts reach only
 * staff; a photograph taken down drops out of the piece.
 */
export interface FeatureSummary {
  id: string;
  slug: string;
  title: { en: string; th: string };
  intro: { en: string; th: string };
  status: 'draft' | 'published';
  publishedAt: string | null;
  /** The first photograph, for a card. */
  cover: PhotographDetail | null;
  itemCount: number;
}

export interface FeatureDetail extends FeatureSummary {
  items: FeatureItem[];
}

/* ------------------------------------------------------------------------ */
/* Challenges                                                                */
/* ------------------------------------------------------------------------ */

/** Kept in step with challenge_awards_award_allowed (migration 0027). */
export const CHALLENGE_AWARDS = ['winner', 'runner_up', 'honourable_mention'] as const;

export type ChallengeAward = (typeof CHALLENGE_AWARDS)[number];

/**
 * Where a challenge is in its life. Derived from its dates and from whether the
 * results are out — never stored, so it cannot disagree with the clock.
 */
export type ChallengePhase = 'upcoming' | 'open' | 'judging' | 'closed';

export interface ChallengeSummary {
  id: string;
  slug: string;
  /** Editorial copy, written by staff in both languages. */
  title: { en: string; th: string };
  brief: { en: string; th: string };
  opensAt: string;
  closesAt: string;
  maxEntries: number;
  /** Only photographs made after the challenge opened, by the file's EXIF. */
  requiresNewWork: boolean;
  resultsPublishedAt: string | null;
  phase: ChallengePhase;
  /** Entries whose photograph is still published. */
  entryCount: number;
  /** The winning photograph, once results are published. */
  winner: PhotographDetail | null;
}

export interface ChallengeEntry {
  photograph: PhotographDetail;
  enteredAt: string;
  /** Null until awarded — and, for the public, until the results are published. */
  award: ChallengeAward | null;
  note: string | null;
}

export interface ChallengeDetail extends ChallengeSummary {
  /** Awarded entries first, in award order; then the rest, newest first. */
  entries: ChallengeEntry[];
}

/** One of the viewer's own photographs, as the entry panel offers it. */
export interface ChallengeCandidate {
  photograph: PhotographDetail;
  entered: boolean;
  /** False when the new-work rule refuses it; the database refuses it too. */
  eligible: boolean;
}

/* ------------------------------------------------------------------------ */
/* Comments                                                                  */
/* ------------------------------------------------------------------------ */

/** Up to this many characters in a single comment. */
export const COMMENT_MAX_LENGTH = 1_000;

/**
 * One thing said under a photograph.
 *
 * A deleted comment keeps its place in the thread with an empty body, so a
 * reply does not lose the remark it was answering; the page shows "this comment
 * was deleted" rather than a gap. A hidden comment only ever reaches this shape
 * for its author, the photograph's owner and moderators — row-level security
 * decides that, not the page — and `hiddenReason` is what the owner or the
 * moderator wrote when they hid it.
 */
export interface PhotographComment {
  id: string;
  /** Null for a top-level comment; the parent's id for a reply. */
  parentId: string | null;
  author: PhotographerSummary;
  /** Empty when the comment was deleted. */
  body: string;
  /** The body in the other language (0035). */
  translations: Translations<'body'>;
  createdAt: string;
  /** Set once the author has changed their words. */
  editedAt: string | null;
  isDeleted: boolean;
  isHidden: boolean;
  hiddenReason: string | null;
  /**
   * Who hid it. The photographer may restore only a comment they hid
   * themselves, so the page needs to know whose decision it was.
   */
  hiddenById: string | null;
  /** Replies to this comment, oldest first. Only a top-level comment has any. */
  replies: PhotographComment[];
}

/** A photograph's whole conversation, with the number a card would show. */
export interface PhotographThread {
  comments: PhotographComment[];
  /** Live comments only — a deleted or hidden one is not part of the count. */
  count: number;
}

/* ------------------------------------------------------------------------ */
/* Reports and moderation                                                    */
/* ------------------------------------------------------------------------ */

export type ReportSubjectType = 'photograph' | 'location' | 'profile' | 'collection' | 'comment';

export const REPORT_REASONS = [
  'copyright',
  'not-my-photograph',
  'wrong-location',
  'privacy',
  'inappropriate',
  'spam',
  'duplicate',
  /** For other film photographers: a declared scan that is not one (0038). */
  'not-film-or-camera',
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
  'not-film-or-camera': 'Declared as film, but not from film or a camera',
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
  | 'change_role'
  /** An admin removing a place outright (0036), not taking it down. */
  | 'delete'
  /** A moderator folding one place into another (0039). */
  | 'merge';

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
  /** The member's film statements joined for reading, or null for a digital frame. */
  film: string | null;
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
    | 'low-resolution'
    | 'film-declared';
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
  /**
   * The lens model (0043). Last of the four gear filters because its column was
   * the one 0005 left unindexed — the index arrived with this filter.
   */
  lensModel?: string | null;
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
  /**
   * Lens models (0043). Last of the four because it is the one whose column
   * 0005 left unindexed — the index arrived with the facet, not before it.
   */
  lensModels: GearOption[];
}
