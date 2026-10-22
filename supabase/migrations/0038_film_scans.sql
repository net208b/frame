-- =============================================================================
-- FRAME — 0038  Film, said in full
-- =============================================================================
-- 0021 let a scanned negative in: a file with no camera record is admitted to
-- review when the member says it is film, and a person looks. That is still
-- the rule. What it left the person with was one tick-box and the absence of a
-- record — no more for a genuine scan than for a phone picture with its EXIF
-- stripped and the box ticked. This gives the review, and the public page,
-- what a real film photograph can say and a disguised phone picture cannot say
-- without inventing it:
--
--   * THE SCANNER. Scanners and lab minilabs write their own make and model
--     into the file (EPSON, NORITSU KOKI, Plustek, a Nikon Coolscan). The gate
--     (lib/images/exif-gate.ts) now classifies such a file as a `scanner`
--     rather than `unknown`, and the verdict row records it, so a declared
--     film scan that arrived from a scanner is visibly different from one that
--     arrived from nowhere.
--   * THE FILM. Which stock, which camera, which scanner — three short texts
--     the member writes, kept on photograph_metadata beside the camera and
--     lens texts they already write, shown on the photograph's page the way
--     aperture and ISO are shown for a digital frame. A film photographer
--     fills them in without thinking; a disguise has to invent all three, in
--     public, where other film photographers can read them.
--   * THE REPORT. "Not from film or a camera" joins the reasons a member can
--     report under, so the people who can tell a scan from a phone filter —
--     other film photographers — have a way to say so.
--
-- None of this proves anything, and nothing here claims it does. EXIF is
-- written by whatever touched the file last; a scanner's make can be forged
-- like a camera's. What changes is what a person has to read, and what a
-- disguise has to fabricate.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- The member's film statements
-- -----------------------------------------------------------------------------
alter table public.photograph_metadata
  add column if not exists film_stock   text
    constraint photograph_metadata_film_stock_length   check (char_length(film_stock)   <= 80),
  add column if not exists film_camera  text
    constraint photograph_metadata_film_camera_length  check (char_length(film_camera)  <= 80),
  add column if not exists film_scanner text
    constraint photograph_metadata_film_scanner_length check (char_length(film_scanner) <= 80);

comment on column public.photograph_metadata.film_stock is
  'The film the member says the frame was made on (Portra 400, HP5 Plus). Their statement, shown on the page; never inferred from the file.';
comment on column public.photograph_metadata.film_camera is
  'The film camera, in the member''s words. Kept apart from camera_model_text because a scan carries the scanner''s make in EXIF, not the camera''s.';
comment on column public.photograph_metadata.film_scanner is
  'How the negative was digitised (Epson V850, lab Noritsu). Their statement; the scanner the file itself names is on photograph_exif_checks.';

-- Public, like the other texts a member writes about their gear. 0015 made
-- the table's select grant a deliberate column list, so new columns are
-- unreadable until named here.
grant select (film_stock, film_camera, film_scanner)
  on table public.photograph_metadata to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The scanner, as the file names it
-- -----------------------------------------------------------------------------
alter table public.photograph_exif_checks
  drop constraint if exists photograph_exif_checks_device_allowed,
  add constraint photograph_exif_checks_device_allowed
    check (device_class in ('camera', 'phone', 'scanner', 'unknown'));

comment on constraint photograph_exif_checks_device_allowed on public.photograph_exif_checks is
  'camera: a body wrote the record. phone: refused whatever was ticked. scanner: a scanner or minilab wrote the record, which a scan from film would carry. unknown: no make or model at all.';

-- -----------------------------------------------------------------------------
-- A reason to report
-- -----------------------------------------------------------------------------
alter table public.reports
  drop constraint if exists reports_reason_allowed,
  add constraint reports_reason_allowed
    check (reason in ('copyright', 'not-my-photograph', 'wrong-location',
                      'privacy', 'inappropriate', 'spam', 'duplicate',
                      'not-film-or-camera', 'other'));
