-- -----------------------------------------------------------------------------
-- 0044 — what the photographer was doing, in their own words
-- -----------------------------------------------------------------------------
-- The capture block on a photograph's page says what the camera was set to and
-- 0041's provenance line says whether the file carried those numbers. Neither
-- says why. The brief calls this the "Photography Breakdown": the one thing the
-- photographer knows that no file can hold — what they were trying for, what
-- they were waiting for, why f/8 and not f/2.
--
-- NOT editing_notes, which 0003 already has. That column is about what happened
-- AFTER the shutter: the crop, the curves, what was dodged. This is about
-- before it. Keeping them apart is the same separation the page already makes
-- between the capture block and the editing block, and collapsing them would
-- have made "I waited twenty minutes for the cyclist" and "cropped to 4:5" the
-- same kind of statement.
--
-- WHAT IT MUST NOT BECOME. §7.3's rule is that EXIF alone does not explain why
-- a photograph is good, and this field is the other half of that sentence — not
-- a proof of quality. It is presented beside the numbers, never as a caption
-- underneath the frame, and nothing reads it except the page it is written for:
-- no ranking input, no search index, no editorial signal.

alter table public.photograph_metadata
  add column if not exists explanation text;

comment on column public.photograph_metadata.explanation is
  'The photographer''s own account of what they were doing — before the shutter, where editing_notes is after it. Shown beside the capture numbers, never as proof that the photograph is good (§7.3).';

-- 1200 characters, the same room 0002 gives a biography: enough for a paragraph
-- or two about one frame, and not enough to invite an essay the page has no
-- shape for. The capture block is read beside the photograph, not instead of it.
alter table public.photograph_metadata
  drop constraint if exists photograph_metadata_explanation_length,
  add constraint photograph_metadata_explanation_length
    check (explanation is null or char_length(explanation) <= 1200);

-- -----------------------------------------------------------------------------
-- Who may read it
-- -----------------------------------------------------------------------------
-- Everyone, which is the point — it is written to be read. 0015 revoked the
-- blanket SELECT on this table and grants one column at a time, so a new column
-- is invisible until it is named. Restated whole, because a grant list is
-- replaced whole and a column left out here would silently stop being readable;
-- the assertions in supabase/tests/constraints.sql check the whole list for
-- exactly that reason.
--
-- The private position columns stay absent, as they have since 0015:
-- exif_gps_latitude, exif_gps_longitude and exif_gps_consent are reachable only
-- through photograph_exif_positions(), for the owner and a moderator.
grant select (
  photograph_id,
  camera_brand_id, camera_model_id, lens_brand_id, lens_model_id,
  camera_brand_text, camera_model_text, lens_brand_text, lens_model_text,
  focal_length_mm, aperture, shutter_speed, iso,
  editing_software, editing_notes,
  film_stock, film_camera, film_scanner,
  explanation,
  exif_source,
  created_at, updated_at
) on table public.photograph_metadata to anon, authenticated;
