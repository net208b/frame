-- =============================================================================
-- FRAME — 0022  Comments: talking about a photograph, in a thread
-- =============================================================================
-- A member can say something under a published photograph, and reply to what
-- somebody else said. One level of replies, on purpose: a comment and the
-- answers to it. Deeper nesting is a forum, and on a phone it is unreadable.
--
-- WHAT THE DATABASE GUARANTEES, because a member can write their own rows with
-- the public key and the form is only a courtesy:
--
--   * Only a signed-in, unsuspended member writes, and only as themselves.
--   * Only under a PUBLISHED photograph. A draft and a removed photograph take
--     no comments; a photograph later removed takes its thread with it.
--   * A reply points at a top-level comment of the SAME photograph. A reply to
--     a reply, or to a comment under another photograph, is refused.
--   * Body is plain text, 1..1000 characters. The reader sets it as text and
--     nothing else, so nothing typed can become markup.
--   * The author edits their own words; nobody else does. Editing marks the
--     row as edited.
--   * Deleting CLEARS the body. The row stays so the thread keeps its shape
--     ("this comment was deleted"), and nothing of what was said remains.
--   * Hiding is the photograph's owner's and a moderator's. A hidden comment
--     is readable by its author, the owner and moderators — row-level
--     security, not a flag the page is trusted to honour. A moderator's hide is
--     written to moderation_actions, with a reason, as every moderator
--     decision is.
--   * comment_count on photographs is recounted from the rows, never
--     incremented, so it cannot drift whichever path wrote them.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.photograph_comments (
  id             uuid primary key default gen_random_uuid(),
  photograph_id  uuid not null references public.photographs (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  -- A reply's parent. Must be a top-level comment of the same photograph —
  -- photograph_comments_reply_rules.
  parent_id      uuid references public.photograph_comments (id) on delete cascade,
  body           text not null
                   constraint photograph_comments_body_length check (char_length(body) <= 1000),
  edited_at      timestamptz,
  deleted_at     timestamptz,
  hidden_at      timestamptz,
  hidden_by      uuid references public.profiles (id) on delete set null,
  hidden_reason  text constraint photograph_comments_hidden_reason_length check (hidden_reason is null or char_length(hidden_reason) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A live comment says something; a deleted one says nothing at all.
  constraint photograph_comments_body_present
    check (deleted_at is not null or char_length(btrim(body)) > 0),
  constraint photograph_comments_deleted_is_empty
    check (deleted_at is null or body = '')
);

comment on table public.photograph_comments is
  'What members say under a published photograph. One level of replies. Deleted rows keep their place with an empty body; hidden rows are read only by the author, the owner and moderators.';

create index if not exists photograph_comments_photograph_idx
  on public.photograph_comments (photograph_id, created_at);
create index if not exists photograph_comments_parent_idx
  on public.photograph_comments (parent_id);

alter table public.photographs
  add column if not exists comment_count integer not null default 0
    constraint photographs_comment_count_non_negative check (comment_count >= 0);

drop trigger if exists photograph_comments_set_updated_at on public.photograph_comments;
create trigger photograph_comments_set_updated_at
  before update on public.photograph_comments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- photograph_comments_reply_rules — published photograph, one level of replies
-- -----------------------------------------------------------------------------
create or replace function public.photograph_comments_reply_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_parent_photograph uuid;
  v_parent_parent uuid;
begin
  select p.status into v_status from public.photographs p where p.id = new.photograph_id;
  if v_status is distinct from 'published' then
    raise exception 'Comments are for published photographs.' using errcode = '42501';
  end if;

  if new.parent_id is not null then
    select c.photograph_id, c.parent_id into v_parent_photograph, v_parent_parent
      from public.photograph_comments c where c.id = new.parent_id;
    if v_parent_photograph is null or v_parent_photograph <> new.photograph_id then
      raise exception 'A reply belongs to a comment under the same photograph.' using errcode = '23514';
    end if;
    if v_parent_parent is not null then
      raise exception 'A reply answers a comment, not another reply.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists photograph_comments_reply_rules on public.photograph_comments;
create trigger photograph_comments_reply_rules
  before insert on public.photograph_comments
  for each row execute function public.photograph_comments_reply_rules();

-- -----------------------------------------------------------------------------
-- recount_photograph_comments — the summary follows the rows
-- -----------------------------------------------------------------------------
-- Live comments only: deleted and hidden ones are not part of the number a
-- card shows.
create or replace function public.recount_photograph_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photograph uuid := coalesce(new.photograph_id, old.photograph_id);
begin
  update public.photographs
     set comment_count = (
       select count(*) from public.photograph_comments c
        where c.photograph_id = v_photograph
          and c.deleted_at is null and c.hidden_at is null)
   where id = v_photograph;
  return null;
end;
$$;

drop trigger if exists recount_photograph_comments on public.photograph_comments;
create trigger recount_photograph_comments
  after insert or update or delete on public.photograph_comments
  for each row execute function public.recount_photograph_comments();

-- -----------------------------------------------------------------------------
-- The two writes that are not the author's own words: delete and hide.
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so they can read the photograph's owner and the caller's
-- role; each checks the caller itself and writes one row.

create or replace function public.delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_owner uuid;
begin
  select c.author_id, p.owner_id into v_author, v_owner
    from public.photograph_comments c
    join public.photographs p on p.id = c.photograph_id
   where c.id = p_id;
  if v_author is null then
    raise exception 'No such comment.' using errcode = 'P0002';
  end if;
  -- The author, the photograph's owner, or a moderator.
  if (select auth.uid()) is distinct from v_author
     and (select auth.uid()) is distinct from v_owner
     and not public.is_moderator() then
    raise exception 'Only the author, the photograph''s owner or a moderator may delete a comment.'
      using errcode = '42501';
  end if;
  update public.photograph_comments
     set body = '', deleted_at = now()
   where id = p_id and deleted_at is null;
end;
$$;

create or replace function public.hide_comment(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_moderator boolean := public.is_moderator();
begin
  select p.owner_id into v_owner
    from public.photograph_comments c
    join public.photographs p on p.id = c.photograph_id
   where c.id = p_id;
  if v_owner is null then
    raise exception 'No such comment.' using errcode = 'P0002';
  end if;
  if (select auth.uid()) is distinct from v_owner and not v_moderator then
    raise exception 'Only the photograph''s owner or a moderator may hide a comment.'
      using errcode = '42501';
  end if;
  update public.photograph_comments
     set hidden_at = now(), hidden_by = (select auth.uid()), hidden_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_id and hidden_at is null;
  -- A moderator's decision is on the record, with its reason, like every other.
  if v_moderator and (select auth.uid()) is distinct from v_owner then
    insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
    values ('remove_content', 'comment', p_id,
            coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Comment hidden.'),
            (select auth.uid()));
  end if;
end;
$$;

revoke all on function public.delete_comment(uuid) from public;
revoke all on function public.hide_comment(uuid, text) from public;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.hide_comment(uuid, text) to authenticated;

-- A comment is something a member can report, and something a moderator's
-- record can be about.
alter table public.reports
  drop constraint if exists reports_subject_type_allowed,
  add constraint reports_subject_type_allowed
    check (subject_type in ('photograph', 'location', 'profile', 'collection', 'comment'));

alter table public.moderation_actions
  drop constraint if exists moderation_actions_subject_type_allowed,
  add constraint moderation_actions_subject_type_allowed
    check (subject_type in ('photograph', 'location', 'profile', 'collection', 'location_submission', 'comment'));

-- -----------------------------------------------------------------------------
-- Privileges and row-level security
-- -----------------------------------------------------------------------------
alter table public.photograph_comments enable row level security;

grant select on table public.photograph_comments to anon, authenticated;
grant insert, update on table public.photograph_comments to authenticated;
-- No DELETE grant: a comment is deleted through delete_comment(), which clears
-- the body and keeps the thread's shape.

-- Readable by everyone unless hidden; a hidden one by its author, the
-- photograph's owner and moderators.
drop policy if exists photograph_comments_select_visible on public.photograph_comments;
create policy photograph_comments_select_visible
  on public.photograph_comments for select
  to anon, authenticated
  using (
    hidden_at is null
    or author_id = (select auth.uid())
    or public.is_moderator()
    or exists (select 1 from public.photographs p where p.id = photograph_id and p.owner_id = (select auth.uid()))
  );

-- Written as oneself, by an account that is not suspended.
drop policy if exists photograph_comments_insert_own on public.photograph_comments;
create policy photograph_comments_insert_own
  on public.photograph_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and not pr.is_suspended)
  );

-- The author edits their own live words. Delete and hide go through the
-- functions above, which is why this policy also pins every other column.
drop policy if exists photograph_comments_update_own on public.photograph_comments;
create policy photograph_comments_update_own
  on public.photograph_comments for update
  to authenticated
  using (author_id = (select auth.uid()) and deleted_at is null and hidden_at is null)
  with check (author_id = (select auth.uid()) and deleted_at is null and hidden_at is null);

-- An edit through the table may change the body and nothing else.
create or replace function public.photograph_comments_edit_only_body()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.photograph_id <> old.photograph_id or new.author_id <> old.author_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'A comment''s photograph, author, parent and date do not change.' using errcode = '42501';
  end if;
  if new.body <> old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists photograph_comments_edit_only_body on public.photograph_comments;
create trigger photograph_comments_edit_only_body
  before update on public.photograph_comments
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.photograph_comments_edit_only_body();
