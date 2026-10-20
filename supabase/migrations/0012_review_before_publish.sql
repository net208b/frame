-- =============================================================================
-- 0012 — every photograph is reviewed before it is published, and roles are
--        managed by administrators
-- =============================================================================
-- Until now a photograph was published the moment its owner finished the
-- upload, unless the upload raised a high-severity signal, in which case it
-- waited as 'under_review'. Every upload now waits, and a moderator approves
-- it. The application asks for 'under_review'; this file is what makes it a
-- rule rather than a habit of the upload form.
--
-- Without it the rule would not hold. photographs_update_own (0007) lets an
-- owner update any column of their own row, and nothing stopped one of those
-- columns being `status`: a member could PATCH their draft to 'published'
-- through the REST API and skip the review entirely.
--
-- The roles themselves are not new — profiles.role has allowed 'member',
-- 'moderator' and 'admin' since 0002, and is_moderator() counts both of the
-- last two. What is new is a way to change them that is not a hand-written SQL
-- statement: set_member_role(), for administrators only, with the change
-- recorded in the moderation trail.

-- -----------------------------------------------------------------------------
-- is_admin
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

comment on function public.is_admin() is
  'True for role admin on a non-suspended account. Administrators can do everything a moderator can, and also appoint and remove moderators and administrators.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- photographs_guard_privileged_columns — now also guards publication
-- -----------------------------------------------------------------------------
-- Unchanged from 0006 except where marked.
create or replace function public.photographs_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- A null actor is the service role or a direct SQL session; the definer
  -- functions in this file write through it on purpose.
  if v_actor is null then
    return new;
  end if;

  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
    raise exception 'A photograph''s identity and owner cannot be reassigned.'
      using errcode = '42501';
  end if;

  new.created_at = old.created_at;

  if new.editors_pick is distinct from old.editors_pick and not public.is_moderator() then
    raise exception 'Only a FRAME editor may mark a photograph as an editor''s pick.'
      using errcode = '42501';
  end if;

  -- NEW in 0012. Publishing is a moderator's decision. An owner may still move
  -- their own photograph between draft, processing and under_review, edit a
  -- photograph that is already published, and take it down; they may not put
  -- it up.
  if new.status = 'published' and old.status is distinct from 'published'
     and not public.is_moderator() then
    raise exception 'A photograph is published by a moderator after review. It is waiting in the review queue.'
      using errcode = '42501';
  end if;

  -- NEW in 0012. published_at is when a moderator published it; an owner who
  -- could set it could reorder the newest-first feed.
  if new.published_at is distinct from old.published_at and not public.is_moderator() then
    -- Clearing it is allowed, because that is what taking a photograph down or
    -- sending it back to review does.
    if new.published_at is not null then
      raise exception 'The publication date is set when a moderator publishes a photograph.'
        using errcode = '42501';
    end if;
  end if;

  -- NEW in 0012. A photograph a moderator removed stays removed. Its owner can
  -- read why, and can delete it; they cannot put it back in the queue under the
  -- same row as if the decision had not been made.
  if old.status = 'removed' and new.status is distinct from 'removed'
     and not public.is_moderator() then
    raise exception 'This photograph was removed by a moderator and cannot be resubmitted.'
      using errcode = '42501';
  end if;

  -- appreciation_count may only ever hold the number of appreciation rows that
  -- actually exist. toggle_appreciation() computes exactly that, so it passes;
  -- any other value is refused.
  if new.appreciation_count is distinct from old.appreciation_count
     and new.appreciation_count <> public.appreciation_count_of(old.id) then
    raise exception 'Appreciation counts are derived from appreciation rows and cannot be set directly.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- moderation_actions — a role change is a decision too
-- -----------------------------------------------------------------------------
alter table public.moderation_actions
  drop constraint if exists moderation_actions_decision_allowed;
alter table public.moderation_actions
  add constraint moderation_actions_decision_allowed
  check (decision in ('approve', 'reject', 'request_changes',
                      'remove_content', 'suspend_account', 'dismiss',
                      'change_role'));

-- A role change is recorded by set_member_role() and nowhere else. Without this
-- a moderator could insert a 'change_role' row by hand, and the trail would
-- claim a promotion that never happened. set_member_role() is SECURITY DEFINER,
-- so it writes past this policy.
drop policy if exists moderation_actions_insert_moderator on public.moderation_actions;
create policy moderation_actions_insert_moderator
  on public.moderation_actions for insert
  to authenticated
  with check (public.is_moderator()
              and moderator_id = (select auth.uid())
              and decision <> 'change_role');

-- -----------------------------------------------------------------------------
-- set_member_role
-- -----------------------------------------------------------------------------
-- The one way an administrator appoints or removes a moderator or another
-- administrator from the application.
--
-- * Only an administrator may call it (is_admin(), so not while suspended).
-- * Nobody changes their own role, which also means the last administrator
--   cannot demote themselves and leave nobody able to appoint anyone. A second
--   administrator, or the service role, has to do it.
-- * A suspended account is not given staff rights: lift the suspension first.
-- * The change is written to moderation_actions with the old and new role in
--   the reason, so the trail says who made whom what, and when.
--
-- SECURITY DEFINER so that the audit row and the profile write happen together
-- or not at all. profiles_guard_privileged_columns still runs on the write and
-- still sees the administrator's auth.uid(), so its own check — that only an
-- administrator changes somebody else's role — holds here as well.
create or replace function public.set_member_role(p_username text, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_target public.profiles%rowtype;
  v_role   text := lower(btrim(coalesce(p_role, '')));
begin
  if v_actor is null then
    raise exception 'You need to be signed in to change a role.'
      using errcode = '42501';
  end if;

  if not public.is_admin() then
    raise exception 'Only an administrator can appoint or remove moderators and administrators.'
      using errcode = '42501';
  end if;

  if v_role not in ('member', 'moderator', 'admin') then
    raise exception 'A role is member, moderator or admin.'
      using errcode = '22023';
  end if;

  select * into v_target
    from public.profiles
   where username = lower(btrim(coalesce(p_username, '')))
   for update;

  if not found then
    raise exception 'There is no member with that username.'
      using errcode = 'P0002';
  end if;

  if v_target.id = v_actor then
    raise exception 'You cannot change your own role. Ask another administrator.'
      using errcode = '42501';
  end if;

  if v_target.is_suspended and v_role <> 'member' then
    raise exception 'A suspended account cannot be given a staff role. Lift the suspension first.'
      using errcode = '22023';
  end if;

  if v_target.role = v_role then
    return v_target.role;
  end if;

  update public.profiles
     set role = v_role
   where id = v_target.id;

  insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
  values ('change_role', 'profile', v_target.id,
          'Role changed from ' || v_target.role || ' to ' || v_role || '.', v_actor);

  return v_role;
end;
$$;

comment on function public.set_member_role(text, text) is
  'Administrator only. Sets another member''s role to member, moderator or admin, and records the change in moderation_actions.';

revoke all on function public.set_member_role(text, text) from public;
grant execute on function public.set_member_role(text, text) to authenticated, service_role;
