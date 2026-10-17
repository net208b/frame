-- =============================================================================
-- FRAME — 0005  Indexes
-- =============================================================================
-- Every index below exists for a query the application actually runs, and says
-- which one. An index nobody can name a query for is a write cost with no
-- reader, so it does not get created here.
--
-- Keyset pagination is the intended access pattern throughout: the UI pages
-- with `where (ordering_column, id) < (:last_value, :last_id) order by
-- ordering_column desc, id desc limit :page_size`, which needs the tiebreaking
-- id inside the same index as the ordering column. That is why `id desc`
-- appears at the end of most of these.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- photographs
-- -----------------------------------------------------------------------------

-- The recent feed, /discover?sort=recent, and every status-scoped moderation
-- listing ("show me everything under review, newest first"). Leading `status`
-- makes the same index serve both the public feed and the queues.
create index if not exists photographs_status_published_at_idx
  on public.photographs (status, published_at desc, id desc);

-- /discover?sort=appreciated. published_at is the tiebreaker so two
-- photographs on the same count have a stable, meaningful order.
create index if not exists photographs_status_appreciation_idx
  on public.photographs (status, appreciation_count desc, published_at desc);

-- A photographer's portfolio and the "more by this photographer" row. Not
-- partial on status: the owner's own /upload listing reads their drafts through
-- the same index.
create index if not exists photographs_owner_published_at_idx
  on public.photographs (owner_id, published_at desc, id desc);

-- "Other photographs made at this place", on both the location page and the
-- photograph page. Partial, because only published rows are ever listed there,
-- which keeps the index to a fraction of the table.
create index if not exists photographs_location_published_idx
  on public.photographs (location_id, published_at desc, id desc)
  where status = 'published' and location_id is not null;

-- /discover?category=night, combined with the default recent ordering.
create index if not exists photographs_category_published_idx
  on public.photographs (category, published_at desc, id desc)
  where status = 'published';

-- /discover?sort=editors. A partial index, because editor's picks are a tiny
-- fraction of the table and this is the whole result set.
create index if not exists photographs_editors_pick_idx
  on public.photographs (published_at desc, id desc)
  where editors_pick and status = 'published';

-- Note on sort=trending: trending_score() decays with wall-clock time, so no
-- index can hold it — the ordering of two rows changes without either row being
-- written. The query therefore reads a bounded recent window through
-- photographs_status_published_at_idx (roughly the last fortnight, which is
-- about eleven half-lives, after which an older photograph cannot overtake a
-- newer one on any plausible count) and ranks that window. The cost is bounded
-- by the window, not by the table.

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------

-- The public location index and the moderation queue both filter on status
-- before anything else.
create index if not exists locations_status_idx
  on public.locations (status);

-- /locations ordered alphabetically, paged by keyset. Partial: the public index
-- never shows a pending or rejected place.
create index if not exists locations_approved_name_idx
  on public.locations (name, id)
  where status = 'approved';

-- /locations ordered by how much work has been made there, which is the default
-- the location index uses when no search term is given.
create index if not exists locations_approved_popular_idx
  on public.locations (photograph_count desc, name, id)
  where status = 'approved';

-- "Places in Japan", and the country grouping on the community page.
create index if not exists locations_country_city_idx
  on public.locations (country_code, city);

-- Radius queries: nearby places on a location page, and the viewport query
-- behind /map. GiST is the index type PostGIS distance operators can use.
create index if not exists locations_geog_gist
  on public.locations using gist (geog);

-- The free-text place search on /locations and /search, which matches one term
-- against name, city and country with ILIKE '%term%'. A btree cannot help a
-- leading wildcard; a trigram GIN index can. One multi-column GIN index rather
-- than three, because the query ORs the three columns together.
create index if not exists locations_search_trgm_idx
  on public.locations using gin (name gin_trgm_ops, city gin_trgm_ops, country gin_trgm_ops);

-- PhotographerProfile.locationsContributed, and the "places you proposed" list.
create index if not exists locations_submitted_by_idx
  on public.locations (submitted_by)
  where submitted_by is not null;

-- -----------------------------------------------------------------------------
-- location_restrictions, location_submissions
-- -----------------------------------------------------------------------------

-- Every location page loads its restrictions by location_id.
create index if not exists location_restrictions_location_idx
  on public.location_restrictions (location_id);

-- The moderation queue, oldest-first within a status in practice, newest-first
-- in the dashboard; one index serves both directions.
create index if not exists location_submissions_status_created_idx
  on public.location_submissions (status, created_at desc);

-- A member's own submissions, which is also the row set their RLS policy
-- allows them to read.
create index if not exists location_submissions_submitted_by_idx
  on public.location_submissions (submitted_by, created_at desc);

-- -----------------------------------------------------------------------------
-- photograph_images, photograph_metadata
-- -----------------------------------------------------------------------------
-- photograph_images needs no index on photograph_id alone: the
-- photograph_images_photograph_variant_key unique constraint already indexes
-- (photograph_id, variant), and a btree serves a prefix of its own columns.

-- The Discover gear filters and the GearFacets counts join photograph_metadata
-- on one of these three columns. They also make the `on delete set null` on
-- each foreign key an index lookup rather than a sequential scan when a lookup
-- row is removed.
create index if not exists photograph_metadata_camera_brand_idx
  on public.photograph_metadata (camera_brand_id)
  where camera_brand_id is not null;

create index if not exists photograph_metadata_camera_model_idx
  on public.photograph_metadata (camera_model_id)
  where camera_model_id is not null;

create index if not exists photograph_metadata_lens_brand_idx
  on public.photograph_metadata (lens_brand_id)
  where lens_brand_id is not null;

-- lens_model_id is deliberately left unindexed. Nothing filters or facets on an
-- individual lens model, and lens_models rows are curated reference data that
-- is not deleted in bulk, so the only cost of its absence is a one-off scan in
-- a maintenance operation nobody runs on a schedule.

-- -----------------------------------------------------------------------------
-- photograph_appreciations
-- -----------------------------------------------------------------------------

-- The appreciation burst check in src/lib/ranking.ts: "how many appreciations
-- has this account recorded in the last n minutes". Keyed on the account, as
-- the comment there insists, never on an IP address.
create index if not exists photograph_appreciations_profile_created_idx
  on public.photograph_appreciations (profile_id, created_at desc);

-- Lookups by photograph — "has the viewer appreciated this?" and the recount
-- inside toggle_appreciation() — are served by the leading column of the
-- photograph_appreciations_one_per_member unique index, so there is no separate
-- index here.

-- -----------------------------------------------------------------------------
-- collections
-- -----------------------------------------------------------------------------

-- A member's own collections, newest change first, which is how the profile and
-- the /collections page both order them.
create index if not exists collections_owner_updated_idx
  on public.collections (owner_id, updated_at desc, id desc);

-- The public /collections index.
create index if not exists collections_public_updated_idx
  on public.collections (updated_at desc, id desc)
  where visibility = 'public';

-- Loading a collection's items in insertion order.
create index if not exists collection_items_collection_idx
  on public.collection_items (collection_id, added_at desc, id desc);

-- "Which of my collections already hold this photograph?", asked by the add-to-
-- collection control, and the cascade when a photograph or place is deleted.
create index if not exists collection_items_photograph_idx
  on public.collection_items (photograph_id)
  where photograph_id is not null;

create index if not exists collection_items_location_idx
  on public.collection_items (location_id)
  where location_id is not null;

-- -----------------------------------------------------------------------------
-- reports, moderation_actions
-- -----------------------------------------------------------------------------

-- The moderation report queue: open reports, newest first.
create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);

-- "Has this already been reported, and how often?", shown next to a subject in
-- the queue so a moderator sees a pattern rather than one complaint.
create index if not exists reports_subject_idx
  on public.reports (subject_type, subject_id, created_at desc);

-- The row set a reporter's own RLS policy allows them to read.
create index if not exists reports_reported_by_idx
  on public.reports (reported_by, created_at desc)
  where reported_by is not null;

-- ModerationQueues.recentActions on the dashboard.
create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc, id desc);

-- The decision history for one subject, shown when a moderator opens an item
-- that has been acted on before.
create index if not exists moderation_actions_subject_idx
  on public.moderation_actions (subject_type, subject_id, created_at desc);

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

-- Finding the moderators. Partial, because almost every row is a member, which
-- makes this index a few pages rather than a copy of the table.
create index if not exists profiles_privileged_role_idx
  on public.profiles (role)
  where role <> 'member';

-- PlatformStats.photographers counts profiles that are not suspended; the
-- partial index keeps that count off the heap.
create index if not exists profiles_active_idx
  on public.profiles (created_at desc)
  where is_suspended = false;

-- -----------------------------------------------------------------------------
-- rate_limit_hits
-- -----------------------------------------------------------------------------

-- check_rate_limit() counts one bucket inside a time window and then deletes
-- rows older than a day. Both are range scans on (bucket, created_at).
create index if not exists rate_limit_hits_bucket_created_idx
  on public.rate_limit_hits (bucket, created_at desc);

-- The housekeeping delete, which is not bucket-scoped.
create index if not exists rate_limit_hits_created_idx
  on public.rate_limit_hits (created_at);
