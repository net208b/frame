-- =============================================================================
-- FRAME — 0016  How a member describes their own work
-- =============================================================================
-- Five things a profile could not say until now: which country the member
-- works from, how they shoot, whether they are open to working with somebody,
-- how they want their frames talked about, and where else to find them.
--
-- All five are the member's own statements about themselves. None of them
-- changes what anybody is allowed to do on FRAME — in particular,
-- critique_preference is a sentence addressed to other members, not a
-- permission the application enforces, because FRAME has no comments for it to
-- enforce anything about. A column that looked like a setting and was not
-- would be worse than no column, so the Settings form says this in as many
-- words.
--
-- What this adds to profiles:
--
--   country_code           the country the member works from, by their choice
--   style_tags             how they shoot, from a closed vocabulary
--   collaboration_status   open to working with somebody, or not
--   critique_preference    how they want their work discussed
--   social_links           up to four other places they publish
--
-- Every limit here is also in src/lib/validation/account.ts, and has to be: a
-- member can write their own row directly with the public key, so the form is
-- a courtesy and this file is the rule. The vocabularies are the ones declared
-- in src/types/domain.ts (PHOTOGRAPHY_STYLES, COLLABORATION_STATUSES,
-- CRITIQUE_PREFERENCES) — the same arrangement as every other closed
-- vocabulary in this schema, and for the reasons written out in 0001.
--
-- No change to profiles_guard_privileged_columns (0006, 0011): these are a
-- member's to write about themselves, which is the whole point of them. The
-- table-level UPDATE grant in 0007 covers the new columns, and
-- profiles_update_own still decides whose row may be written.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- Helpers for array columns
-- -----------------------------------------------------------------------------
-- A CHECK constraint may not contain a subquery, so `array(select distinct ...)`
-- is not available inside one. These do the same work in a place a constraint
-- can call. `text_items_within` already exists from 0011 and is reused below.

create or replace function public.text_items_distinct(p_items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_items) = count(distinct item) from unnest(p_items) as item;
$$;

comment on function public.text_items_distinct(text[]) is
  'True when an array holds no repeated element. For list columns a member edits, where a duplicate is a mistake rather than data.';

create or replace function public.text_items_match(p_items text[], p_pattern text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(item ~* p_pattern), true) from unnest(p_items) as item;
$$;

comment on function public.text_items_match(text[], text) is
  'True when every element of an array matches the pattern. Used to keep a stored link to http(s), since the value becomes an href.';

-- -----------------------------------------------------------------------------
-- profiles: the new columns
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists country_code         char(2),
  add column if not exists style_tags           text[] not null default '{}',
  add column if not exists collaboration_status text,
  add column if not exists critique_preference  text,
  add column if not exists social_links         text[] not null default '{}';

comment on column public.profiles.country_code is
  'ISO 3166-1 alpha-2, chosen by the member alongside the free-text based_in line. Never inferred from a request — the same rule as based_in.';
comment on column public.profiles.style_tags is
  'How the member shoots, from the closed vocabulary in PHOTOGRAPHY_STYLES. Up to five, no repeats.';
comment on column public.profiles.collaboration_status is
  'Whether the member is open to working with somebody. Null means they have not said, which is not the same as "no".';
comment on column public.profiles.critique_preference is
  'How the member wants their work discussed. A statement to other members, not a permission: FRAME has no comments, and nothing here is enforced.';
comment on column public.profiles.social_links is
  'Up to four other places the member publishes. http(s) only, because each becomes an href on a public page.';

-- -----------------------------------------------------------------------------
-- profiles: what the new columns may hold
-- -----------------------------------------------------------------------------
-- Re-runnable, like every constraint in this schema: dropped by name first, so
-- a second run of this file replaces the constraint instead of failing on it.
alter table public.profiles
  drop constraint if exists profiles_country_code_format,
  add constraint profiles_country_code_format
    check (country_code is null or (country_code)::text ~ '^[A-Z]{2}$'),

  drop constraint if exists profiles_style_tags_allowed,
  add constraint profiles_style_tags_allowed
    check (cardinality(style_tags) <= 5
           and public.text_items_distinct(style_tags)
           and style_tags <@ array[
             'black-and-white', 'colour', 'film', 'candid',
             'flash', 'minimal', 'geometry', 'layered'
           ]::text[]),

  drop constraint if exists profiles_collaboration_status_allowed,
  add constraint profiles_collaboration_status_allowed
    check (collaboration_status is null
           or collaboration_status in ('open', 'selective', 'closed')),

  drop constraint if exists profiles_critique_preference_allowed,
  add constraint profiles_critique_preference_allowed
    check (critique_preference is null
           or critique_preference in ('any', 'technical', 'none')),

  -- The pattern is the one 0011 put on `website`, for the same reason: the
  -- value ends up in an href, and `javascript:` is script. ProfileHeader also
  -- refuses to link anything but http(s); this stops it being stored at all.
  drop constraint if exists profiles_social_links_bounds,
  add constraint profiles_social_links_bounds
    check (cardinality(social_links) <= 4
           and public.text_items_distinct(social_links)
           and public.text_items_within(social_links, 200)
           and public.text_items_match(social_links, '^https?://[^[:space:]]+$'));

-- -----------------------------------------------------------------------------
-- delete_own_account — the new columns are member-written text too
-- -----------------------------------------------------------------------------
-- An account kept because it authored moderation decisions is stripped to the
-- username the audit trail names. These five columns are as much the member's
-- own words as the biography is, so they go with it. Unchanged from 0011 in
-- every other respect.
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
           country_code          = null,   -- NEW in 0016
           style_tags            = '{}',   -- NEW in 0016
           collaboration_status  = null,   -- NEW in 0016
           critique_preference   = null,   -- NEW in 0016
           social_links          = '{}',   -- NEW in 0016
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
