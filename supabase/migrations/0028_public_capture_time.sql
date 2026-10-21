-- =============================================================================
-- FRAME — 0028  A capture time that is only there when it was published
-- =============================================================================
-- The first of two steps; 0029 is the second.
--
-- A member chooses whether their photograph's capture time is published
-- (`publish_captured_at`, set at upload). That choice was honoured only by the
-- application, which read `captured_at` and dropped it when the flag was off.
-- The column itself was readable by anybody holding the publishable key, so
-- the choice protected nothing from a caller who simply asked for it — and a
-- capture time is information about where somebody was and when, which is
-- why the choice exists.
--
-- `public_captured_at` is the capture time when the owner chose to publish it
-- and null when they did not, computed by the database on every write. It is
-- the column every public read uses from now on; 0029 then takes the raw
-- column away from the public roles.
--
-- Additive on purpose: applied on its own it changes nothing for code that
-- still reads `captured_at`, so it can go in before the application that
-- reads the new column is deployed, and 0029 after.
-- =============================================================================

set search_path = public, extensions;

alter table public.photographs
  add column if not exists public_captured_at timestamptz
    generated always as (case when publish_captured_at then captured_at end) stored;

comment on column public.photographs.public_captured_at is
  'captured_at when the owner chose to publish it, null otherwise. The only capture time the public roles can read.';

grant select (public_captured_at) on table public.photographs to anon, authenticated;
