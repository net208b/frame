-- =============================================================================
-- FRAME — 0009  Usernames for accounts made through a sign-in provider
-- =============================================================================
-- Replaces handle_new_user() from 0006. Two changes, both caused by accounts
-- now arriving from Google, Apple, Facebook and X as well as the Join form.
--
-- 1. Where the username comes from.
--
--    The Join form always sends a username it has already validated, so until
--    now the trigger's fallbacks were reached only by an account created
--    outside the app. A provider account sends none: what it sends instead is
--    a name, an email address, and — from X — the member's handle. The
--    trigger now tries, in order, and takes the first that survives
--    sanitising with at least three characters left:
--
--      username             what the Join form asked for
--      preferred_username   X, and OpenID providers generally
--      user_name            X
--      the email local part unless it is an Apple relay address
--      the display name
--
--    "Unless it is an Apple relay address": Sign in with Apple lets a member
--    hide their real address behind one like k3j9x2q8vm@privaterelay.appleid.com.
--    Its local part is random by design, and a username is a public address
--    that this build does not let anybody change, so it would be a random
--    string on their profile for good. Their name is a better guess.
--
--    Previously each fallback was only tried if the one before it was absent,
--    so a handle that sanitised to nothing — a Thai X handle, for instance —
--    went straight to "member" without the email ever being tried.
--
-- 2. Reserved names.
--
--    RESERVED_USERNAMES in src/lib/validation/auth.ts — the route segments, and
--    names like "admin" or "support" that would imply an authority the account
--    does not have — was enforced by the Join form only. That held while the
--    form was the only thing choosing usernames. A provider now chooses one
--    from data the member controls at the provider: a Gmail address of
--    admin@…, or an X handle of "moderator", would have become that username
--    here. The same was already true of anybody calling the identity service's
--    sign-up endpoint directly with the public key, which needs no form.
--
--    A reserved name is now treated exactly like a taken one and gets the
--    random suffix. The list below must be kept in step with
--    RESERVED_USERNAMES; each names the other.
--
-- Everything else — the search path, the collision suffix, the deterministic
-- last resort, never assigning a role above member — is unchanged from 0006.
-- CREATE OR REPLACE keeps the function's identity, so the trigger from 0006
-- still points at it and the EXECUTE revoke from 0006 still applies.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = extensions, public
as $$
declare
  -- Keep in step with RESERVED_USERNAMES in src/lib/validation/auth.ts.
  c_reserved    constant text[] := array[
    'api', 'auth', 'admin', 'collections', 'community', 'discover', 'join',
    'legal', 'locations', 'login', 'map', 'moderation', 'photographers',
    'photographs', 'search', 'upload',
    'frame', 'help', 'me', 'moderator', 'settings', 'staff', 'support'
  ];
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_display     text;
  v_sources     text[];
  v_source      text;
  v_clean       text;
  v_base        text;
  v_candidate   text;
  v_attempt     integer := 0;
begin
  v_display := nullif(btrim(coalesce(v_meta ->> 'display_name',
                                     v_meta ->> 'full_name',
                                     v_meta ->> 'name',
                                     '')), '');

  v_sources := array[
    v_meta ->> 'username',
    v_meta ->> 'preferred_username',
    v_meta ->> 'user_name',
    case
      when new.email ilike '%@privaterelay.appleid.com' then null
      else nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    end,
    v_display
  ];

  -- Anything outside [a-z0-9_] is dropped rather than transliterated: a
  -- username is an identifier in a URL, not a display name. Room is left for
  -- the collision suffix inside the 24-character limit.
  foreach v_source in array v_sources loop
    continue when v_source is null;
    v_clean := left(regexp_replace(lower(btrim(v_source)), '[^a-z0-9_]', '', 'g'), 18);
    if length(v_clean) >= 3 then
      v_base := v_clean;
      exit;
    end if;
  end loop;

  v_base := coalesce(v_base, 'member');
  v_candidate := v_base;

  -- A reserved name is treated as taken. A short random suffix on collision,
  -- rather than a counter: a counter tells anyone who can read usernames how
  -- many people wanted the same one.
  while v_candidate = any (c_reserved)
     or exists (select 1 from public.profiles p where p.username = v_candidate::citext) loop
    v_attempt := v_attempt + 1;
    exit when v_attempt > 20;
    v_candidate := v_base || '_' || substr(md5(random()::text || new.id::text), 1, 4);
  end loop;

  -- Deterministic last resort. The account id is unique, so this cannot
  -- collide, and it still satisfies the username format constraint.
  if v_candidate = any (c_reserved)
     or exists (select 1 from public.profiles p where p.username = v_candidate::citext) then
    v_candidate := 'm_' || substr(replace(new.id::text, '-', ''), 1, 20);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_candidate::citext, coalesce(v_display, v_candidate))
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'After-insert trigger on auth.users. Creates the profiles row, derives a unique username that is never a reserved name, and never assigns a role above member.';
