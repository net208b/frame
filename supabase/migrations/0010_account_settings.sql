-- =============================================================================
-- FRAME — 0010  Account settings: profile edits, one username change, deletion
-- =============================================================================
-- The privacy notice told members they could edit their profile and delete
-- their account themselves. Neither existed. This migration is the database
-- half of making that true, and it closes a hole found on the way.
--
-- THE HOLE. profiles_update_own (0007) lets a member write their own row, and
-- profiles_guard_privileged_columns (0006) stopped them changing their role or
-- suspension — but not their username. Any signed-in member could rename
-- themselves at will with one request using the public key, including to a
-- reserved name such as "admin" or "support", which is exactly the
-- impersonation the reserved list exists to prevent. The Join form's promise
-- that a username "cannot be changed" was enforced by the absence of a form,
-- not by the database. The guard now refuses a direct username change.
--
-- What this adds:
--
--   is_reserved_username()      the reserved list, callable from SQL
--   username_changed_at         when an account used its one change
--   change_username()           the only route by which a username changes
--   delete_own_account()        deletion, exactly as the privacy notice states
--   check constraints           on the free-text profile fields a member edits
--
-- Two functions here write columns the guard protects. They are allowed through
-- by a transaction-local setting that only they set (see the guard). That is
-- narrower than letting every function owned by the table's owner through: the
-- exemption exists where it is written down, and nowhere else.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- is_reserved_username
-- -----------------------------------------------------------------------------
-- Keep in step with RESERVED_USERNAMES in src/lib/validation/auth.ts and with
-- c_reserved in handle_new_user() (0009). scripts/assert-reserved-usernames.mjs
-- fails CI if any of the three differ.
create or replace function public.is_reserved_username(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_name, ''))) = any (array[
    'api', 'auth', 'admin', 'collections', 'community', 'discover', 'join',
    'legal', 'locations', 'login', 'map', 'moderation', 'photographers',
    'photographs', 'search', 'upload',
    'frame', 'help', 'me', 'moderator', 'settings', 'staff', 'support'
  ]);
$$;

comment on function public.is_reserved_username(text) is
  'True for a username no member may hold: a route segment, or a name implying authority. Kept in step with RESERVED_USERNAMES.';

-- -----------------------------------------------------------------------------
-- profiles: the record of a username change, and limits on member-written text
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username_changed_at timestamptz;

comment on column public.profiles.username_changed_at is
  'Set by change_username() when an account whose username was chosen for it — one made through a sign-in provider — uses its single change. Null otherwise.';

-- The form enforces these too, but a member can write their own row directly
-- with the public key, so the form is not where a limit lives. The website rule
-- matters most: the value ends up in an href, and `javascript:` is script.
-- ProfileHeader already refuses to link anything but http(s); this stops it
-- being stored in the first place.
create or replace function public.text_items_within(p_items text[], p_max_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(btrim(item)) between 1 and p_max_length), true)
  from unnest(p_items) as item;
$$;

alter table public.profiles
  drop constraint if exists profiles_website_http,
  add constraint profiles_website_http
    check (website is null
           or (website ~* '^https?://[^[:space:]]+$' and char_length(website) <= 200)),
  drop constraint if exists profiles_based_in_length,
  add constraint profiles_based_in_length
    check (based_in is null or char_length(btrim(based_in)) between 1 and 80),
  drop constraint if exists profiles_usual_gear_bounds,
  add constraint profiles_usual_gear_bounds
    check (cardinality(usual_gear) <= 12 and public.text_items_within(usual_gear, 60));

-- -----------------------------------------------------------------------------
-- profiles_guard_privileged_columns — now also guards the username
-- -----------------------------------------------------------------------------
-- Unchanged from 0006 except where marked. The reasoning for a trigger rather
-- than column privileges is written out there and still holds.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- No JWT means the service role or a direct SQL session: someone holding the
  -- keys, doing something deliberate. Migrations and support fixes run here, so
  -- this path is not second-guessed.
  if v_actor is null then
    return new;
  end if;

  -- NEW in 0010. change_username() and delete_own_account() have done their own
  -- authorisation and are the only routes by which a member's request may change
  -- these columns. Each switches this on around its own write and off again
  -- straight after; a client cannot set it, because PostgREST exposes no way to
  -- run SET.
  if current_setting('frame.profile_write', true) = 'privileged' then
    return new;
  end if;

  -- Ignored rather than rejected, the same way set_updated_at ignores a
  -- client-supplied updated_at: these are not a member's to set, and a form
  -- that posts them back unchanged should not fail.
  new.id = old.id;
  new.created_at = old.created_at;
  new.member_since = old.member_since;
  new.username_changed_at = old.username_changed_at;   -- NEW in 0010

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

  -- NEW in 0010. Refused for everyone with a session, moderators included: a
  -- username is a public address, and changing somebody else's is not a
  -- moderation tool this app offers. The service role can still do it.
  if new.username is distinct from old.username then
    raise exception 'A username cannot be edited directly. An account whose username was chosen for it can change it once, from Settings.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- change_username
-- -----------------------------------------------------------------------------
-- An account made through Google, Apple, Facebook or X never chose its
-- username: handle_new_user() picked one. Such an account may replace it once.
-- An account made on the Join form chose its username there and was told it
-- would not change, so it cannot.
--
-- Which kind an account is comes from auth.users.raw_app_meta_data ->>
-- 'provider', the provider the account was created with. That is app metadata,
-- writable only by the identity service, so a member cannot make an email
-- account look like a provider one. raw_user_meta_data, which a member CAN
-- write with updateUser(), is deliberately not consulted.
--
-- Errors carry the SQLSTATE the server action maps to a sentence:
--   42501  not allowed — not signed in, suspended, or no change left
--   22023  not a valid username
--   23514  reserved
--   23505  already taken (raised by the unique constraint itself)
create or replace function public.change_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_provider  text;
  v_current   text;
  v_changed   timestamptz;
  v_suspended boolean;
  v_new       text := lower(btrim(coalesce(p_username, '')));
begin
  if v_uid is null then
    raise exception 'You need to be signed in to change your username.' using errcode = '42501';
  end if;

  select u.raw_app_meta_data ->> 'provider'
    into v_provider
    from auth.users u
   where u.id = v_uid;

  select p.username::text, p.username_changed_at, p.is_suspended
    into v_current, v_changed, v_suspended
    from public.profiles p
   where p.id = v_uid
     for update;

  if v_current is null then
    raise exception 'There is no profile for this account.' using errcode = '42501';
  end if;
  if v_suspended then
    raise exception 'A suspended account cannot change its username.' using errcode = '42501';
  end if;
  if v_provider is null or v_provider = 'email' then
    raise exception 'This username was chosen when the account was made, and it stays.' using errcode = '42501';
  end if;
  if v_changed is not null then
    raise exception 'This account has already used its one username change.' using errcode = '42501';
  end if;

  if v_new !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'A username is 3 to 24 lowercase letters, digits or underscores.' using errcode = '22023';
  end if;
  if public.is_reserved_username(v_new) then
    raise exception 'That username is reserved.' using errcode = '23514';
  end if;

  -- Asking for the name you already have is not a change, and does not use up
  -- the one you are allowed.
  if v_new = v_current then
    return v_current;
  end if;

  -- The exemption is switched on for this one statement and off again. A local
  -- setting otherwise lasts to the end of the transaction, and anything that
  -- ran after this function in the same transaction would inherit it.
  perform set_config('frame.profile_write', 'privileged', true);

  update public.profiles
     set username = v_new::extensions.citext,
         username_changed_at = now()
   where id = v_uid;

  perform set_config('frame.profile_write', '', true);

  return v_new;
end;
$$;

comment on function public.change_username(text) is
  'Replaces the username of an account made through a sign-in provider, once. Refuses email accounts, reserved names and names in use.';

revoke all on function public.change_username(text) from public;
grant execute on function public.change_username(text) to authenticated;

-- -----------------------------------------------------------------------------
-- delete_own_account
-- -----------------------------------------------------------------------------
-- Does what the privacy notice says deletion does, in one transaction.
--
-- An ordinary account: the auth.users row is deleted, and the foreign keys do
-- the rest exactly as they were designed to — the profile, photographs, their
-- image and metadata rows, appreciations, collections and pending place
-- submissions cascade away; reports, approved places and restrictions keep
-- their content with the account reference set to null. The appreciation
-- counters on other members' photographs are recomputed by the
-- recount_photograph_appreciations trigger as the rows go.
--
-- An account that has made moderation decisions: moderation_actions.moderator_id
-- is ON DELETE RESTRICT, because an audit row with no author is not an audit
-- row. So that account is not deleted. Its photographs, collections,
-- appreciations and submissions are removed; its profile is reduced to the
-- username the audit trail names; it is demoted to member, suspended — which
-- hides it from the public site — and barred from signing in, and every session
-- it has is ended.
--
-- Image files are not in the database. The server action removes them from
-- storage before calling this, so a failure here leaves an account to retry
-- rather than public image files with no record pointing at them.
--
-- The member must type their username, checked here as well as in the form:
-- this function is callable by anyone holding a session, and it cannot be
-- undone.
--
-- Returns 'deleted' or 'retained'.
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
       set display_name     = username::text,
           avatar_url       = null,
           biography        = null,
           website          = null,
           based_in         = null,
           usual_gear       = '{}',
           role             = 'member',
           is_suspended     = true,
           suspended_reason = 'Closed at the member''s request. Kept only because moderation decisions name this account.'
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

-- -----------------------------------------------------------------------------
-- deletion_would_retain_account
-- -----------------------------------------------------------------------------
-- The Settings page says, before anybody presses the button, which of the two
-- outcomes above deletion will have. The answer depends on moderation_actions,
-- which a member who has since been demoted can no longer read, so asking the
-- table directly would tell such a member their account will be deleted when it
-- will in fact be kept. This answers the one question, for the caller only.
create or replace function public.deletion_would_retain_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.moderation_actions m
     where m.moderator_id = (select auth.uid())
  );
$$;

revoke all on function public.deletion_would_retain_account() from public;
grant execute on function public.deletion_would_retain_account() to authenticated;

comment on function public.delete_own_account(text) is
  'Deletes the caller''s account, or — where it authored moderation decisions — strips, demotes, suspends and bars it. Requires the username typed as confirmation.';

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
