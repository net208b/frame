-- =============================================================================
-- FRAME — 0039  Merging two places that are one place
-- =============================================================================
-- The duplicate queue has shown pairs of approved places within 120 m of each
-- other since 0024, and its second button has always said, in so many words,
-- "nothing is merged — FRAME has no merge". docs/LIMITATIONS.md lists what a
-- merge has to do and why a button that did some of it would be worse than
-- one honest about doing none. This does all of it, in one statement.
--
-- WHAT A MERGE IS. One place survives (p_keep); the other (p_merge) stops
-- being a place and becomes a pointer to it:
--
--   photographs.location_id            moved to p_keep — every status, not
--                                      only published: a draft at the losing
--                                      place is a draft at the surviving one
--   collection_items.location_id       moved, except where that collection
--                                      already holds p_keep, in which case
--                                      the duplicate item is removed rather
--                                      than left to break the unique rule
--   location_restrictions              moved; a sourced note about the place
--                                      is about the place, whichever row
--   location_submissions               the proposal that produced p_merge
--     .approved_location_id            now says it produced p_keep
--   locations (p_merge)                status 'merged', merged_into_id set,
--                                      slug kept so the old address redirects
--   locations (p_keep)                 photograph_count and categories
--                                      recounted by the trigger the moved
--                                      photographs fire
--   moderation_actions                 one row, decision 'merge', naming both
--
-- WHAT SURVIVES OF THE LOSER: its name, description, coordinate and flags, on
-- its own row, under status 'merged'. Nothing reads a 'merged' row as a place
-- — every public read filters status = 'approved' — but the row is there to
-- say what was merged, and its slug is there so /locations/<old-slug> sends a
-- reader to the surviving place instead of to a not-found page. The row is
-- not deleted because a merge is a judgement, and the record of a judgement
-- should outlive the moment it was made.
--
-- WHO. A moderator: the duplicate queue is theirs, and unlike delete_location
-- (0036) nothing is destroyed. It is still not undoable by a button, so the
-- reason is required and lands in the audit trail with both names.
--
-- WHAT IS REFUSED. Merging a place into itself; merging in either direction
-- when either place is not approved (a pending place is not yet a place, a
-- merged one already is not); and a missing reason.
-- =============================================================================

set search_path = public, extensions;

alter table public.locations
  drop constraint if exists locations_status_allowed,
  add constraint locations_status_allowed
    check (status in ('pending', 'approved', 'rejected', 'merged'));

alter table public.locations
  add column if not exists merged_into_id uuid references public.locations (id) on delete set null;

comment on column public.locations.merged_into_id is
  'Set when status = ''merged'': the place this one was merged into. The slug is kept so the old address redirects; nothing else reads a merged row as a place.';

-- A merged row must point somewhere, and a live row must not.
alter table public.locations
  drop constraint if exists locations_merged_points_somewhere,
  add constraint locations_merged_points_somewhere
    check ((status = 'merged') = (merged_into_id is not null));

create index if not exists locations_merged_into_idx
  on public.locations (merged_into_id) where merged_into_id is not null;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_decision_allowed,
  add constraint moderation_actions_decision_allowed
    check (decision in ('approve', 'reject', 'request_changes', 'remove_content',
                        'suspend_account', 'dismiss', 'change_role', 'delete', 'merge'));

create or replace function public.merge_location(p_keep uuid, p_merge uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_keep    public.locations;
  v_merge   public.locations;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_moved   integer;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only a moderator merges places.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Say why the two places are one place.' using errcode = '22023';
  end if;
  if p_keep = p_merge then
    raise exception 'A place cannot be merged into itself.' using errcode = '22023';
  end if;

  -- Both rows locked, in id order, so two moderators merging the same pair
  -- in opposite directions cannot deadlock, and cannot both succeed: the
  -- second finds the loser no longer approved.
  perform 1 from public.locations l where l.id in (p_keep, p_merge) order by l.id for update;
  select * into v_keep  from public.locations l where l.id = p_keep;
  select * into v_merge from public.locations l where l.id = p_merge;
  if v_keep.id is null or v_merge.id is null then
    raise exception 'No such place.' using errcode = 'P0002';
  end if;
  if v_keep.status <> 'approved' then
    raise exception 'The surviving place must be approved.' using errcode = '22023';
  end if;
  if v_merge.status <> 'approved' then
    raise exception 'Only an approved place can be merged; this one is %.', v_merge.status
      using errcode = '22023';
  end if;

  -- The photographs. Every status: a draft at the losing place is a draft at
  -- the surviving one. The recount trigger fires for each row and rebuilds
  -- both places' counts and categories.
  update public.photographs
     set location_id = p_keep
   where location_id = p_merge;
  get diagnostics v_moved = row_count;

  -- Collection items: move the ones that can move, remove the ones that
  -- would double up a collection that already holds the survivor.
  delete from public.collection_items i
   where i.location_id = p_merge
     and exists (select 1 from public.collection_items k
                  where k.collection_id = i.collection_id and k.location_id = p_keep);
  update public.collection_items
     set location_id = p_keep
   where location_id = p_merge;

  update public.location_restrictions
     set location_id = p_keep
   where location_id = p_merge;

  update public.location_submissions
     set approved_location_id = p_keep
   where approved_location_id = p_merge;

  -- The audit row first, naming both, then the row that becomes a pointer.
  insert into public.moderation_actions
    (moderator_id, decision, subject_type, subject_id, reason)
  values
    (v_me, 'merge', 'location', p_merge,
     left(v_reason || ' [merged "' || coalesce(v_merge.name, '?') || '" (' || coalesce(v_merge.slug, '?')
          || ') into "' || coalesce(v_keep.name, '?') || '" (' || coalesce(v_keep.slug, '?')
          || '); ' || v_moved || ' photograph(s) moved]', 2000));

  update public.locations
     set status = 'merged',
         merged_into_id = p_keep,
         photograph_count = 0,
         categories = '{}'
   where id = p_merge;
end;
$$;

comment on function public.merge_location(uuid, uuid, text) is
  'Merge the second place into the first: photographs, collection items, restrictions and the proposal move; the loser keeps its slug under status merged and points at the survivor. Moderators only; the reason is required and recorded with both names.';

revoke all on function public.merge_location(uuid, uuid, text) from public, anon;
grant execute on function public.merge_location(uuid, uuid, text) to authenticated;
