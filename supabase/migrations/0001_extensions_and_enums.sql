-- =============================================================================
-- FRAME — 0001  Extensions, shared vocabulary, and why there are no enum types
-- =============================================================================
-- Run order: 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007, then seed.sql.
-- Every file is written to be re-runnable: a second run must not fail halfway.
-- =============================================================================

-- Supabase installs extensions into a dedicated `extensions` schema so the
-- public schema holds nothing but this project's own tables. The schema already
-- exists on a hosted project; creating it here keeps a bare Postgres database
-- working too.
create schema if not exists extensions;

-- `extensions` is appended to the search path in every file that needs a
-- PostGIS type or function, so the same SQL works whether PostGIS was installed
-- into `extensions` (our choice, and Supabase's recommendation) or into
-- `public` (how some older projects were set up).
set search_path = public, extensions;

-- gen_random_uuid() for primary keys. Present on every Supabase project.
create extension if not exists pgcrypto with schema extensions;

-- Case-insensitive text, used for profiles.username. Two members must not be
-- able to register "Kenji" and "kenji" and then impersonate each other in a
-- URL, a mention or a credit line.
create extension if not exists citext with schema extensions;

-- PostGIS, for locations.geog and the radius queries behind "nearby places"
-- and the map.
--
-- IMPORTANT, hosted projects: PostGIS is available but not enabled by default.
-- Enable it once per project before running these migrations, either from the
-- Supabase dashboard (Database → Extensions → postgis → enable) or by running
-- this statement from the SQL editor with the postgres role. The local stack
-- started by `supabase start` already ships the extension, so this line is
-- enough there. See supabase/README.md.
create extension if not exists postgis with schema extensions;

-- Trigram matching for the location search on /locations and /search, which
-- matches free text against name, city and country. Without this, those
-- ILIKE '%term%' queries can only be answered by a sequential scan.
create extension if not exists pg_trgm with schema extensions;

-- Accent folding, used by frame_slugify() in 0006 so a slug derived from
-- "Café de Flore" becomes "cafe-de-flore" rather than "caf-de-flore" and
-- therefore matches the slug the TypeScript slugify() would have produced.
create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Why this file defines no enum types
-- -----------------------------------------------------------------------------
-- Every closed vocabulary in FRAME is a `text` column with an inline CHECK
-- constraint rather than a PostgreSQL enum. Three reasons, in order of weight:
--
-- 1. The vocabularies are already declared once, in TypeScript, in
--    src/types/domain.ts (PHOTO_CATEGORIES, REPORT_REASONS, PublicationStatus,
--    ModerationDecision, …). A CHECK constraint listing the same literals is
--    readable side by side with that file; an enum type's values are not.
-- 2. Removing or renaming an enum value is close to impossible in place, while
--    a CHECK constraint is one `alter table ... drop constraint` away. A
--    community platform's taxonomy does change.
-- 3. PostgREST exposes both as strings, so the API shape is identical either
--    way — there is nothing to gain for the client.
--
-- The canonical vocabularies, repeated here so a reviewer can see them in one
-- place. Each appears again as a CHECK constraint on the column that uses it:
--
--   photo category      street | architecture | night | urban-landscape
--                       | documentary | portrait
--   publication status  draft | processing | published | under_review | removed
--   submission status   pending | approved | rejected | changes_requested
--   location status     pending | approved | rejected
--   restriction kind    permit | private-property | no-tripod | hours | fee
--                       | other
--   profile role        member | moderator | admin
--   image variant       thumb | grid | display | full
--   collection access   public | private
--   report subject      photograph | location | profile | collection
--   report reason       copyright | not-my-photograph | wrong-location
--                       | privacy | inappropriate | spam | duplicate | other
--   report status       open | reviewing | actioned | dismissed
--   moderation decision approve | reject | request_changes | remove_content
--                       | suspend_account | dismiss
