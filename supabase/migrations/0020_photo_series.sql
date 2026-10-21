-- =============================================================================
-- FRAME — 0020  Photo series: a few frames and the words around them
-- =============================================================================
-- A series is the third kind of thing a member makes out of their published
-- photographs. A collection is a working list; a photobook is a bound object
-- you open; a series is an ESSAY — three to ten frames in an order, with a
-- title, a standfirst and a body of plain paragraphs, read straight on the
-- page. It has an address meant to be sent, like a book, and the same two
-- visibilities.
--
-- WHAT THE DATABASE GUARANTEES, because a member can write their own rows with
-- the public key and the form is only a courtesy:
--
--   * An item is one of the owner's OWN PUBLISHED photographs — a trigger, as
--     a CHECK cannot look at another table. The same rule as photobook pages
--     and the profile cover, for the same reason.
--   * At most 10 items per series, enforced on insert. (The minimum of 3 is
--     the editor's rule, as the book's minimum of 4 is: a database cannot
--     refuse an item for being the first.)
--   * At most 24 series per member, the shelf-cap pattern from 0019.
--   * The cover, when set, is one of the series' own items' photographs — the
--     same trigger shape again.
--   * Text lengths: title 1..80, standfirst ≤ 200, body ≤ 4000, caption ≤ 240.
--     Plain text only; the reader renders paragraphs, never HTML.
--   * Visibility is `public` or `unlisted`. No `private`, as for books.
--
-- `opens` is bumped by the server when the series page is served. A number,
-- not a record of who.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.photo_series (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  slug                 text not null unique
                         constraint photo_series_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title                text not null
                         constraint photo_series_title_length check (char_length(btrim(title)) between 1 and 80),
  standfirst           text
                         constraint photo_series_standfirst_length check (standfirst is null or char_length(standfirst) <= 200),
  body                 text not null default ''
                         constraint photo_series_body_length check (char_length(body) <= 4000),
  cover_photograph_id  uuid references public.photographs (id) on delete set null,
  visibility           text not null default 'unlisted'
                         constraint photo_series_visibility_allowed check (visibility in ('public', 'unlisted')),
  opens                integer not null default 0
                         constraint photo_series_opens_non_negative check (opens >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.photo_series is
  'A few of one member''s published photographs with the words around them, read on the page. Up to 24 per member — photo_series_at_most_twenty_four.';
comment on column public.photo_series.body is
  'Plain paragraphs separated by blank lines. Never HTML; the reader escapes it and sets it in paragraphs.';
comment on column public.photo_series.cover_photograph_id is
  'The frame that stands for the series on cards and share images. Must be one of its own items — photo_series_cover_must_be_an_item.';

create table if not exists public.photo_series_items (
  series_id      uuid not null references public.photo_series (id) on delete cascade,
  photograph_id  uuid not null references public.photographs (id) on delete cascade,
  position       integer not null
                   constraint photo_series_items_position_range check (position between 1 and 10),
  caption        text
                   constraint photo_series_items_caption_length check (caption is null or char_length(caption) <= 240),
  primary key (series_id, position),
  constraint photo_series_items_unique_photograph unique (series_id, photograph_id)
);

comment on table public.photo_series_items is
  'The frames in a series, in order, each with an optional caption. Each must be the owner''s own published photograph — photo_series_items_must_be_own_published.';

drop trigger if exists photo_series_set_updated_at on public.photo_series;
create trigger photo_series_set_updated_at
  before update on public.photo_series
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- photo_series_at_most_twenty_four
-- -----------------------------------------------------------------------------
create or replace function public.photo_series_at_most_twenty_four()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.photo_series s where s.owner_id = new.owner_id) >= 24 then
    raise exception 'A member may keep at most twenty-four series.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists photo_series_at_most_twenty_four on public.photo_series;
create trigger photo_series_at_most_twenty_four
  before insert on public.photo_series
  for each row execute function public.photo_series_at_most_twenty_four();

-- -----------------------------------------------------------------------------
-- photo_series_items_must_be_own_published
-- -----------------------------------------------------------------------------
create or replace function public.photo_series_items_must_be_own_published()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select s.owner_id into v_owner from public.photo_series s where s.id = new.series_id;

  if not exists (
    select 1 from public.photographs p
     where p.id = new.photograph_id
       and p.owner_id = v_owner
       and p.status = 'published'
  ) then
    raise exception 'A series item must be one of your own published photographs.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.photo_series_items i where i.series_id = new.series_id) >= 10 then
    raise exception 'A series holds at most 10 frames.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists photo_series_items_must_be_own_published on public.photo_series_items;
create trigger photo_series_items_must_be_own_published
  before insert or update on public.photo_series_items
  for each row execute function public.photo_series_items_must_be_own_published();

-- -----------------------------------------------------------------------------
-- photo_series_cover_must_be_an_item
-- -----------------------------------------------------------------------------
-- Checked on update only: the cover is set after the items are written, and a
-- fresh row has no items yet. A cover naming a photograph that is not one of
-- the series' items is refused; the editor sets it last for this reason.
create or replace function public.photo_series_cover_must_be_an_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cover_photograph_id is not null
     and not exists (
       select 1 from public.photo_series_items i
        where i.series_id = new.id and i.photograph_id = new.cover_photograph_id
     ) then
    raise exception 'The cover of a series must be one of its own frames.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists photo_series_cover_must_be_an_item on public.photo_series;
create trigger photo_series_cover_must_be_an_item
  before update of cover_photograph_id on public.photo_series
  for each row execute function public.photo_series_cover_must_be_an_item();

-- -----------------------------------------------------------------------------
-- bump_series_opens — the one write a visitor causes
-- -----------------------------------------------------------------------------
create or replace function public.bump_series_opens(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.photo_series set opens = opens + 1 where slug = p_slug;
$$;

revoke all on function public.bump_series_opens(text) from public;
grant execute on function public.bump_series_opens(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Privileges and row-level security
-- -----------------------------------------------------------------------------
alter table public.photo_series       enable row level security;
alter table public.photo_series_items enable row level security;

grant select on table public.photo_series, public.photo_series_items to anon, authenticated;
grant insert, update, delete on table public.photo_series, public.photo_series_items to authenticated;

drop policy if exists photo_series_select_viewable on public.photo_series;
create policy photo_series_select_viewable
  on public.photo_series for select
  to anon, authenticated
  using (visibility in ('public', 'unlisted') or owner_id = (select auth.uid()));

drop policy if exists photo_series_insert_own on public.photo_series;
create policy photo_series_insert_own
  on public.photo_series for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists photo_series_update_own on public.photo_series;
create policy photo_series_update_own
  on public.photo_series for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists photo_series_delete_own on public.photo_series;
create policy photo_series_delete_own
  on public.photo_series for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.owns_series(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.photo_series s where s.id = p_id and s.owner_id = (select auth.uid()));
$$;

drop policy if exists photo_series_items_select_with_series on public.photo_series_items;
create policy photo_series_items_select_with_series
  on public.photo_series_items for select
  to anon, authenticated
  using (exists (select 1 from public.photo_series s where s.id = series_id));

drop policy if exists photo_series_items_write_owner on public.photo_series_items;
create policy photo_series_items_write_owner
  on public.photo_series_items for all
  to authenticated
  using (public.owns_series(series_id))
  with check (public.owns_series(series_id));

create index if not exists photo_series_items_photograph_id_idx on public.photo_series_items (photograph_id);
create index if not exists photo_series_owner_updated_idx on public.photo_series (owner_id, updated_at desc);
