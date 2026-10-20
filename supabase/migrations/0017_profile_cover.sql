-- =============================================================================
-- FRAME — 0017  A profile's cover is one of the member's own photographs
-- =============================================================================
-- Profiles had no cover image, and the obvious way to add one — upload a banner
-- — is not the right one here. It would mean a second image pipeline (storage
-- keys, derivatives, a moderation path) for a picture that is not a photograph
-- in the sense this site is about, on a site that cannot yet upload an avatar.
--
-- So a cover is a *reference to one of the member's own published photographs*.
-- The file, its derivatives, its alt text, its licence and its approval already
-- exist; this column only says which one stands at the top of the page. On a
-- photography site that is also the better answer: your cover is one of your
-- pictures.
--
-- WHAT THIS GUARANTEES, and where.
--
--   * The reference cannot be somebody else's photograph, and cannot be an
--     unpublished one. The trigger below refuses both — not the application,
--     because a member can write their own profile row directly with the
--     public key.
--   * A photograph that is *later* unpublished or put under review leaves the
--     column pointing at it. That is deliberate: taking a frame down for a day
--     should not silently forget the member's choice. The repository joins on
--     `status = 'published'` as well, so the cover simply stops being shown
--     until the photograph is back. Both halves are needed, and neither is
--     sufficient.
--   * Deleting the photograph clears the column (`on delete set null`), so a
--     profile never points at a row that is gone.
-- =============================================================================

set search_path = public, extensions;

alter table public.profiles
  add column if not exists cover_photograph_id uuid
    references public.photographs (id) on delete set null;

comment on column public.profiles.cover_photograph_id is
  'One of the member''s own published photographs, shown across the top of their profile. Checked by profiles_cover_must_be_own_published; the repository also requires status = published when it reads it.';

-- -----------------------------------------------------------------------------
-- profiles_cover_must_be_own_published
-- -----------------------------------------------------------------------------
-- A CHECK constraint cannot look at another table, so this is a trigger. It
-- runs only when the column actually changes, which keeps every other profile
-- edit — a biography, a gear list — exactly as cheap as it was.
--
-- Not folded into profiles_guard_privileged_columns (0006, 0011): that function
-- answers "may this member write this column at all", and the answer here is
-- yes. This one answers "is this value true", which is a different question and
-- belongs in its own trigger with its own name in the error.
create or replace function public.profiles_cover_must_be_own_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cover_photograph_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.cover_photograph_id is not distinct from old.cover_photograph_id then
    return new;
  end if;

  if not exists (
    select 1
      from public.photographs p
     where p.id = new.cover_photograph_id
       and p.owner_id = new.id
       and p.status = 'published'
  ) then
    raise exception 'A profile cover must be one of your own published photographs.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_cover_must_be_own_published() is
  'Refuses a cover that is not the profile owner''s own published photograph. A CHECK cannot query another table, so this is where that rule lives.';

drop trigger if exists profiles_cover_must_be_own_published on public.profiles;
create trigger profiles_cover_must_be_own_published
  before insert or update of cover_photograph_id on public.profiles
  for each row
  execute function public.profiles_cover_must_be_own_published();

-- The profile page reads the cover by id for one member at a time, and the
-- photograph is found by primary key — no index needed for that direction. This
-- one is for the other direction: `on delete set null` has to find the profiles
-- pointing at a photograph when it is deleted, and without an index that is a
-- sequential scan of profiles on every photograph deletion.
create index if not exists profiles_cover_photograph_id_idx
  on public.profiles (cover_photograph_id)
  where cover_photograph_id is not null;

-- -----------------------------------------------------------------------------
-- delete_own_account — the cover goes with the member's other choices
-- -----------------------------------------------------------------------------
-- An account kept because it authored moderation decisions is stripped to the
-- username the audit trail names. Its photographs are deleted a few lines above
-- that update, so the column would be cleared by the foreign key anyway; it is
-- written out with the rest so the function reads as the complete list of what
-- is removed. Unchanged from 0016 in every other respect.
create or replace function public.delete_own_account(p_confirm_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_username text;
begin
  if v_uid is null then
    raise exception 'You need to be signed in to delete your account.' using errcode = '42501';
  end if;

  select p.username::text into v_username
    from public.profiles p
   where p.id = v_uid
     for update;

  if v_username is null then
    raise exception 'There is no account to delete.' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(p_confirm_username, ''))) <> v_username then
    raise exception 'Type your username exactly to confirm.' using errcode = '22023';
  end if;

  if exists (select 1 from public.moderation_actions m where m.moderator_id = v_uid) then
    perform set_config('frame.profile_write', 'privileged', true);

    delete from public.photographs              where owner_id = v_uid;
    delete from public.collections              where owner_id = v_uid;
    delete from public.photograph_appreciations where profile_id = v_uid;
    delete from public.location_submissions     where submitted_by = v_uid;

    update public.profiles
       set display_name          = username::text,
           avatar_url            = null,
           biography             = null,
           website               = null,
           based_in              = null,
           usual_gear            = '{}',
           country_code          = null,
           style_tags            = '{}',
           collaboration_status  = null,
           critique_preference   = null,
           social_links          = '{}',
           cover_photograph_id   = null,   -- NEW in 0017
           role                  = 'member',
           is_suspended          = true,
           suspended_reason      = 'Closed at the member''s request. Kept only because moderation decisions name this account.'
     where id = v_uid;

    perform set_config('frame.profile_write', '', true);

    -- A concrete far-future date, not 'infinity': the identity service reads
    -- this column into a Go time value, and an infinite timestamp would break
    -- every listing of users, not just this one.
    update auth.users set banned_until = '2999-12-31 00:00:00+00' where id = v_uid;
    delete from auth.sessions where user_id = v_uid;

    return 'retained';
  end if;

  delete from auth.users where id = v_uid;
  return 'deleted';
end;
$$;

comment on function public.delete_own_account(text) is
  'Deletes the caller''s account, or — where it authored moderation decisions — strips, demotes, suspends and bars it. Requires the username typed as confirmation.';

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
