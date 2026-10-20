-- =============================================================================
-- 0015 — a camera's raw position is private, even on a published photograph
-- =============================================================================
-- photograph_metadata.exif_gps_latitude and exif_gps_longitude hold the exact
-- position the camera recorded, stored only when the member ticks "share it
-- with moderators". FRAME's location policy publishes a rounded point, and only
-- for a place a moderator has approved. But 0007 made a published photograph's
-- whole metadata row readable by anyone, and the table-level SELECT grant to
-- anon covered every column — so the raw coordinates were one REST query away
-- for every visitor. The comment in 0007 named the fix as a follow-up; this is
-- it.
--
-- SELECT is now granted column by column, without the three position columns.
-- A column added to this table later is therefore private until someone grants
-- it, which is the right default for a table that already holds a position.
--
-- The owner and moderators still need the position: the owner because it is
-- theirs, a moderator to compare it with the place the member chose (the review
-- queue's "EXIF disagrees with the place" signal). photograph_exif_positions()
-- returns it to exactly those two, for a batch of photographs at once.
--
-- The service role keeps its full grant, and INSERT and UPDATE are untouched,
-- so the upload form still writes the position.

revoke select on table public.photograph_metadata from anon, authenticated;

grant select (
  photograph_id,
  camera_brand_id, camera_model_id, lens_brand_id, lens_model_id,
  camera_brand_text, camera_model_text, lens_brand_text, lens_model_text,
  focal_length_mm, aperture, shutter_speed, iso,
  editing_software, editing_notes,
  exif_source,
  created_at, updated_at
) on table public.photograph_metadata to anon, authenticated;

create or replace function public.photograph_exif_positions(p_photograph_ids uuid[])
returns table (photograph_id uuid, latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select m.photograph_id, m.exif_gps_latitude, m.exif_gps_longitude
    from public.photograph_metadata m
   where m.photograph_id = any (p_photograph_ids)
     and m.exif_gps_consent
     and m.exif_gps_latitude is not null
     and m.exif_gps_longitude is not null
     and (public.owns_photograph(m.photograph_id) or public.is_moderator())
$$;

comment on function public.photograph_exif_positions(uuid[]) is
  'The raw camera position of each photograph, for its owner or a moderator only. Everyone else gets no rows.';

revoke all on function public.photograph_exif_positions(uuid[]) from public;
grant execute on function public.photograph_exif_positions(uuid[]) to authenticated, service_role;
