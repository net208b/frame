-- -----------------------------------------------------------------------------
-- 0046 — a featured photographer, chosen by an editor and labelled as such
-- -----------------------------------------------------------------------------
-- /community has a band of photographers ranked by the appreciation their work
-- has drawn, and that band is the honest consequence of §7.4's rule that likes
-- do not decide value: a number, described as a number. What was missing was
-- the other half — somebody choosing, and saying why.
--
-- This mirrors `editors_pick` on a photograph (0030): a staff-only flag, a note
-- in the editor's words, the moment it was set, and a label that says plainly
-- it is an editorial choice. "Always labelled, never paid for" is the promise
-- /community already makes about picks, and it is the same promise here.
--
-- The appreciation band is renamed in the same change — in the messages, in the
-- repository and on the page — so one word means one thing. Two bands both
-- called "featured", one of them a leaderboard, would have made the label
-- worthless exactly where it has to be trusted.
--
-- =============================================================================
-- THE SECURITY HALF, WHICH IS THE POINT OF THIS MIGRATION
-- =============================================================================
-- Live policies on `profiles`:
--   profiles_update_own        UPDATE  id = auth.uid()
--   profiles_update_moderator  UPDATE  is_moderator()
-- so a member may write their own row and a moderator may write anybody's, and
-- `profiles_guard_privileged_columns` is the only thing that says which columns
-- are not theirs to write — by a HARD-CODED LIST. Three new columns on
-- `profiles` are therefore, by default, columns a member can set on themselves.
-- A member could have marked themselves featured.
--
-- So the guard is rebuilt here to refuse them, for every session, a moderator's
-- included: the only route is set_featured_photographer(), which checks the
-- role itself.
--
-- It is rebuilt from the definition read off PRODUCTION, not from a migration
-- file. 0006, 0010 and 0011 each define this function, 0011 is the one in
-- force, and rebuilding from an older copy would have silently dropped the
-- `frame.profile_write` escape that change_username() and delete_own_account()
-- both depend on, and with it the one username change a member is allowed.
-- Every existing rule below is the live one, unchanged.

-- -----------------------------------------------------------------------------
-- profiles: the three columns
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists editorial_feature boolean not null default false,
  add column if not exists feature_note      text,
  add column if not exists featured_at       timestamptz;

comment on column public.profiles.editorial_feature is
  'An editor chose to feature this photographer. Refused for every session by profiles_guard_privileged_columns (0046); set only by set_featured_photographer(). Never a consequence of appreciation — see §7.4.';
comment on column public.profiles.feature_note is
  'Why, in the editor''s words, and shown with the feature. An editorial choice that does not say why is indistinguishable from a ranking.';
comment on column public.profiles.featured_at is
  'When the choice was made. Orders the band, so the most recent choice leads.';

alter table public.profiles
  drop constraint if exists profiles_feature_note_length,
  add constraint profiles_feature_note_length
    check (feature_note is null or char_length(feature_note) <= 400);

-- A feature is a flag, a reason and a moment together, or it is nothing. A row
-- marked featured with no date could not be ordered; a note left behind after
-- unfeaturing would be an editor's words about nothing.
alter table public.profiles
  drop constraint if exists profiles_feature_is_whole,
  add constraint profiles_feature_is_whole
    check (
      (editorial_feature
         and featured_at is not null
         and char_length(btrim(coalesce(feature_note, ''))) > 0)
      or (not editorial_feature and featured_at is null and feature_note is null)
    );

-- -----------------------------------------------------------------------------
-- The guard — the live definition, with the three columns refused
-- -----------------------------------------------------------------------------
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- No JWT means the service role or a direct SQL session: someone holding the
  -- keys. Migrations and support fixes run there, and are not second-guessed.
  if v_actor is null then
    return new;
  end if;

  -- change_username(), delete_own_account() and now
  -- set_featured_photographer() have each done their own authorisation and are
  -- the only routes by which a request may change a guarded column. Each
  -- switches this on around its own statement and off again straight after; a
  -- client cannot set it, because PostgREST exposes no way to run SET.
  if current_setting('frame.profile_write', true) = 'privileged' then
    return new;
  end if;

  -- Ignored rather than refused, the way set_updated_at ignores a
  -- client-supplied updated_at: these are not a member's to set, and a form
  -- that posts them back unchanged should not fail.
  new.id = old.id;
  new.created_at = old.created_at;
  new.member_since = old.member_since;
  new.username_changed_at = old.username_changed_at;

  if new.role is distinct from old.role
     and not (public.current_profile_role() = 'admin' and v_actor <> old.id) then
    raise exception 'Only an administrator may change another member''s role.'
      using errcode = '42501';
  end if;

  if (new.is_suspended is distinct from old.is_suspended
      or new.suspended_reason is distinct from old.suspended_reason)
     and not public.is_moderator() then
    raise exception 'Only a moderator may suspend or reinstate an account.'
      using errcode = '42501';
  end if;

  if new.username is distinct from old.username then
    raise exception 'A username cannot be edited directly. An account whose username was chosen for it can change it once, from Settings.'
      using errcode = '42501';
  end if;

  -- NEW in 0046, and refused for EVERY session, a moderator's own included.
  -- set_featured_photographer() checks the role and writes the three columns
  -- together through the escape above; nothing else may touch them. Without
  -- this, profiles_update_own would have let a member feature themselves.
  if new.editorial_feature is distinct from old.editorial_feature
     or new.feature_note is distinct from old.feature_note
     or new.featured_at is distinct from old.featured_at then
    raise exception 'A featured photographer is chosen by an editor, not written onto a profile.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- set_featured_photographer — the only route
-- -----------------------------------------------------------------------------
-- The shape of set_editors_pick() (0030): editors only, the whole decision
-- written in one statement, the photographer told once, and the decision
-- recorded in the moderation trail so an editorial choice is as accountable as
-- a removal.
create or replace function public.set_featured_photographer(
  p_profile_id uuid,
  p_featured   boolean,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_profile public.profiles;
  v_note    text := btrim(coalesce(p_note, ''));
begin
  if v_actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only a FRAME editor features a photographer.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles p where p.id = p_profile_id for update;
  if not found then
    raise exception 'No such photographer.' using errcode = 'P0002';
  end if;

  if p_featured then
    -- The note is not optional. The whole difference between this band and the
    -- appreciation band is that somebody says why.
    if v_note = '' then
      raise exception 'Say why this photographer is featured.' using errcode = '22023';
    end if;
    -- A suspended account is hidden everywhere by profiles_select_visible, so
    -- featuring one would publish a band pointing at a page nobody can open.
    if v_profile.is_suspended then
      raise exception 'A suspended account cannot be featured.' using errcode = '42501';
    end if;
  end if;

  -- Already so, with the same words: nothing changes, and nobody is told
  -- twice. Re-featuring with a NEW note is a real change and does move
  -- featured_at, because the band is ordered by it.
  if v_profile.editorial_feature = p_featured
     and coalesce(v_profile.feature_note, '') = (case when p_featured then v_note else '' end) then
    return;
  end if;

  -- Switched on for this one statement and off again, for the reason
  -- change_username() gives: a local setting otherwise lasts to the end of the
  -- transaction and anything running after it would inherit the exemption.
  perform set_config('frame.profile_write', 'privileged', true);

  update public.profiles
     set editorial_feature = p_featured,
         feature_note      = case when p_featured then v_note else null end,
         featured_at       = case when p_featured then now() else null end
   where id = p_profile_id;

  perform set_config('frame.profile_write', '', true);

  insert into public.moderation_actions (moderator_id, subject_type, subject_id, decision, reason)
  values (
    v_actor,
    'profile',
    p_profile_id,
    case when p_featured then 'feature' else 'unfeature' end,
    case when p_featured then v_note else 'No longer featured.' end
  );

  -- Told once, on being featured, and not on being unfeatured: a quiet removal
  -- is kinder than a notification about one, and the editor's note is the
  -- message either way.
  if p_featured then
    perform public.record_notification(
      p_profile_id,
      'featured',
      v_actor,
      'profile',
      p_profile_id,
      v_profile.display_name,
      v_profile.username::text
    );
  end if;
end;
$$;

comment on function public.set_featured_photographer(uuid, boolean, text) is
  'Features or unfeatures a photographer. Editors only; writes the flag, the note and the moment in one statement, records the decision in moderation_actions and tells the photographer once.';

-- Supabase grants EXECUTE on a new public function to anon and authenticated by
-- default, so anon is revoked BY NAME. 0042 was written without this and the
-- grant-shape assertion passed locally while production disagreed.
revoke all on function public.set_featured_photographer(uuid, boolean, text) from public;
revoke all on function public.set_featured_photographer(uuid, boolean, text) from anon;
grant execute on function public.set_featured_photographer(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- The moderation trail has to accept the two new words
-- -----------------------------------------------------------------------------
-- RESTATED FROM THE LIVE CONSTRAINT, read with pg_get_constraintdef before this
-- was written, because a CHECK is replaced whole and a value left out here
-- would make an existing moderation route start failing. The nine values below
-- are exactly the ones in force; 'feature' and 'unfeature' are the only
-- additions.
--
-- moderation_actions_negative_decision_needs_reason already demands a reason
-- for any decision outside ('approve', 'dismiss'), which both new words are —
-- and both carry one.
alter table public.moderation_actions
  drop constraint if exists moderation_actions_decision_allowed,
  add constraint moderation_actions_decision_allowed
    check (decision = any (array[
      'approve', 'reject', 'request_changes', 'remove_content',
      'suspend_account', 'dismiss', 'change_role', 'delete', 'merge',
      'feature', 'unfeature'
    ]::text[]));

-- `notifications` needs no change: kind 'featured' and subject_type 'profile'
-- are both already allowed, and together they are exactly this — a person,
-- featured. The existing 'featured' notification is a photograph appearing in
-- an editorial feature, which carries subject_type 'feature', so the two are
-- told apart by their subject and not by overloading one sentence.

-- -----------------------------------------------------------------------------
-- Who may read it
-- -----------------------------------------------------------------------------
-- Everyone: the band is public, and so is the reason for it. `profiles` carries
-- column-level SELECT grants (26 columns as of this migration), so a new column
-- is invisible until it is named.
--
-- ADDITIVE, naming three columns. Not the whole list restated: column grants
-- are additive, so naming one cannot disturb another, while restating a list
-- replaces it. 0045 covers why that matters.
grant select (editorial_feature, feature_note, featured_at)
  on table public.profiles to anon, authenticated;
