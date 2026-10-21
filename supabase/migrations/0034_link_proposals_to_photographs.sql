-- =============================================================================
-- FRAME — 0034  A proposed place remembers the photograph that proposed it
-- =============================================================================
-- The upload wizard has always promised that a photograph published with a
-- proposed place would be credited to that place once a moderator approved
-- it. It never was: the proposal carried no reference to the photograph, so
-- approval created the place and had nothing to attach it to. The place went
-- on the map as a bare dot with no frames, and the photograph stayed without
-- a location.
--
--   * location_submissions.photograph_id — the frame a proposal came with.
--     Only the proposer's own photograph; refused otherwise.
--   * approve_location_submission() attaches that photograph to the place it
--     just created, if the photograph is still around and has no place yet.
--   * photographs.location_id may only point at an APPROVED place, whoever
--     sets it: the member choosing a place for their own frame later, or the
--     approval above. The wizard already refused the rest; now the database
--     does.
-- =============================================================================

set search_path = public, extensions;

alter table public.location_submissions
  add column if not exists photograph_id uuid references public.photographs (id) on delete set null;

create index if not exists location_submissions_photograph_idx
  on public.location_submissions (photograph_id) where photograph_id is not null;

-- A proposal may carry only the proposer's own photograph.
create or replace function public.location_submissions_photograph_is_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photograph_id is not null and not exists (
    select 1 from public.photographs p
     where p.id = new.photograph_id and p.owner_id = new.submitted_by
  ) then
    raise exception 'A proposal can only come with your own photograph.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists location_submissions_photograph_is_own on public.location_submissions;
create trigger location_submissions_photograph_is_own
  before insert or update of photograph_id on public.location_submissions
  for each row execute function public.location_submissions_photograph_is_own();

-- A photograph's place is an approved one or none.
create or replace function public.photographs_location_is_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is not null and not exists (
    select 1 from public.locations l where l.id = new.location_id and l.status = 'approved'
  ) then
    raise exception 'A photograph can only be placed at an approved location.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists photographs_location_is_approved on public.photographs;
create trigger photographs_location_is_approved
  before insert or update of location_id on public.photographs
  for each row execute function public.photographs_location_is_approved();

revoke all on function public.location_submissions_photograph_is_own() from public, anon, authenticated;
revoke all on function public.photographs_location_is_approved() from public, anon, authenticated;

-- approve_location_submission, as 0024 left it, plus the attachment at the end.
create or replace function public.approve_location_submission(
  p_submission_id uuid,
  p_moderator uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.location_submissions;
  v_role       text;
  v_actor      uuid := (select auth.uid());
  v_slug       text;
  v_candidate  text;
  v_attempt    integer := 0;
  v_location   uuid;
begin
  if p_moderator is null then
    raise exception 'A moderator id is required to approve a submission.' using errcode = '22023';
  end if;
  if v_actor is null then
    raise exception 'You need to be signed in to approve a location submission.'
      using errcode = '42501';
  end if;
  if v_actor <> p_moderator then
    raise exception 'A moderator may only record a decision under their own account.'
      using errcode = '42501';
  end if;

  select p.role into v_role
    from public.profiles p
   where p.id = p_moderator and p.is_suspended = false;
  if v_role is null or v_role not in ('moderator', 'admin') then
    raise exception 'Only a moderator may approve a location submission.' using errcode = '42501';
  end if;

  select * into v_submission
    from public.location_submissions s
   where s.id = p_submission_id
     for update;
  if not found then
    raise exception 'That location submission no longer exists.' using errcode = 'P0002';
  end if;

  if v_submission.status = 'approved' and v_submission.approved_location_id is not null then
    return v_submission.approved_location_id;
  end if;

  v_slug := public.frame_slugify(v_submission.proposed_name || ' ' || v_submission.city);
  if length(v_slug) = 0 then
    v_slug := 'location';
  end if;
  v_candidate := v_slug;

  while v_attempt < 20
        and exists (select 1 from public.locations l where l.slug = v_candidate) loop
    v_attempt := v_attempt + 1;
    v_candidate := left(v_slug, 60) || '-' || v_attempt::text;
  end loop;

  if exists (select 1 from public.locations l where l.slug = v_candidate) then
    v_candidate := left(v_slug, 50) || '-' || substr(replace(p_submission_id::text, '-', ''), 1, 12);
  end if;

  insert into public.locations (
    slug, name, city, country, country_code,
    latitude, longitude, status, submitted_by, approved_at, approved_by
  )
  values (
    v_candidate, v_submission.proposed_name, v_submission.city, v_submission.country,
    upper(v_submission.country_code::text),
    v_submission.latitude, v_submission.longitude, 'approved', v_submission.submitted_by,
    now(), p_moderator
  )
  returning id into v_location;

  update public.location_submissions s
     set status               = 'approved',
         approved_location_id = v_location,
         rejection_reason     = null,
         resolved_at          = now(),
         resolved_by          = p_moderator
   where s.id = p_submission_id;

  insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
  values ('approve', 'location_submission', p_submission_id, null, p_moderator);

  -- The frame that proposed the place is credited to it: the promise the
  -- upload wizard makes. Only if it is still here and has not since been
  -- placed somewhere else by its owner.
  if v_submission.photograph_id is not null then
    update public.photographs p
       set location_id = v_location
     where p.id = v_submission.photograph_id
       and p.location_id is null
       and p.status <> 'removed';
  end if;

  return v_location;
end;
$$;
