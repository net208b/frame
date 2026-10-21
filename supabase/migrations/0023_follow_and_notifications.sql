-- =============================================================================
-- FRAME — 0023  Following, and being told about it
-- =============================================================================
-- Two things that only make sense together: a member can follow another
-- member's work, and a member finds out when something happened to theirs.
--
-- WHAT THE DATABASE GUARANTEES:
--
-- Following
--   * (follower_id, followee_id) is the primary key, so following twice is the
--     same row rather than a second one. Nobody follows themselves.
--   * A member follows only as themselves, and only while not suspended. There
--     is no UPDATE privilege at all: a follow has nothing to edit.
--   * follower_count and following_count are recounted from the rows, never
--     incremented, so they cannot drift whichever path wrote them.
--
-- Notifications
--   * Written ONLY by the triggers below. `authenticated` has no INSERT
--     privilege and there is no insert policy, so no member can manufacture a
--     notification for anybody — including themselves.
--   * A member reads only their own, and may change only `read_at`. Marking
--     something read cannot rewrite what it said.
--   * Nobody is told about their own action.
--   * subject_label and subject_slug are frozen copies, for the same reason
--     reports.subject_label is one: a notification routinely outlives its
--     subject, and a row that reads only a UUID is useless afterwards.
--   * The unread count is NOT stored. It changes on every read, and a badge
--     that has drifted is worse than one query against a partial index.
-- =============================================================================

set search_path = public, extensions;

/* ------------------------------------------------------------------------ */
/* Following                                                                  */
/* ------------------------------------------------------------------------ */

create table if not exists public.profile_follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),

  primary key (follower_id, followee_id),
  constraint profile_follows_not_oneself check (follower_id <> followee_id)
);

comment on table public.profile_follows is
  'Who follows whose work. The pair is the primary key, so a repeated follow is the same row.';

-- Reading a profile's followers, and reading what one member follows, are two
-- different queries; each gets the index it needs.
create index if not exists profile_follows_followee_idx
  on public.profile_follows (followee_id, created_at desc);
create index if not exists profile_follows_follower_idx
  on public.profile_follows (follower_id, created_at desc);

alter table public.profiles
  add column if not exists follower_count integer not null default 0
    constraint profiles_follower_count_non_negative check (follower_count >= 0),
  add column if not exists following_count integer not null default 0
    constraint profiles_following_count_non_negative check (following_count >= 0);

-- -----------------------------------------------------------------------------
-- recount_profile_follows — both sides of the row that changed
-- -----------------------------------------------------------------------------
create or replace function public.recount_profile_follows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[
    new.follower_id, new.followee_id, old.follower_id, old.followee_id
  ], null);

  update public.profiles p
     set follower_count = (
           select pg_catalog.count(*)::integer from public.profile_follows f
            where f.followee_id = p.id),
         following_count = (
           select pg_catalog.count(*)::integer from public.profile_follows f
            where f.follower_id = p.id)
   where p.id = any(v_ids);

  return null;
end;
$$;

drop trigger if exists recount_profile_follows on public.profile_follows;
create trigger recount_profile_follows
  after insert or delete on public.profile_follows
  for each row execute function public.recount_profile_follows();

-- -----------------------------------------------------------------------------
-- toggle_follow — the one write, because it also touches somebody else's row
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER for the same narrow reason toggle_appreciation is: the
-- counts live on a profile the caller does not own, and no policy should ever
-- let a member update another member's profile. The hole is exactly two
-- columns on two rows, and the function decides the caller itself.
create or replace function public.toggle_follow(p_profile_id uuid)
returns table (following boolean, follower_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_existing boolean;
begin
  if v_me is null then
    raise exception 'Sign in to follow a photographer.' using errcode = '42501';
  end if;
  if v_me = p_profile_id then
    raise exception 'A member does not follow themselves.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_profile_id) then
    raise exception 'No such photographer.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles pr where pr.id = v_me and pr.is_suspended) then
    raise exception 'A suspended account cannot follow.' using errcode = '42501';
  end if;

  select true into v_existing
    from public.profile_follows f
   where f.follower_id = v_me and f.followee_id = p_profile_id;

  if v_existing then
    delete from public.profile_follows f
     where f.follower_id = v_me and f.followee_id = p_profile_id;
  else
    insert into public.profile_follows (follower_id, followee_id)
    values (v_me, p_profile_id)
    on conflict do nothing;
  end if;

  return query
    select not coalesce(v_existing, false),
           (select pr.follower_count from public.profiles pr where pr.id = p_profile_id);
end;
$$;

revoke all on function public.recount_profile_follows() from public;
revoke all on function public.toggle_follow(uuid) from public;
grant execute on function public.toggle_follow(uuid) to authenticated;

/* ------------------------------------------------------------------------ */
/* Notifications                                                              */
/* ------------------------------------------------------------------------ */

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  kind          text not null
                  constraint notifications_kind_allowed
                  check (kind in ('comment', 'reply', 'appreciation', 'follow', 'photograph_published')),
  -- Null for a notice with no author, such as a photograph clearing review.
  actor_id      uuid references public.profiles (id) on delete set null,
  subject_type  text not null
                  constraint notifications_subject_type_allowed
                  check (subject_type in ('photograph', 'profile', 'comment')),
  -- Deliberately not a foreign key: a notification outlives its subject.
  subject_id    uuid not null,
  /* Frozen at the moment it happened, so the row still reads as a sentence
     after the photograph is removed or the comment is deleted. */
  subject_label text not null
                  constraint notifications_subject_label_length check (char_length(subject_label) <= 200),
  /* The photograph's slug or the member's username, for the link. */
  subject_slug  text
                  constraint notifications_subject_slug_length check (subject_slug is null or char_length(subject_slug) <= 200),
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.notifications is
  'What happened to a member''s work. Written only by triggers; a member may read their own and mark them read, nothing else.';

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

-- The badge's query, and the only reason it can stay a query rather than a
-- stored number.
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- notify() — the one way a row gets written
-- -----------------------------------------------------------------------------
-- Every trigger below funnels through this, so "never tell somebody about
-- their own action" is written once rather than five times.
create or replace function public.record_notification(
  p_recipient uuid,
  p_kind text,
  p_actor uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_subject_label text,
  p_subject_slug text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null then return; end if;
  -- Nobody is told about what they did themselves.
  if p_actor is not null and p_actor = p_recipient then return; end if;

  insert into public.notifications
    (recipient_id, kind, actor_id, subject_type, subject_id, subject_label, subject_slug)
  -- COALESCE and NULLIF are parser constructs rather than functions, so they
  -- are written plain; pg_catalog is searched first in any case, which is why
  -- left() and btrim() resolve under an empty search_path.
  values
    (p_recipient, p_kind, p_actor, p_subject_type, p_subject_id,
     left(coalesce(nullif(btrim(p_subject_label), ''), 'Untitled'), 200),
     left(p_subject_slug, 200));
end;
$$;

-- -----------------------------------------------------------------------------
-- A comment, and an answer to one
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
  v_slug text;
  v_parent_author uuid;
begin
  select p.owner_id, p.title, p.slug into v_owner, v_title, v_slug
    from public.photographs p where p.id = new.photograph_id;

  if new.parent_id is not null then
    select c.author_id into v_parent_author
      from public.photograph_comments c where c.id = new.parent_id;
    -- The person being answered.
    perform public.record_notification(
      v_parent_author, 'reply', new.author_id, 'photograph', new.photograph_id, v_title, v_slug);
  end if;

  -- The photographer, unless they are the one being answered — then the reply
  -- notice above already told them, and twice would be noise.
  if v_parent_author is null or v_parent_author <> v_owner then
    perform public.record_notification(
      v_owner, 'comment', new.author_id, 'photograph', new.photograph_id, v_title, v_slug);
  end if;

  return null;
end;
$$;

drop trigger if exists notify_on_comment on public.photograph_comments;
create trigger notify_on_comment
  after insert on public.photograph_comments
  for each row execute function public.notify_on_comment();

-- -----------------------------------------------------------------------------
-- An appreciation
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_appreciation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text;
  v_slug text;
begin
  select p.owner_id, p.title, p.slug into v_owner, v_title, v_slug
    from public.photographs p where p.id = new.photograph_id;
  perform public.record_notification(
    v_owner, 'appreciation', new.profile_id, 'photograph', new.photograph_id, v_title, v_slug);
  return null;
end;
$$;

drop trigger if exists notify_on_appreciation on public.photograph_appreciations;
create trigger notify_on_appreciation
  after insert on public.photograph_appreciations
  for each row execute function public.notify_on_appreciation();

-- -----------------------------------------------------------------------------
-- A new follower
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_username text;
begin
  select pr.display_name, pr.username into v_name, v_username
    from public.profiles pr where pr.id = new.follower_id;
  perform public.record_notification(
    new.followee_id, 'follow', new.follower_id, 'profile', new.follower_id,
    coalesce(v_name, v_username), v_username);
  return null;
end;
$$;

drop trigger if exists notify_on_follow on public.profile_follows;
create trigger notify_on_follow
  after insert on public.profile_follows
  for each row execute function public.notify_on_follow();

-- -----------------------------------------------------------------------------
-- A photograph clearing review
-- -----------------------------------------------------------------------------
-- No actor: who approved it is a moderation matter, and the member's business
-- is that their frame is up.
create or replace function public.notify_on_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform public.record_notification(
      new.owner_id, 'photograph_published', null, 'photograph', new.id, new.title, new.slug);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_on_publication on public.photographs;
create trigger notify_on_publication
  after update of status on public.photographs
  for each row execute function public.notify_on_publication();

-- -----------------------------------------------------------------------------
-- mark_notifications_read — the only write a member makes
-- -----------------------------------------------------------------------------
-- Passing null marks everything of theirs, which is what the "mark all read"
-- button asks for. It is scoped to the caller inside the function, so an id
-- belonging to somebody else simply matches no row.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  update public.notifications n
     set read_at = now()
   where n.recipient_id = v_me
     and n.read_at is null
     and (p_ids is null or n.id = any(p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_notification(uuid, text, uuid, text, uuid, text, text) from public;
revoke all on function public.notify_on_comment() from public;
revoke all on function public.notify_on_appreciation() from public;
revoke all on function public.notify_on_follow() from public;
revoke all on function public.notify_on_publication() from public;
revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

/* ------------------------------------------------------------------------ */
/* Privileges and row-level security                                          */
/* ------------------------------------------------------------------------ */

alter table public.profile_follows enable row level security;
alter table public.notifications enable row level security;

-- -----------------------------------------------------------------------------
-- Revoked first, then granted back deliberately
-- -----------------------------------------------------------------------------
-- This is the rule migration 0007 set out and the one these two tables have to
-- follow: a grant on its own is an ADDITION to whatever a default privilege
-- already left behind, not a statement of what a role may attempt.
--
-- This database has `alter default privileges in schema public grant all on
-- tables to anon, authenticated, service_role`, so every table arrives with
-- ALL privileges already granted to both roles. Granting SELECT on top of that
-- changes nothing, and the table is left with INSERT, UPDATE, DELETE and
-- TRUNCATE for anybody holding the public key. Row-level security still
-- refuses the first three where no policy admits them — but TRUNCATE is not
-- subject to row-level security at all, so it has to be revoked rather than
-- merely left unpoliced.
--
-- public.photograph_comments is in this list because migration 0022 granted
-- without revoking and shipped with the same gap; a later migration repairing
-- an earlier one is the honest fix, and the alternative is a comment in 0022
-- claiming a privilege that was never actually withheld.
revoke all on table
  public.profile_follows, public.notifications, public.photograph_comments
  from anon, authenticated;

-- Comments: readable by everyone, written and edited by members. No DELETE —
-- a comment is deleted through delete_comment(), which clears the body and
-- keeps the thread's shape.
grant select on table public.photograph_comments to anon, authenticated;
grant insert, update on table public.photograph_comments to authenticated;

-- Who follows whom is public: the counts are on every profile already, and a
-- follower list nobody can read is a count nobody can check.
grant select on table public.profile_follows to anon, authenticated;
grant insert, delete on table public.profile_follows to authenticated;
-- No UPDATE: a follow has nothing to change.

drop policy if exists profile_follows_select_all on public.profile_follows;
create policy profile_follows_select_all
  on public.profile_follows for select
  to anon, authenticated
  using (true);

drop policy if exists profile_follows_insert_own on public.profile_follows;
create policy profile_follows_insert_own
  on public.profile_follows for insert
  to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and not pr.is_suspended)
  );

drop policy if exists profile_follows_delete_own on public.profile_follows;
create policy profile_follows_delete_own
  on public.profile_follows for delete
  to authenticated
  using (follower_id = (select auth.uid()));

-- A notification is the recipient's and nobody else's: `anon` gets nothing at
-- all, and `authenticated` gets no INSERT and no DELETE, so the triggers above
-- are the only writer and a member cannot manufacture one for anybody —
-- themselves included. That is now true of the privileges as well as of the
-- policies, which is the point of the revoke above.
grant select, update on table public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- An update through the table may set read_at and nothing else, so "mark read"
-- cannot be turned into a way to rewrite what a notification said.
create or replace function public.notifications_read_only_read_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_id <> old.recipient_id or new.kind <> old.kind
     or new.actor_id is distinct from old.actor_id
     or new.subject_type <> old.subject_type or new.subject_id <> old.subject_id
     or new.subject_label <> old.subject_label
     or new.subject_slug is distinct from old.subject_slug
     or new.created_at <> old.created_at then
    raise exception 'A notification''s contents do not change.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_read_only_read_at on public.notifications;
create trigger notifications_read_only_read_at
  before update on public.notifications
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.notifications_read_only_read_at();
