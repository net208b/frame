-- -----------------------------------------------------------------------------
-- 0040 — the three things a photographer's profile still could not say
-- -----------------------------------------------------------------------------
-- The profile already carries who somebody is, how they work and what they
-- shoot with (0002, 0011, 0016, 0017). Three things the owner's brief names
-- were still missing, and all three are the member's own words about
-- themselves, so they are shaped exactly like the fields beside them rather
-- than invented fresh:
--
--   favourite_cities   where they keep going back to, as free text
--   approach           how they go about it, a paragraph
--   contact_url        one way to reach them, OUTSIDE FRAME
--
-- WHAT THIS IS NOT. `contact_url` is not messaging. FRAME has no direct
-- messages and this does not add any: the value is a link the member chose to
-- publish, and the conversation happens on whatever is at the other end of it.
-- Guardrail §7.1 is that social features earn their place by helping discovery
-- or creation, and an inbox does neither.
--
-- WHY THESE ARE NOT PRIVILEGED COLUMNS. Like 0016's five, these are a member
-- editing their own description of themselves, so `profiles_update_own` is
-- exactly the right policy and `profiles_guard_privileged_columns` is
-- deliberately untouched. A column a member may not write would have to be
-- added to that guard; these are not such columns.
--
-- No grant change: `profiles` has no column-level grant regime — row-level
-- security governs it — so a new column is readable exactly where the row is.

-- -----------------------------------------------------------------------------
-- profiles: the new columns
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists favourite_cities text[] not null default '{}',
  add column if not exists approach         text,
  add column if not exists contact_url      text;

comment on column public.profiles.favourite_cities is
  'Cities the member keeps returning to, in their own words. Free text, not a reference to a city hub: a city a member loves may have no approved place on FRAME at all, and saying so should not require one.';
comment on column public.profiles.approach is
  'How the member goes about the work, in their own words. Member prose, so it is machine-translated with the original kept available (0035), the same as the biography.';
comment on column public.profiles.contact_url is
  'One way to reach the member, OUTSIDE FRAME. http(s), or a mailto: the member typed themselves. Not messaging: FRAME has no inbox and this adds none.';

-- -----------------------------------------------------------------------------
-- profiles: what the new columns may hold
-- -----------------------------------------------------------------------------
-- Re-runnable, like every constraint in this schema: dropped by name first, so
-- a second run of this file replaces the constraint instead of failing on it.
alter table public.profiles
  -- Six, because this is "where I keep going back to" and not a travel log.
  -- Bounded and de-duplicated by the same helpers 0016 wrote for style_tags
  -- and social_links, so one rule about arrays of member text is enforced the
  -- same way in every one of them.
  drop constraint if exists profiles_favourite_cities_bounds,
  add constraint profiles_favourite_cities_bounds
    check (cardinality(favourite_cities) <= 6
           and public.text_items_distinct(favourite_cities)
           and public.text_items_within(favourite_cities, 80)),

  -- Shorter than the 1200-character biography on purpose: the biography is who
  -- you are, this is one thing about how you shoot. A field with room for an
  -- essay invites one, and the profile page has a shape.
  drop constraint if exists profiles_approach_length,
  add constraint profiles_approach_length
    check (approach is null or char_length(approach) <= 600),

  -- The pattern 0011 put on `website` and 0016 on `social_links`, for the same
  -- reason: the value becomes an href, and `javascript:` is script. `mailto:`
  -- is admitted here and nowhere else, because being reachable is the whole
  -- point of this one field and an address is how a photographer is reached
  -- for work. The form refuses anything else as well; this stops it being
  -- stored at all.
  drop constraint if exists profiles_contact_url_format,
  add constraint profiles_contact_url_format
    check (contact_url is null
           or (char_length(contact_url) <= 200
               and contact_url ~ '^(https?://[^[:space:]]+|mailto:[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+)$'));

-- -----------------------------------------------------------------------------
-- delete_own_account — the new columns are member-written text too
-- -----------------------------------------------------------------------------
-- An account kept because it authored moderation decisions is stripped to the
-- username the audit trail names. These three columns are as much the member's
-- own words as the biography is, so they go with it. Unchanged from 0016 in
-- every other respect — a column added without this line would survive a
-- closed account, which is the whole failure this paragraph exists to prevent.
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
           favourite_cities      = '{}',   -- NEW in 0040
           approach              = null,   -- NEW in 0040
           contact_url           = null,   -- NEW in 0040
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
  'Deletes the caller''s account, or — where it authored moderation decisions — strips, demotes, suspends and bars it, including the three fields added in 0040. Requires the username typed as confirmation.';

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
