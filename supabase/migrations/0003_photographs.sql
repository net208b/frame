-- =============================================================================
-- FRAME — 0003  Photographs, their derivatives, their metadata, appreciation
-- =============================================================================
-- Tables created here: photographs, photograph_images, photograph_metadata,
-- photograph_appreciations.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- photographs
-- -----------------------------------------------------------------------------
-- The unit of publication. A row exists from the moment an upload starts
-- (status 'draft'), so the storage keys can be derived from the id, and only
-- becomes public when a human has confirmed the rights.
create table if not exists public.photographs (
  id                  uuid primary key default gen_random_uuid(),

  -- The public identifier: every photograph page is /photographs/[slug].
  -- Written at draft time from the title, so storage, the audit trail and the
  -- URL all agree from the start.
  slug                text not null unique
                        constraint photographs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- cascade: deleting an account removes that member's photographs. There is no
  -- orphan-content path, because a photograph with no owner has nobody who can
  -- answer a copyright claim about it.
  owner_id            uuid not null references public.profiles (id) on delete cascade,

  title               text not null
                        constraint photographs_title_length
                        check (char_length(btrim(title)) between 1 and 120),
  description         text
                        constraint photographs_description_length
                        check (char_length(description) <= 2000),

  -- Required, 10–280 characters, authored by the uploader. Not generated, and
  -- not optional: an image with no alt text is an image a screen-reader user
  -- cannot see, and the grid is almost nothing but images.
  alt_text            text not null
                        constraint photographs_alt_text_length
                        check (char_length(btrim(alt_text)) between 10 and 280),

  -- Nullable while a draft is still being filled in; required to publish (see
  -- the photographs_publishable constraint below).
  category            text
                        constraint photographs_category_allowed
                        check (category in ('street', 'architecture', 'night',
                                            'urban-landscape', 'documentary', 'portrait')),

  -- set null: if a place is deleted the photograph survives without a place.
  location_id         uuid references public.locations (id) on delete set null,

  status              text not null default 'draft'
                        constraint photographs_status_allowed
                        check (status in ('draft', 'processing', 'published',
                                          'under_review', 'removed')),

  -- An editorial surface, always labelled in the UI and never mixed silently
  -- into another ordering. Moderator-only, enforced by the
  -- photographs_guard_privileged_columns trigger in 0006.
  editors_pick        boolean not null default false,

  -- Denormalised count, recomputed from photograph_appreciations — never
  -- incremented — by toggle_appreciation() and by the
  -- recount_photograph_appreciations trigger, so it cannot drift from the rows
  -- it summarises whichever path wrote them.
  appreciation_count  integer not null default 0
                        constraint photographs_appreciation_count_non_negative
                        check (appreciation_count >= 0),

  published_at        timestamptz,

  -- When the frame was made, from EXIF or typed by hand.
  captured_at         timestamptz,
  -- A capture date can place a person somewhere at a time. It is published only
  -- when the owner explicitly chose to publish it.
  publish_captured_at boolean not null default false,

  -- The moment the uploader confirmed, in their own words, that the work is
  -- theirs to publish. Required before status can become 'published'.
  rights_confirmed_at timestamptz,

  -- Storage prefix shared by every derivative: "<owner_id>/<photograph_id>".
  -- See storageKeys() in src/lib/images/variants.ts.
  storage_prefix      text,

  -- Intrinsic size of the display derivative, so the grid reserves the right
  -- box before the image lands.
  image_width         integer constraint photographs_image_width_positive check (image_width > 0),
  image_height        integer constraint photographs_image_height_positive check (image_height > 0),
  blur_data_url       text,

  removed_reason      text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- The constraint the copyright policy exists for. Publishing without a
  -- recorded rights confirmation is the single failure this schema will not
  -- allow, so it is a database constraint rather than a check in an action that
  -- somebody can forget to call. A published row must also carry the category
  -- and the pixel dimensions every card needs to render.
  constraint photographs_publishable
    check (status <> 'published'
           or (published_at is not null
               and rights_confirmed_at is not null
               and category is not null
               and image_width is not null
               and image_height is not null)),

  -- A removal a member cannot be told the reason for is not moderation.
  constraint photographs_removed_needs_reason
    check (status <> 'removed' or char_length(btrim(coalesce(removed_reason, ''))) > 0)
);

comment on table public.photographs is
  'One row per upload, from draft to published. RLS in 0007 exposes only status = ''published'' to the public.';
comment on column public.photographs.rights_confirmed_at is
  'Set when the uploader confirms the work is theirs. The photographs_publishable constraint makes this a precondition of publication, not a formality.';
comment on column public.photographs.publish_captured_at is
  'EXIF capture dates are read for the uploader''s convenience and published only on an explicit choice.';
comment on column public.photographs.editors_pick is
  'Editorial selection. Labelled wherever it appears, never paid for, and never a hidden boost inside another sort.';

-- -----------------------------------------------------------------------------
-- photograph_images
-- -----------------------------------------------------------------------------
-- One row per generated derivative. A gallery request must never be served an
-- original: see IMAGE_VARIANTS in src/lib/images/variants.ts.
create table if not exists public.photograph_images (
  id             uuid primary key default gen_random_uuid(),
  photograph_id  uuid not null references public.photographs (id) on delete cascade,
  variant        text not null
                   constraint photograph_images_variant_allowed
                   check (variant in ('thumb', 'grid', 'display', 'full')),
  storage_key    text not null
                   constraint photograph_images_storage_key_present
                   check (char_length(btrim(storage_key)) > 0),
  width          integer not null constraint photograph_images_width_positive check (width > 0),
  height         integer not null constraint photograph_images_height_positive check (height > 0),
  byte_size      integer not null constraint photograph_images_byte_size_positive check (byte_size > 0),

  -- Recorded from the real magic bytes read by sharp, never from the type the
  -- browser declared.
  content_type   text not null
                   constraint photograph_images_content_type_allowed
                   check (content_type in ('image/webp', 'image/avif', 'image/jpeg', 'image/png')),
  created_at     timestamptz not null default now(),

  -- One row per variant per photograph. Re-processing replaces a row rather
  -- than accumulating duplicates that the UI would then have to choose between.
  constraint photograph_images_photograph_variant_key unique (photograph_id, variant)
);

-- -----------------------------------------------------------------------------
-- photograph_metadata
-- -----------------------------------------------------------------------------
-- How the frame was made. Every field is optional: a photograph with no
-- recorded settings is still a photograph.
create table if not exists public.photograph_metadata (
  photograph_id      uuid primary key references public.photographs (id) on delete cascade,

  -- Normalised gear, used by the Discover facets.
  camera_brand_id    uuid references public.camera_brands (id) on delete set null,
  camera_model_id    uuid references public.camera_models (id) on delete set null,
  lens_brand_id      uuid references public.lens_brands (id) on delete set null,
  lens_model_id      uuid references public.lens_models (id) on delete set null,

  -- Exactly what the member typed, kept even when it matched a lookup row. A
  -- member shooting something that is not in the curated list is not asked to
  -- pretend otherwise, and the original string survives a later re-match.
  camera_brand_text  text,
  camera_model_text  text,
  lens_brand_text    text,
  lens_model_text    text,

  focal_length_mm    numeric(7, 2) constraint photograph_metadata_focal_length_positive check (focal_length_mm > 0),
  aperture           numeric(5, 2) constraint photograph_metadata_aperture_positive check (aperture > 0),
  -- Human-readable, as a photographer writes it: "1/250", "4s", "30".
  shutter_speed      text,
  iso                integer constraint photograph_metadata_iso_positive check (iso > 0),

  editing_software   text,
  editing_notes      text,

  -- The raw EXIF readout, kept so a moderator reviewing an ownership claim can
  -- see what the file actually said. EXIF is a convenience for prefilling the
  -- upload form and a signal for review. It is never proof of ownership: every
  -- field in it is trivially editable.
  exif_source        jsonb
                       constraint photograph_metadata_exif_source_is_object
                       check (exif_source is null or jsonb_typeof(exif_source) = 'object'),

  -- GPS read from the file.
  --
  -- These two columns exist so the member can be *asked* whether this was the
  -- place, and so a moderator can compare a disputed location against what the
  -- camera recorded. They are never published, never used to create or move a
  -- location, and never copied onto a photograph's public record without
  -- exif_gps_consent being true AND a moderator approving the resulting
  -- location submission. A camera that silently publishes someone's home
  -- address is the failure mode this project refuses to ship.
  exif_gps_latitude  double precision
                       constraint photograph_metadata_exif_latitude_range
                       check (exif_gps_latitude between -90 and 90),
  exif_gps_longitude double precision
                       constraint photograph_metadata_exif_longitude_range
                       check (exif_gps_longitude between -180 and 180),
  exif_gps_consent   boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.photograph_metadata.exif_gps_consent is
  'False until the member explicitly chooses to share the embedded GPS point. Consent alone still does not publish it; a moderator approves the location first.';
comment on column public.photograph_metadata.exif_source is
  'Raw EXIF as read. Evidence for a human review, never an ownership proof — EXIF is editable with a free tool.';

-- -----------------------------------------------------------------------------
-- photograph_appreciations
-- -----------------------------------------------------------------------------
create table if not exists public.photograph_appreciations (
  id            uuid primary key default gen_random_uuid(),
  photograph_id uuid not null references public.photographs (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- This unique constraint is the only thing standing between the ranking and a
  -- replayed request. Appreciation is one per member and reversible; without
  -- this row-level guarantee, anyone who can repeat an HTTP request can
  -- manufacture a trending photograph, and no amount of care in the server
  -- action would stop two concurrent requests both passing a "have you already
  -- appreciated this?" check. The count on photographs is recomputed from these
  -- rows, so the constraint protects the score as well as the table.
  constraint photograph_appreciations_one_per_member unique (photograph_id, profile_id)
);

comment on constraint photograph_appreciations_one_per_member on public.photograph_appreciations is
  'One appreciation per member per photograph. The database-level guarantee the ranking depends on; a replayed request hits this, not a race in application code.';
