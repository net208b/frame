-- =============================================================================
-- FRAME — 0002  People, gear reference data, places
-- =============================================================================
-- Tables created here: profiles, camera_brands, camera_models, lens_brands,
-- lens_models, locations, location_restrictions, location_submissions.
--
-- `geography` is referenced below, so the PostGIS schema joins the search path.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- One row per account, created by the handle_new_user() trigger in 0006 rather
-- than by the application, so an account can never exist without a profile.
-- The id is the auth.users id: there is no second identity to keep in step.
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,

  -- citext, so "Kenji" and "kenji" cannot both be registered.
  --
  -- The regex is applied to `username::text` on purpose. citext overloads the
  -- regex operators to be case-insensitive, so `username ~ '^[a-z0-9_]{3,24}$'`
  -- would happily accept "Kenji". Casting to text restores case sensitivity and
  -- makes the constraint mean what it says: lowercase only.
  username         citext not null unique
                     constraint profiles_username_format
                     check ((username)::text ~ '^[a-z0-9_]{3,24}$'),

  display_name     text not null
                     constraint profiles_display_name_length
                     check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url       text,
  biography        text constraint profiles_biography_length check (char_length(biography) <= 1200),
  website          text,

  -- Member-supplied free text. Never derived from an IP address or a locale
  -- header: a guessed location presented as a fact is a privacy problem.
  based_in         text,

  usual_gear       text[] not null default '{}',

  role             text not null default 'member'
                     constraint profiles_role_allowed
                     check (role in ('member', 'moderator', 'admin')),

  is_suspended     boolean not null default false,
  suspended_reason text,

  -- Date, not timestamp: the profile page shows month precision only, so the
  -- exact signup moment is never published.
  member_since     date not null default current_date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A suspension a member cannot be told the reason for is not a moderation
  -- decision, it is a disappearance. The brief requires the reason, so the
  -- schema requires it too.
  constraint profiles_suspension_needs_reason
    check (not is_suspended or char_length(btrim(coalesce(suspended_reason, ''))) > 0)
);

comment on table public.profiles is
  'Public member profile. Created by the handle_new_user() trigger on auth.users; role is never set above ''member'' there.';
comment on column public.profiles.role is
  'Authorisation level. Changed only by an admin or the service role — enforced by the profiles_guard_privileged_columns trigger in 0006, not by hiding a control in the UI.';
comment on column public.profiles.based_in is
  'Free text the member typed. Never inferred from a request.';

-- -----------------------------------------------------------------------------
-- Gear reference data
-- -----------------------------------------------------------------------------
-- Four lookup tables rather than free text on every photograph, because the
-- Discover filters (GearFacets) need to count photographs per brand and per
-- model, and "Fujifilm", "FUJIFILM" and "Fuji" must not become three facets.
--
-- A member whose gear is not in these tables is not blocked: the free-text
-- *_text columns on photograph_metadata record exactly what they typed. That
-- is also why members have no write access to these tables (see 0007) — the
-- canonical list is curated, the long tail is free text.
--
-- Lens brands are a separate table from camera brands on purpose: a
-- manufacturer's lens brand is frequently not its camera brand (Fujifilm sells
-- Fujinon lenses, Nikon sells Nikkor, Panasonic sells Lumix).

create table if not exists public.camera_brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique
               constraint camera_brands_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camera_models (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.camera_brands (id) on delete cascade,
  name       text not null,
  -- Globally unique, and therefore brand-prefixed by the seed ("sony-a7-iv"):
  -- two manufacturers can and do ship a model with the same bare name.
  slug       text not null unique
               constraint camera_models_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camera_models_brand_name_key unique (brand_id, name)
);

create table if not exists public.lens_brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique
               constraint lens_brands_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lens_models (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.lens_brands (id) on delete cascade,
  name       text not null,
  slug       text not null unique
               constraint lens_models_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lens_models_brand_name_key unique (brand_id, name)
);

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
-- A place a photograph was made. Members do not insert here; they submit to
-- location_submissions and a moderator approves, because neither a coordinate
-- nor a reverse-geocode can establish that a place exists, is accessible, or is
-- safe to publish.
create table if not exists public.locations (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique
                         constraint locations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text not null
                         constraint locations_name_length check (char_length(btrim(name)) between 1 and 160),
  city                 text not null,
  country              text not null,

  -- ISO 3166-1 alpha-2, upper case. char(2) ignores trailing blanks in
  -- char_length(), so a single character fails the length check rather than
  -- being silently padded through it.
  country_code         char(2) not null
                         constraint locations_country_code_format
                         check (char_length(country_code) = 2
                                and (country_code)::text = upper((country_code)::text)),

  latitude             double precision not null
                         constraint locations_latitude_range check (latitude between -90 and 90),
  longitude            double precision not null
                         constraint locations_longitude_range check (longitude between -180 and 180),

  -- Kept in step with latitude/longitude by the locations_set_geog trigger in
  -- 0006, so it can never disagree with the numbers the UI shows.
  geog                 geography(Point, 4326),

  description          text,

  -- Which categories this place actually suits, derived from its published
  -- photographs by the recount_location_photographs trigger in 0006. Empty is
  -- the correct value for a place with no published work, which is why a
  -- freshly seeded database leaves it that way.
  categories           text[] not null default '{}'
                         constraint locations_categories_allowed
                         check (categories <@ array['street', 'architecture', 'night',
                                                    'urban-landscape', 'documentary',
                                                    'portrait']::text[]
                                and array_position(categories, null) is null),

  shooting_notes       text[] not null default '{}',
  best_time_of_day     text,

  -- Privacy flags. is_sensitive coarsens the published coordinate to roughly a
  -- kilometre (LOCATION_POLICY.reducedCoordinateDecimals); withhold_coordinates
  -- publishes none at all. Both are moderator decisions, and
  -- publishableCoordinates() in src/lib/geo.ts is the only place that reads
  -- them. Precision is never widened on read.
  is_sensitive         boolean not null default false,
  withhold_coordinates boolean not null default false,

  status               text not null default 'pending'
                         constraint locations_status_allowed
                         check (status in ('pending', 'approved', 'rejected')),

  -- set null, not cascade: deleting an account must not delete the places the
  -- community now relies on. The credit disappears, the place stays.
  submitted_by         uuid references public.profiles (id) on delete set null,
  approved_at          timestamptz,
  approved_by          uuid references public.profiles (id) on delete set null,

  -- Denormalised count of published photographs, maintained by the
  -- recount_location_photographs trigger in 0006.
  photograph_count     integer not null default 0
                         constraint locations_photograph_count_non_negative
                         check (photograph_count >= 0),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- An approved place with no approval timestamp cannot be audited. The
  -- locations_stamp_approval trigger in 0006 fills the timestamp in, so this
  -- constraint catches a bug rather than obstructing a moderator.
  constraint locations_approved_needs_timestamp
    check (status <> 'approved' or approved_at is not null)
);

comment on column public.locations.is_sensitive is
  'Moderator flag. Reduces published coordinate precision to about a kilometre. Read only through publishableCoordinates().';
comment on column public.locations.withhold_coordinates is
  'Moderator flag. No coordinate is published at all; the place is listed without a point on the map.';
comment on column public.locations.geog is
  'Derived from latitude/longitude by trigger. Exists for the GiST radius queries behind nearby places and the map.';

-- -----------------------------------------------------------------------------
-- location_restrictions
-- -----------------------------------------------------------------------------
-- Access and photography restrictions attached to a place.
create table if not exists public.location_restrictions (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  kind        text not null
                constraint location_restrictions_kind_allowed
                check (kind in ('permit', 'private-property', 'no-tripod', 'hours', 'fee', 'other')),
  note        text not null
                constraint location_restrictions_note_present
                check (char_length(btrim(note)) > 0),

  -- NOT NULL on purpose. An unsourced "permit required" or "no tripods" note is
  -- a rumour, and publishing it under FRAME's name can stop someone making a
  -- photograph they were entitled to make. If nobody can say where the claim
  -- came from, the row does not get written.
  source      text not null
                constraint location_restrictions_source_present
                check (char_length(btrim(source)) > 0),

  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null
);

comment on column public.location_restrictions.source is
  'Where the claim comes from — signage, an operator''s published policy, a dated moderator site visit. Required: see docs/LIMITATIONS.md.';

-- -----------------------------------------------------------------------------
-- location_submissions
-- -----------------------------------------------------------------------------
-- A member's proposal for a new place. This is the only way a member adds a
-- location, and it always ends with a human decision.
create table if not exists public.location_submissions (
  id                   uuid primary key default gen_random_uuid(),
  proposed_name        text not null
                         constraint location_submissions_name_length
                         check (char_length(btrim(proposed_name)) between 1 and 160),
  city                 text not null,
  country              text not null,
  country_code         char(2) not null
                         constraint location_submissions_country_code_format
                         check (char_length(country_code) = 2
                                and (country_code)::text = upper((country_code)::text)),
  latitude             double precision not null
                         constraint location_submissions_latitude_range
                         check (latitude between -90 and 90),
  longitude            double precision not null
                         constraint location_submissions_longitude_range
                         check (longitude between -180 and 180),
  note                 text,

  status               text not null default 'pending'
                         constraint location_submissions_status_allowed
                         check (status in ('pending', 'approved', 'rejected', 'changes_requested')),

  -- not null, so cascade rather than set null: a submission with no author
  -- cannot be followed up, and there is nobody left to tell the outcome to.
  submitted_by         uuid not null references public.profiles (id) on delete cascade,

  -- SubmissionSignal[] from evaluateLocationSubmission(). Automated checks
  -- recorded for a human to read. Never an automatic decision: see 0006, which
  -- deliberately has no "auto-approve" path.
  signals              jsonb not null default '[]'::jsonb
                         constraint location_submissions_signals_is_array
                         check (jsonb_typeof(signals) = 'array'),

  rejection_reason     text,
  resolved_at          timestamptz,
  resolved_by          uuid references public.profiles (id) on delete set null,
  approved_location_id uuid references public.locations (id) on delete set null,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- A member told "rejected" and nothing else has been given a verdict, not an
  -- explanation. Every negative outcome carries its reason.
  constraint location_submissions_rejection_needs_reason
    check (status not in ('rejected', 'changes_requested')
           or char_length(btrim(coalesce(rejection_reason, ''))) > 0),

  constraint location_submissions_approved_needs_location
    check (status <> 'approved' or approved_location_id is not null)
);

comment on column public.location_submissions.signals is
  'Automated review signals (SubmissionSignal[]). Advisory only — a coordinate inside a country box is not evidence that a place exists.';
