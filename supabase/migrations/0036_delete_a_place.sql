-- =============================================================================
-- FRAME — 0036  Deleting a place, for an admin
-- =============================================================================
-- Taking a place down (0024, `takeDownLocation`) sets its status to `rejected`:
-- the pin goes, the row stays, and a moderator can see what was there. That is
-- the right default and it is not going away.
--
-- What it does not do is get rid of anything. A place proposed by mistake, a
-- duplicate of one already on the map, a test pin from setting the site up —
-- all of them stay in the table for ever, and the only way to remove one was a
-- hand-written SQL statement against production. This adds the missing verb.
--
-- WHO. The admin, not every moderator. Taking down is reversible and belongs to
-- whoever is on the queue; deleting is not reversible and belongs to the person
-- who owns the site. `is_admin()`, checked here rather than in the action that
-- calls it, because the database is where FRAME keeps its rules.
--
-- WHAT SURVIVES. Nothing of the place itself, and everything of other people's
-- work. The foreign keys already say so and this function relies on them rather
-- than repeating them:
--
--   photographs.location_id            SET NULL   the frame stays, placeless
--   location_submissions.approved_…    SET NULL   the proposal record stays
--   location_restrictions              CASCADE    the place's own rows go
--   collection_items.location_id       CASCADE    an entry for a place that
--                                                 no longer exists goes
--
-- A PLACE WITH PHOTOGRAPHS AT IT IS REFUSED. `SET NULL` would quietly strip the
-- place off somebody's published frame, which is a worse thing to do by
-- accident than leaving a pin up. So a place that still holds a photograph
-- anyone can see cannot be deleted until those frames are dealt with — the
-- message says how many. Taking the place down is still available and is the
-- right answer for a real place.
--
-- THE AUDIT ROW IS WRITTEN FIRST, inside the same statement. `moderation_actions`
-- has no foreign key to `locations`, so the record outlives the place it is
-- about — which is the entire point of recording it. The row cannot be skipped
-- because there is no path to the delete that does not go through this function,
-- and `delete` joins the decisions the table already allows.
-- =============================================================================

set search_path = public, extensions;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_decision_allowed,
  add constraint moderation_actions_decision_allowed
    check (decision in ('approve', 'reject', 'request_changes', 'remove_content',
                        'suspend_account', 'dismiss', 'change_role', 'delete'));

create or replace function public.delete_location(p_location_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_place   public.locations;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_frames  integer;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- Not is_moderator(): taking a place down is a moderator's call and can be
  -- undone; removing it cannot.
  if not public.is_admin() then
    raise exception 'Only an admin deletes a place.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Say why the place is being deleted.' using errcode = '22023';
  end if;

  select * into v_place from public.locations l where l.id = p_location_id;
  if not found then
    raise exception 'No such place.' using errcode = 'P0002';
  end if;

  -- Anything but a removed frame counts: a draft or an upload under review is
  -- still somebody's work waiting on a decision, and it would lose its place
  -- silently.
  select count(*) into v_frames
    from public.photographs p
   where p.location_id = p_location_id
     and p.status <> 'removed';

  if v_frames > 0 then
    raise exception
      'This place still holds % photograph(s). Take the place down instead, or deal with those frames first.',
      v_frames
      using errcode = '23503';
  end if;

  insert into public.moderation_actions
    (moderator_id, decision, subject_type, subject_id, reason)
  values
    (v_me, 'delete', 'location', p_location_id,
     left(v_reason || ' [place: ' || coalesce(v_place.name, '?') || ', '
          || coalesce(v_place.slug, '?') || ']', 2000));

  delete from public.locations l where l.id = p_location_id;
end;
$$;

revoke all on function public.delete_location(uuid, text) from public, anon;
grant execute on function public.delete_location(uuid, text) to authenticated;
