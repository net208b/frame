-- =============================================================================
-- FRAME — 0010  A member cannot rename themselves directly
-- =============================================================================
-- A security fix, shipped on its own ahead of the work that needs it.
--
-- profiles_update_own (0007) lets a member write their own profile row, and
-- profiles_guard_privileged_columns (0006) stops them changing their role or
-- their suspension. It did not stop them changing their username. Any
-- signed-in member could rename themselves with one request using the public
-- key:
--
--     PATCH /rest/v1/profiles?id=eq.<own id>   {"username":"support"}
--
-- That returned 200 and stuck. It bypasses everything the Join form enforces —
-- the reserved names ("admin", "moderator", "support", "staff", "frame", and
-- every route segment) exist to stop an account implying an authority it does
-- not have, and the form's promise that a username does not change is what
-- keeps every link to a profile working. Neither was enforced by the database.
--
-- This replaces the guard with the same function plus one rule: nobody with a
-- session may change a username directly — not the member, and not a
-- moderator, since renaming somebody else is not a moderation tool this app
-- offers. The service role still can, for support fixes.
--
-- Nothing in the app writes profiles.username after an account is created
-- (the Join form sets it once, through handle_new_user()), so this refuses
-- only the attack.
--
-- NUMBERING. 0008 is the storage bucket, 0009 is sign-in-provider usernames,
-- and the account-settings migration that follows this one redefines this same
-- function again, more fully. On a fresh database the later file wins, so
-- this must sort before it; that one is numbered 0011 for that reason.
-- =============================================================================

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

  -- Ignored rather than rejected, the same way set_updated_at ignores a
  -- client-supplied updated_at: these are not a member's to set, and a form
  -- that posts them back unchanged should not fail.
  new.id = old.id;
  new.created_at = old.created_at;
  new.member_since = old.member_since;

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

  -- NEW in 0010.
  if new.username is distinct from old.username then
    raise exception 'A username cannot be edited directly.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
