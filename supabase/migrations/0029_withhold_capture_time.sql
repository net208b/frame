-- =============================================================================
-- FRAME — 0029  The raw capture time stays with the database
-- =============================================================================
-- The second of two steps. Apply only once the application reads
-- `public_captured_at` (0028): code still selecting `captured_at` as a public
-- role is refused by this migration, on every photograph query it makes.
--
-- The same move 0015 made for the GPS position in photograph_metadata: the
-- table-level SELECT goes, and SELECT comes back on every column except the
-- one the owner may have chosen to withhold. Writing is untouched — a member
-- still sets `captured_at` on their own photograph through the table-level
-- UPDATE, and the functions that need the real value (the camera-only rule in
-- 0021, the new-work rule in 0027, own_photograph_capture_times()) are
-- SECURITY DEFINER and read it as the owner.
--
-- THE LIST IS DELIBERATE, AND THAT HAS A COST: a column added to photographs
-- from now on is invisible to anon and authenticated until a migration grants
-- it. supabase/tests/constraints.sql fails if any column other than
-- captured_at is missing from the grant, so the omission cannot ship quietly.
-- =============================================================================

set search_path = public, extensions;

revoke select on table public.photographs from anon, authenticated;

grant select (
  id, slug, owner_id,
  title, description, alt_text, category, location_id,
  status, editors_pick, appreciation_count, comment_count,
  published_at, publish_captured_at, public_captured_at,
  rights_confirmed_at, storage_prefix,
  image_width, image_height, blur_data_url,
  removed_reason, created_at, updated_at
) on table public.photographs to anon, authenticated;
