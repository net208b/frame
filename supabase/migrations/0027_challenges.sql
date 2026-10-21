-- =============================================================================
-- FRAME — 0027  Monthly challenges
-- =============================================================================
-- Staff set a theme for a window of time; members enter their own published
-- photographs; when the window closes, editors choose — a winner, up to two
-- runners-up, up to five honourable mentions, each with a note — and publish
-- the result. Appreciation totals are shown beside the entries and decide
-- nothing: a vote is the shape every gamed contest takes, and the point of a
-- challenge here is the work, judged by people who look at it.
--
-- WHAT THE DATABASE GUARANTEES:
--
--   * One challenge at a time. Two windows may not overlap — an exclusion
--     constraint, not a convention.
--   * The rules of a challenge do not move once it has opened: its opening
--     time, entry allowance and new-work rule are frozen, and its closing time
--     may only be extended.
--   * An entry is the entrant's own PUBLISHED photograph, made while the
--     challenge is open, within the allowance. With "new work only" on, the
--     photograph's capture time — read from the file's EXIF at upload, not
--     typed by the member — must fall after the challenge opened. The check
--     reads the capture time even when the member chose not to publish it,
--     and reveals nothing about it beyond yes or no.
--   * An entry can be withdrawn while the challenge is open, and not after:
--     what the editors judge is what was entered.
--   * An award goes to an entry of that challenge (a composite foreign key),
--     only after it closes, only from staff, at most one winner, two
--     runners-up and five honourable mentions — and nothing changes once the
--     results are published.
--   * Awards are invisible to the public until publication, and publication
--     happens only through publish_challenge_results(), which tells every
--     awarded photographer.
--   * Every table is revoked first and granted back deliberately — the rule
--     the audit behind 0023–0026 kept finding missed.
-- =============================================================================

set search_path = public, extensions;

/* ------------------------------------------------------------------------ */
/* Tables                                                                     */
/* ------------------------------------------------------------------------ */

create table if not exists public.challenges (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique
                         constraint challenges_slug_shape
                         check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  -- Editorial copy is written by staff for everyone, so it comes in both
  -- languages rather than in whichever one the author happened to use.
  title_en             text not null constraint challenges_title_en_length check (char_length(btrim(title_en)) between 3 and 80),
  title_th             text not null constraint challenges_title_th_length check (char_length(btrim(title_th)) between 3 and 80),
  brief_en             text not null constraint challenges_brief_en_length check (char_length(btrim(brief_en)) between 20 and 1200),
  brief_th             text not null constraint challenges_brief_th_length check (char_length(btrim(brief_th)) between 20 and 1200),
  opens_at             timestamptz not null,
  closes_at            timestamptz not null,
  max_entries          smallint not null default 3
                         constraint challenges_max_entries_range check (max_entries between 1 and 5),
  requires_new_work    boolean not null default false,
  results_published_at timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint challenges_window_order check (closes_at > opens_at),
  constraint challenges_window_length
    check (closes_at - opens_at between interval '3 days' and interval '62 days'),
  -- One challenge at a time, half-open so one may close the instant the next opens.
  constraint challenges_no_overlap
    exclude using gist (tstzrange(opens_at, closes_at, '[)') with &&)
);

comment on table public.challenges is
  'A theme for a window of time. One at a time; its rules freeze when it opens; results are published once and then final.';

create table if not exists public.challenge_entries (
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  photograph_id uuid not null references public.photographs (id) on delete cascade,
  entrant_id    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, photograph_id)
);

create index if not exists challenge_entries_entrant_idx
  on public.challenge_entries (challenge_id, entrant_id);

create table if not exists public.challenge_awards (
  challenge_id  uuid not null,
  photograph_id uuid not null,
  award         text not null
                  constraint challenge_awards_award_allowed
                  check (award in ('winner', 'runner_up', 'honourable_mention')),
  note          text constraint challenge_awards_note_length check (note is null or char_length(note) <= 500),
  awarded_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (challenge_id, photograph_id),
  -- Only an entry can be awarded: the award is a fact about an entry, so it
  -- references one, and goes with it if the photograph is ever deleted.
  foreign key (challenge_id, photograph_id)
    references public.challenge_entries (challenge_id, photograph_id) on delete cascade
);

drop trigger if exists challenges_set_updated_at on public.challenges;
create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------------ */
/* Rules                                                                      */
/* ------------------------------------------------------------------------ */

-- Once a challenge has opened, its rules are what members entered under.
-- Copy may still be corrected; the window may be extended, never shortened;
-- published results are final; and the only way to publish them is the
-- function below, which sets a flag this trigger looks for.
create or replace function public.challenges_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.opens_at <= now() then
      raise exception 'A challenge that has opened cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.results_published_at is distinct from old.results_published_at
     and coalesce(current_setting('frame.publishing_results', true), '') <> 'on' then
    raise exception 'Results are published with publish_challenge_results(), and once published they are final.'
      using errcode = '42501';
  end if;

  if old.opens_at <= now() then
    if new.opens_at <> old.opens_at or new.max_entries <> old.max_entries
       or new.requires_new_work <> old.requires_new_work then
      raise exception 'A challenge''s rules are frozen once it has opened.' using errcode = '42501';
    end if;
    if new.closes_at < old.closes_at then
      raise exception 'An open challenge can be extended, not cut short.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists challenges_guard on public.challenges;
create trigger challenges_guard
  before update or delete on public.challenges
  for each row execute function public.challenges_guard();

-- What an entry has to be. SECURITY DEFINER because it reads the
-- photograph's capture time, which row-level security and the column grants
-- keep from other members, and the challenge row under a lock.
create or replace function public.challenge_entries_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_owner     uuid;
  v_status    text;
  v_captured  timestamptz;
  v_count     integer;
begin
  -- Locked, so two entries arriving together cannot both squeeze under the
  -- allowance.
  select * into v_challenge from public.challenges c where c.id = new.challenge_id for update;
  if not found then
    raise exception 'No such challenge.' using errcode = 'P0002';
  end if;
  if now() < v_challenge.opens_at or now() >= v_challenge.closes_at then
    raise exception 'This challenge is not open for entries.' using errcode = '42501';
  end if;

  select p.owner_id, p.status, p.captured_at into v_owner, v_status, v_captured
    from public.photographs p where p.id = new.photograph_id;
  if v_owner is distinct from new.entrant_id then
    raise exception 'Only your own photographs can be entered.' using errcode = '42501';
  end if;
  if v_status is distinct from 'published' then
    raise exception 'Only a published photograph can be entered.' using errcode = '42501';
  end if;

  if v_challenge.requires_new_work
     and (v_captured is null or v_captured < v_challenge.opens_at) then
    raise exception 'This challenge takes new work only: the photograph has to have been made after it opened.'
      using errcode = '23514';
  end if;

  select pg_catalog.count(*)::integer into v_count
    from public.challenge_entries e
   where e.challenge_id = new.challenge_id and e.entrant_id = new.entrant_id;
  if v_count >= v_challenge.max_entries then
    raise exception 'You have entered as many photographs as this challenge allows.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists challenge_entries_rules on public.challenge_entries;
create trigger challenge_entries_rules
  before insert on public.challenge_entries
  for each row execute function public.challenge_entries_rules();

-- What an award has to be: after the close, before publication, within the
-- numbers.
create or replace function public.challenge_awards_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_target    uuid := coalesce(new.challenge_id, old.challenge_id);
  v_count     integer;
  v_limit     integer;
begin
  -- A cascade — a photograph or an account being deleted, an awarding
  -- moderator's id going to null — is not an editorial decision. A member's
  -- right to delete their own work outranks a published result, and the
  -- award goes with the photograph.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  select * into v_challenge from public.challenges c where c.id = v_target for update;
  if v_challenge.results_published_at is not null then
    raise exception 'These results are published and final.' using errcode = '42501';
  end if;
  if now() < v_challenge.closes_at then
    raise exception 'Awards are given after a challenge closes.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  v_limit := case new.award when 'winner' then 1 when 'runner_up' then 2 else 5 end;
  select pg_catalog.count(*)::integer into v_count
    from public.challenge_awards a
   where a.challenge_id = new.challenge_id and a.award = new.award
     and a.photograph_id <> new.photograph_id;
  if v_count >= v_limit then
    raise exception 'This challenge already has as many of that award as it allows.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists challenge_awards_rules on public.challenge_awards;
create trigger challenge_awards_rules
  before insert or update or delete on public.challenge_awards
  for each row execute function public.challenge_awards_rules();

/* ------------------------------------------------------------------------ */
/* Publishing the results                                                     */
/* ------------------------------------------------------------------------ */

-- Notifications learn two new words: an award, and a challenge as the thing a
-- notification links to.
alter table public.notifications
  drop constraint if exists notifications_kind_allowed,
  add constraint notifications_kind_allowed
    check (kind in ('comment', 'reply', 'appreciation', 'follow', 'photograph_published', 'challenge_award'));
alter table public.notifications
  drop constraint if exists notifications_subject_type_allowed,
  add constraint notifications_subject_type_allowed
    check (subject_type in ('photograph', 'profile', 'comment', 'challenge'));

create or replace function public.publish_challenge_results(p_challenge_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges;
  v_award     record;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only staff publish challenge results.' using errcode = '42501';
  end if;

  select * into v_challenge from public.challenges c where c.id = p_challenge_id for update;
  if not found then
    raise exception 'No such challenge.' using errcode = 'P0002';
  end if;
  if v_challenge.results_published_at is not null then
    raise exception 'These results are already published.' using errcode = '42501';
  end if;
  if now() < v_challenge.closes_at then
    raise exception 'A challenge''s results are published after it closes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.challenge_awards a
                  where a.challenge_id = p_challenge_id and a.award = 'winner') then
    raise exception 'Choose a winner before publishing.' using errcode = '23514';
  end if;

  perform set_config('frame.publishing_results', 'on', true);
  update public.challenges set results_published_at = now() where id = p_challenge_id;
  perform set_config('frame.publishing_results', '', true);

  -- Every awarded photographer hears about it. The label is the photograph's
  -- title, which reads the same in either language; the link is the challenge.
  for v_award in
    select e.entrant_id, p.title
      from public.challenge_awards a
      join public.challenge_entries e
        on e.challenge_id = a.challenge_id and e.photograph_id = a.photograph_id
      join public.photographs p on p.id = a.photograph_id
     where a.challenge_id = p_challenge_id
  loop
    perform public.record_notification(
      v_award.entrant_id, 'challenge_award', null, 'challenge', p_challenge_id,
      v_award.title, v_challenge.slug);
  end loop;

  return now();
end;
$$;

/* ------------------------------------------------------------------------ */
/* A member's own capture times                                               */
/* ------------------------------------------------------------------------ */

-- The entry panel marks which of a member's photographs a new-work challenge
-- would refuse, so it needs their capture times — their own, and only their
-- own. Read through this function rather than the column because the column
-- should not stay readable: today any caller can read photographs.captured_at
-- even where the owner chose not to publish it, and the fix for that will
-- take the column away from the public roles. This is the way in that
-- survives it.
create or replace function public.own_photograph_capture_times(p_ids uuid[])
returns table (photograph_id uuid, captured_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.captured_at
    from public.photographs p
   where p.id = any (p_ids)
     and p.owner_id = (select auth.uid())
$$;

revoke all on function public.own_photograph_capture_times(uuid[]) from public, anon;
grant execute on function public.own_photograph_capture_times(uuid[]) to authenticated;

/* ------------------------------------------------------------------------ */
/* Privileges — revoked first, then granted back deliberately                 */
/* ------------------------------------------------------------------------ */

alter table public.challenges        enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.challenge_awards  enable row level security;

revoke all on table public.challenges, public.challenge_entries, public.challenge_awards
  from anon, authenticated;

grant select on table public.challenges, public.challenge_entries, public.challenge_awards
  to anon, authenticated;
grant insert, update, delete on table public.challenges to authenticated;
grant insert, delete on table public.challenge_entries to authenticated;
grant insert, update, delete on table public.challenge_awards to authenticated;

revoke all on function public.challenges_guard() from public, anon, authenticated;
revoke all on function public.challenge_entries_rules() from public, anon, authenticated;
revoke all on function public.challenge_awards_rules() from public, anon, authenticated;
revoke all on function public.publish_challenge_results(uuid) from public, anon;
grant execute on function public.publish_challenge_results(uuid) to authenticated;

-- Challenges: everybody reads them; staff write them.
drop policy if exists challenges_select_all on public.challenges;
create policy challenges_select_all on public.challenges
  for select to anon, authenticated using (true);

drop policy if exists challenges_write_staff on public.challenges;
create policy challenges_write_staff on public.challenges
  for all to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- Entries: public while the photograph is; the entrant and staff see their
-- own regardless, so a photograph taken down does not vanish from the
-- entrant's view of what they entered.
drop policy if exists challenge_entries_select_visible on public.challenge_entries;
create policy challenge_entries_select_visible on public.challenge_entries
  for select to anon, authenticated
  using (
    exists (select 1 from public.photographs p where p.id = photograph_id and p.status = 'published')
    or entrant_id = (select auth.uid())
    or public.is_moderator()
  );

drop policy if exists challenge_entries_insert_own on public.challenge_entries;
create policy challenge_entries_insert_own on public.challenge_entries
  for insert to authenticated
  with check (
    entrant_id = (select auth.uid())
    and exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and not pr.is_suspended)
  );

drop policy if exists challenge_entries_delete_own_while_open on public.challenge_entries;
create policy challenge_entries_delete_own_while_open on public.challenge_entries
  for delete to authenticated
  using (
    entrant_id = (select auth.uid())
    and exists (select 1 from public.challenges c
                 where c.id = challenge_id and now() >= c.opens_at and now() < c.closes_at)
  );

-- Awards: public once published; staff before that.
drop policy if exists challenge_awards_select_published on public.challenge_awards;
create policy challenge_awards_select_published on public.challenge_awards
  for select to anon, authenticated
  using (
    exists (select 1 from public.challenges c
             where c.id = challenge_id and c.results_published_at is not null)
    or public.is_moderator()
  );

drop policy if exists challenge_awards_write_staff on public.challenge_awards;
create policy challenge_awards_write_staff on public.challenge_awards
  for all to authenticated
  using (public.is_moderator())
  with check (public.is_moderator() and awarded_by = (select auth.uid()));
