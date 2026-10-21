-- =============================================================================
-- FRAME — 0021  The camera-only rule: a photograph needs a camera's EXIF
-- =============================================================================
-- FRAME publishes photographs that carry a camera's own record of how they were
-- made — make and model, aperture, shutter, ISO, focal length, the moment —
-- and refuses files from phones. The server reads the file that actually
-- arrived (lib/images/exif-gate.ts holds the policy) and writes its verdict
-- here with the service role; the trigger below is what makes that verdict a
-- rule rather than a courtesy.
--
-- WHAT THE DATABASE GUARANTEES
--
--   * A photograph cannot be sent to review without a recorded verdict of
--     `camera`. The member's publish step is the one transition this guards;
--     a moderator's later publish, and fixtures written straight in, are not
--     its business.
--   * Members cannot write a verdict. No INSERT, UPDATE or DELETE policy and no
--     grant: only the service role, from the server, after reading the bytes.
--   * Moderators can read it, with every field the file carried — serials
--     included — so a forged block is at least a forged block somebody can see.
--     Members do not: they were told the verdict at upload, in a sentence.
--
-- NO COORDINATES ARE KEPT HERE. The file's GPS, if any, is noted as a yes/no
-- only. The position itself is handled by the photograph's own metadata under
-- the location policy, and nothing about this record changes that.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.photograph_exif_checks (
  photograph_id    uuid primary key references public.photographs (id) on delete cascade,
  verdict          text not null
                     constraint photograph_exif_checks_verdict_allowed check (verdict in ('camera', 'rejected')),
  device_class     text not null
                     constraint photograph_exif_checks_device_allowed check (device_class in ('camera', 'phone', 'unknown')),
  -- The required fields that were absent, in policy order; empty on a pass.
  missing          text[] not null default '{}',
  -- What the file said, verbatim after normalisation. Nullable throughout: a
  -- record of absence is the point for a refused file.
  make             text,
  model            text,
  lens_make        text,
  lens_model       text,
  body_serial      text,
  lens_serial      text,
  focal_length_mm  numeric(7, 2),
  aperture         numeric(5, 2),
  shutter_speed    text,
  iso              integer,
  metering_mode    text,
  flash            text,
  software         text,
  captured_at      timestamptz,
  has_gps          boolean not null default false,
  checked_at       timestamptz not null default now()
);

comment on table public.photograph_exif_checks is
  'The server''s verdict on a photograph''s EXIF under the camera-only rule, written with the service role. Read by moderators; required by photographs_require_camera_exif.';

-- -----------------------------------------------------------------------------
-- photographs_require_camera_exif
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER, because the trigger runs as the member sending the
-- photograph to review, and that member is not allowed to read the verdict
-- table. Without it the row would be invisible to the very check that needs
-- it, and every member would be refused. The function reads one row by key
-- and writes nothing; search_path is pinned.
create or replace function public.photographs_require_camera_exif()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'under_review' and old.status is distinct from 'under_review'
     and not exists (
       select 1 from public.photograph_exif_checks c
        where c.photograph_id = new.id and c.verdict = 'camera'
     ) then
    raise exception 'FRAME publishes photographs from cameras only: this file has no camera record on file.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.photographs_require_camera_exif() is
  'Refuses sending a photograph to review unless the server has recorded a camera verdict for it.';

drop trigger if exists photographs_require_camera_exif on public.photographs;
create trigger photographs_require_camera_exif
  before update of status on public.photographs
  for each row execute function public.photographs_require_camera_exif();

-- -----------------------------------------------------------------------------
-- Privileges and row-level security — the content-check pattern (0013)
-- -----------------------------------------------------------------------------
alter table public.photograph_exif_checks enable row level security;

grant select on table public.photograph_exif_checks to authenticated;

drop policy if exists photograph_exif_checks_select_moderator on public.photograph_exif_checks;
create policy photograph_exif_checks_select_moderator
  on public.photograph_exif_checks for select
  to authenticated
  using (public.is_moderator());
