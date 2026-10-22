/**
 * Hand-written database types for the FRAME schema.
 *
 * These are maintained by hand so the repository can be type-checked against
 * the schema before any Supabase project exists. Once a project is linked they
 * can be regenerated with the CLI, which produces the same shape:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > src/lib/supabase/types.ts
 *
 * Keep the column names in step with supabase/migrations: they are the contract
 * between this file and the SQL, and a typo here surfaces as a runtime
 * PostgREST error rather than a compile error.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Every row carries these, set by column defaults and an update trigger. */
interface Timestamps {
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------------ */
/* Row shapes                                                               */
/* ------------------------------------------------------------------------ */

export interface ProfileRow extends Timestamps {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  biography: string | null;
  website: string | null;
  based_in: string | null;
  /** ISO 3166-1 alpha-2, chosen by the member (migration 0016). */
  country_code: string | null;
  /** From PHOTOGRAPHY_STYLES, up to five (migration 0016). */
  style_tags: string[] | null;
  /** 'open' | 'selective' | 'closed', or null for "not said" (migration 0016). */
  collaboration_status: string | null;
  /** 'any' | 'technical' | 'none' (migration 0016). */
  critique_preference: string | null;
  /** Up to four http(s) links (migration 0016). */
  social_links: string[] | null;
  /** One of the member's own published photographs (migration 0017). */
  cover_photograph_id: string | null;
  usual_gear: string[] | null;
  role: 'member' | 'moderator' | 'admin';
  is_suspended: boolean;
  suspended_reason: string | null;
  member_since: string | null;
  /** Recounted from profile_follows by trigger (migration 0023). */
  follower_count: number;
  following_count: number;
}

/** A piece by the editors (migration 0030). */
export interface FeatureRow extends Timestamps {
  id: string;
  slug: string;
  title_en: string;
  title_th: string;
  intro_en: string;
  intro_th: string;
  status: 'draft' | 'published';
  published_at: string | null;
  first_published_at: string | null;
  created_by: string | null;
}

export interface FeatureItemRow {
  feature_id: string;
  photograph_id: string;
  position: number;
  caption_en: string | null;
  caption_th: string | null;
}

/** A theme for a window of time (migration 0027). */
export interface ChallengeRow extends Timestamps {
  id: string;
  slug: string;
  title_en: string;
  title_th: string;
  brief_en: string;
  brief_th: string;
  opens_at: string;
  closes_at: string;
  max_entries: number;
  requires_new_work: boolean;
  results_published_at: string | null;
  created_by: string | null;
}

export interface ChallengeEntryRow {
  challenge_id: string;
  photograph_id: string;
  entrant_id: string;
  created_at: string;
}

export interface ChallengeAwardRow {
  challenge_id: string;
  photograph_id: string;
  award: 'winner' | 'runner_up' | 'honourable_mention';
  note: string | null;
  awarded_by: string | null;
  created_at: string;
}

/** A follow. The pair is the primary key (migration 0023). */
export interface ProfileFollowRow {
  follower_id: string;
  followee_id: string;
  created_at: string;
}

/** Written only by triggers; a member may change only read_at (migration 0023). */
export interface NotificationRow {
  id: string;
  recipient_id: string;
  kind:
    | 'comment'
    | 'reply'
    | 'appreciation'
    | 'follow'
    | 'photograph_published'
    | 'challenge_award'
    | 'editors_pick'
    | 'featured'
    | 'admin_notice';
  actor_id: string | null;
  subject_type: 'photograph' | 'profile' | 'comment' | 'challenge' | 'feature';
  subject_id: string;
  subject_label: string;
  subject_slug: string | null;
  /** What the admin wrote (0032); null for every other kind. */
  message: string | null;
  read_at: string | null;
  created_at: string;
}

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
}

export interface ModelRow {
  id: string;
  brand_id: string;
  name: string;
  slug: string;
}

export interface LocationRow extends Timestamps {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  country_code: string;
  /** Nullable: a row can exist before a point has been confirmed. */
  latitude: number | null;
  longitude: number | null;
  /** geography(Point,4326), maintained by the schema. Never selected by the app. */
  geog: unknown;
  description: string | null;
  categories: string[] | null;
  shooting_notes: string[] | null;
  best_time_of_day: string | null;
  is_sensitive: boolean;
  withhold_coordinates: boolean;
  /** exact | approximate | area | none (0033); the two flags above are derived from it. */
  pin_precision: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  photograph_count: number;
}

export interface LocationRestrictionRow {
  id: string;
  location_id: string;
  kind: string;
  note: string | null;
  source: string;
  recorded_at: string;
  recorded_by: string | null;
}

export interface LocationSubmissionRow extends Timestamps {
  id: string;
  proposed_name: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  submitted_by: string;
  signals: Json;
  rejection_reason: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  approved_location_id: string | null;
  /** The photograph the proposal came with (0034). */
  photograph_id: string | null;
}

export interface PhotographRow extends Timestamps {
  id: string;
  slug: string;
  owner_id: string;
  title: string;
  description: string | null;
  alt_text: string;
  category: string;
  location_id: string | null;
  status: 'draft' | 'processing' | 'published' | 'under_review' | 'removed';
  editors_pick: boolean;
  appreciation_count: number;
  comment_count: number;
  published_at: string | null;
  /** Writable by the owner; readable by no public role since 0029. */
  captured_at: string | null;
  publish_captured_at: boolean;
  /** captured_at when the owner published it, null otherwise (0028, generated). */
  public_captured_at: string | null;
  /** When an editor picked it (0030); set only by set_editors_pick(). */
  editors_picked_at: string | null;
  rights_confirmed_at: string | null;
  storage_prefix: string | null;
  image_width: number | null;
  image_height: number | null;
  blur_data_url: string | null;
  removed_reason: string | null;
}

export interface PhotographImageRow {
  id: string;
  photograph_id: string;
  variant: 'thumb' | 'grid' | 'display' | 'full';
  storage_key: string;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  content_type: string | null;
}

export interface PhotographMetadataRow extends Timestamps {
  photograph_id: string;
  camera_brand_id: string | null;
  camera_model_id: string | null;
  lens_brand_id: string | null;
  lens_model_id: string | null;
  camera_brand_text: string | null;
  camera_model_text: string | null;
  lens_brand_text: string | null;
  lens_model_text: string | null;
  focal_length_mm: number | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
  editing_software: string | null;
  editing_notes: string | null;
  /** The member's film statements (0038): stock, camera, scanner. */
  film_stock: string | null;
  film_camera: string | null;
  film_scanner: string | null;
  exif_source: Json | null;
  exif_gps_latitude: number | null;
  exif_gps_longitude: number | null;
  /** False until the owner explicitly chooses to publish the EXIF position. */
  exif_gps_consent: boolean;
}

export interface PhotographAppreciationRow {
  id: string;
  photograph_id: string;
  profile_id: string;
  created_at: string;
}

export interface PhotographCommentRow extends Timestamps {
  id: string;
  photograph_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  hidden_reason: string | null;
}

export interface CollectionRow extends Timestamps {
  id: string;
  slug: string;
  owner_id: string;
  title: string;
  description: string | null;
  visibility: 'public' | 'private';
  cover_photograph_id: string | null;
  item_count: number;
}

export interface PhotobookRow extends Timestamps {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  dedication: string | null;
  cover_preset: string;
  paper_preset: string;
  gear_mode: string;
  gear_brand: string | null;
  gear_model: string | null;
  visibility: 'public' | 'unlisted';
  opens: number;
  position: number;
}

export interface PhotobookPageRow {
  photobook_id: string;
  photograph_id: string;
  position: number;
}

export interface PhotoSeriesRow extends Timestamps {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  standfirst: string | null;
  body: string;
  cover_photograph_id: string | null;
  visibility: 'public' | 'unlisted';
  opens: number;
}

export interface PhotoSeriesItemRow {
  series_id: string;
  photograph_id: string;
  position: number;
  caption: string | null;
}

/** 0037. Written by the server; readable by no public role. */
export interface PhotographFingerprintRow {
  photograph_id: string;
  /** 64 characters of 0 and 1 — a bit(64) crosses PostgREST as a string. */
  dhash: string;
  method: 'dhash-9x8-display';
  computed_at: string;
}

export interface PhotographExifCheckRow {
  photograph_id: string;
  verdict: 'camera' | 'film' | 'rejected';
  device_class: 'camera' | 'phone' | 'scanner' | 'unknown';
  missing: string[];
  make: string | null;
  model: string | null;
  lens_make: string | null;
  lens_model: string | null;
  body_serial: string | null;
  lens_serial: string | null;
  focal_length_mm: number | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
  metering_mode: string | null;
  flash: string | null;
  software: string | null;
  captured_at: string | null;
  has_gps: boolean;
  film_declared: boolean;
  checked_at: string;
}

export interface CollectionItemRow {
  id: string;
  collection_id: string;
  photograph_id: string | null;
  location_id: string | null;
  note: string | null;
  added_at: string;
}

export interface ReportRow extends Timestamps {
  id: string;
  subject_type: 'photograph' | 'location' | 'profile' | 'collection' | 'comment';
  subject_id: string;
  subject_label: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  reported_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface ModerationActionRow {
  id: string;
  decision: string;
  subject_type: string;
  subject_id: string;
  reason: string | null;
  moderator_id: string;
  created_at: string;
}

export interface RateLimitHitRow {
  id: string;
  bucket: string;
  created_at: string;
}

/* ------------------------------------------------------------------------ */
/* Insert and update shapes                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Everything the schema defaults or generates is optional on insert; the
 * columns listed in `Required` are the ones the caller must supply.
 */
type Insertable<Row, Required extends keyof Row = never> = Partial<Row> & Pick<Row, Required>;

type Updatable<Row> = Partial<Row>;

/* ------------------------------------------------------------------------ */
/* Database                                                                 */
/* ------------------------------------------------------------------------ */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insertable<ProfileRow, 'id' | 'username' | 'display_name'>;
        Update: Updatable<ProfileRow>;
        Relationships: [];
      };
      features: {
        Row: FeatureRow;
        Insert: Insertable<FeatureRow, 'slug' | 'title_en' | 'title_th' | 'intro_en' | 'intro_th'>;
        Update: Updatable<FeatureRow>;
        Relationships: [];
      };
      feature_items: {
        Row: FeatureItemRow;
        Insert: Insertable<FeatureItemRow, 'feature_id' | 'photograph_id' | 'position'>;
        Update: Updatable<FeatureItemRow>;
        Relationships: [];
      };
      challenges: {
        Row: ChallengeRow;
        Insert: Insertable<
          ChallengeRow,
          'slug' | 'title_en' | 'title_th' | 'brief_en' | 'brief_th' | 'opens_at' | 'closes_at'
        >;
        Update: Updatable<ChallengeRow>;
        Relationships: [];
      };
      challenge_entries: {
        Row: ChallengeEntryRow;
        Insert: Insertable<ChallengeEntryRow, 'challenge_id' | 'photograph_id' | 'entrant_id'>;
        Update: Updatable<ChallengeEntryRow>;
        Relationships: [
          {
            foreignKeyName: 'challenge_entries_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'challenge_entries_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_awards: {
        Row: ChallengeAwardRow;
        Insert: Insertable<ChallengeAwardRow, 'challenge_id' | 'photograph_id' | 'award'>;
        Update: Updatable<ChallengeAwardRow>;
        Relationships: [];
      };
      profile_follows: {
        Row: ProfileFollowRow;
        Insert: Insertable<ProfileFollowRow, 'follower_id' | 'followee_id'>;
        Update: Updatable<ProfileFollowRow>;
        Relationships: [
          {
            foreignKeyName: 'profile_follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_follows_followee_id_fkey';
            columns: ['followee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Insertable<NotificationRow, 'recipient_id' | 'kind' | 'subject_type' | 'subject_id' | 'subject_label'>;
        Update: Updatable<NotificationRow>;
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      camera_brands: {
        Row: BrandRow;
        Insert: Insertable<BrandRow, 'name' | 'slug'>;
        Update: Updatable<BrandRow>;
        Relationships: [];
      };
      camera_models: {
        Row: ModelRow;
        Insert: Insertable<ModelRow, 'brand_id' | 'name' | 'slug'>;
        Update: Updatable<ModelRow>;
        Relationships: [
          {
            foreignKeyName: 'camera_models_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'camera_brands';
            referencedColumns: ['id'];
          },
        ];
      };
      lens_brands: {
        Row: BrandRow;
        Insert: Insertable<BrandRow, 'name' | 'slug'>;
        Update: Updatable<BrandRow>;
        Relationships: [];
      };
      lens_models: {
        Row: ModelRow;
        Insert: Insertable<ModelRow, 'brand_id' | 'name' | 'slug'>;
        Update: Updatable<ModelRow>;
        Relationships: [
          {
            foreignKeyName: 'lens_models_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'lens_brands';
            referencedColumns: ['id'];
          },
        ];
      };
      locations: {
        Row: LocationRow;
        Insert: Insertable<
          LocationRow,
          'slug' | 'name' | 'city' | 'country' | 'country_code' | 'latitude' | 'longitude'
        >;
        Update: Updatable<LocationRow>;
        Relationships: [
          {
            foreignKeyName: 'locations_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      location_restrictions: {
        Row: LocationRestrictionRow;
        Insert: Insertable<LocationRestrictionRow, 'location_id' | 'kind' | 'source'>;
        Update: Updatable<LocationRestrictionRow>;
        Relationships: [
          {
            foreignKeyName: 'location_restrictions_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      location_submissions: {
        Row: LocationSubmissionRow;
        Insert: Insertable<
          LocationSubmissionRow,
          | 'proposed_name'
          | 'city'
          | 'country'
          | 'country_code'
          | 'latitude'
          | 'longitude'
          | 'submitted_by'
        >;
        Update: Updatable<LocationSubmissionRow>;
        Relationships: [
          {
            foreignKeyName: 'location_submissions_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      photographs: {
        Row: PhotographRow;
        Insert: Insertable<PhotographRow, 'slug' | 'owner_id' | 'title' | 'alt_text' | 'category'>;
        Update: Updatable<PhotographRow>;
        Relationships: [
          {
            foreignKeyName: 'photographs_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photographs_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          },
        ];
      };
      photograph_images: {
        Row: PhotographImageRow;
        Insert: Insertable<
          PhotographImageRow,
          'photograph_id' | 'variant' | 'storage_key' | 'width' | 'height'
        >;
        Update: Updatable<PhotographImageRow>;
        Relationships: [
          {
            foreignKeyName: 'photograph_images_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      photograph_metadata: {
        Row: PhotographMetadataRow;
        Insert: Insertable<PhotographMetadataRow, 'photograph_id'>;
        Update: Updatable<PhotographMetadataRow>;
        Relationships: [
          {
            foreignKeyName: 'photograph_metadata_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: true;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      photograph_appreciations: {
        Row: PhotographAppreciationRow;
        Insert: Insertable<PhotographAppreciationRow, 'photograph_id' | 'profile_id'>;
        Update: Updatable<PhotographAppreciationRow>;
        Relationships: [
          {
            foreignKeyName: 'photograph_appreciations_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photograph_appreciations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      photograph_comments: {
        Row: PhotographCommentRow;
        Insert: Insertable<PhotographCommentRow, 'photograph_id' | 'author_id' | 'body'>;
        Update: Updatable<PhotographCommentRow>;
        Relationships: [
          {
            foreignKeyName: 'photograph_comments_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photograph_comments_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photograph_comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'photograph_comments';
            referencedColumns: ['id'];
          },
        ];
      };
      photobooks: {
        Row: PhotobookRow;
        Insert: Insertable<PhotobookRow, 'owner_id' | 'slug' | 'title'>;
        Update: Updatable<PhotobookRow>;
        Relationships: [
          {
            foreignKeyName: 'photobooks_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      photobook_pages: {
        Row: PhotobookPageRow;
        Insert: PhotobookPageRow;
        Update: Partial<PhotobookPageRow>;
        Relationships: [
          {
            foreignKeyName: 'photobook_pages_photobook_id_fkey';
            columns: ['photobook_id'];
            isOneToOne: false;
            referencedRelation: 'photobooks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photobook_pages_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      photo_series: {
        Row: PhotoSeriesRow;
        Insert: Insertable<PhotoSeriesRow, 'owner_id' | 'slug' | 'title'>;
        Update: Updatable<PhotoSeriesRow>;
        Relationships: [
          {
            foreignKeyName: 'photo_series_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photo_series_cover_photograph_id_fkey';
            columns: ['cover_photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      photo_series_items: {
        Row: PhotoSeriesItemRow;
        Insert: Insertable<PhotoSeriesItemRow, 'series_id' | 'photograph_id' | 'position'>;
        Update: Partial<PhotoSeriesItemRow>;
        Relationships: [
          {
            foreignKeyName: 'photo_series_items_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'photo_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photo_series_items_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: false;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      photograph_exif_checks: {
        Row: PhotographExifCheckRow;
        Insert: Insertable<PhotographExifCheckRow, 'photograph_id' | 'verdict' | 'device_class'>;
        Update: Partial<PhotographExifCheckRow>;
        Relationships: [
          {
            foreignKeyName: 'photograph_exif_checks_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: true;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      photograph_fingerprints: {
        Row: PhotographFingerprintRow;
        Insert: Insertable<PhotographFingerprintRow, 'photograph_id' | 'dhash'>;
        Update: Partial<PhotographFingerprintRow>;
        Relationships: [
          {
            foreignKeyName: 'photograph_fingerprints_photograph_id_fkey';
            columns: ['photograph_id'];
            isOneToOne: true;
            referencedRelation: 'photographs';
            referencedColumns: ['id'];
          },
        ];
      };
      collections: {
        Row: CollectionRow;
        Insert: Insertable<CollectionRow, 'slug' | 'owner_id' | 'title'>;
        Update: Updatable<CollectionRow>;
        Relationships: [
          {
            foreignKeyName: 'collections_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      collection_items: {
        Row: CollectionItemRow;
        Insert: Insertable<CollectionItemRow, 'collection_id'>;
        Update: Updatable<CollectionItemRow>;
        Relationships: [
          {
            foreignKeyName: 'collection_items_collection_id_fkey';
            columns: ['collection_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: ReportRow;
        Insert: Insertable<ReportRow, 'subject_type' | 'subject_id' | 'subject_label' | 'reason'>;
        Update: Updatable<ReportRow>;
        Relationships: [
          {
            foreignKeyName: 'reports_reported_by_fkey';
            columns: ['reported_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_actions: {
        Row: ModerationActionRow;
        Insert: Insertable<
          ModerationActionRow,
          'decision' | 'subject_type' | 'subject_id' | 'moderator_id'
        >;
        Update: Updatable<ModerationActionRow>;
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_moderator_id_fkey';
            columns: ['moderator_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limit_hits: {
        Row: RateLimitHitRow;
        Insert: Insertable<RateLimitHitRow, 'bucket'>;
        Update: Updatable<RateLimitHitRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bump_photobook_opens: {
        Args: { p_slug: string };
        Returns: undefined;
      };
      bump_series_opens: {
        Args: { p_slug: string };
        Returns: undefined;
      };
      toggle_appreciation: {
        Args: { p_photograph_id: string };
        Returns: Array<{ appreciated: boolean; count: number }>;
      };
      check_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number };
        Returns: Array<{ allowed: boolean; remaining: number; retry_after_seconds: number }>;
      };
      delete_comment: {
        Args: { p_id: string };
        Returns: undefined;
      };
      toggle_follow: {
        Args: { p_profile_id: string };
        Returns: Array<{ following: boolean; follower_count: number }>;
      };
      is_service_role: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      similar_photographs: {
        Args: { p_photograph_ids: string[]; p_max_distance?: number };
        Returns: Array<{
          photograph_id: string;
          match_id: string;
          match_slug: string;
          match_title: string;
          match_username: string;
          same_owner: boolean;
          distance: number;
        }>;
      };
      mark_notifications_read: {
        Args: { p_ids: string[] | null };
        Returns: number;
      };
      hide_comment: {
        Args: { p_id: string; p_reason: string | null };
        Returns: undefined;
      };
      unhide_comment: {
        Args: { p_id: string };
        Returns: undefined;
      };
      publish_challenge_results: {
        Args: { p_challenge_id: string };
        Returns: string;
      };
      send_admin_notice: {
        Args: { p_photograph_id: string; p_message: string };
        Returns: undefined;
      };
      admin_email_is_staff: {
        Args: { p_email: string };
        Returns: boolean;
      };
      set_editors_pick: {
        Args: { p_photograph_id: string; p_pick: boolean };
        Returns: undefined;
      };
      publish_feature: {
        Args: { p_feature_id: string; p_publish: boolean };
        Returns: undefined;
      };
      set_feature_items: {
        Args: {
          p_feature_id: string;
          p_items: Array<{ photograph_id: string; caption_en: string | null; caption_th: string | null }>;
        };
        Returns: number;
      };
      own_photograph_capture_times: {
        Args: { p_ids: string[] };
        Returns: Array<{ photograph_id: string; captured_at: string | null }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** `Tables<'photographs'>` is the row type for that table. */
export type Tables<Name extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][Name]['Row'];

export type TablesInsert<Name extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][Name]['Insert'];

export type TablesUpdate<Name extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][Name]['Update'];
