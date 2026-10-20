-- =============================================================================
-- FRAME — 0018  Photobooks: a member's published frames, bound as a book
-- =============================================================================
-- A photobook is not a collection. A collection is a working list — private
-- by default, mixing photographs and places, open-ended. A photobook is a
-- finished object: one member's own published photographs, in an order they
-- chose, under a cover they chose, with an address meant to be pasted into a
-- bio. The two share a shape (a row and its items) and nothing else, which is
-- why this is its own pair of tables rather than a flag on collections.
--
-- WHAT THE DATABASE GUARANTEES, because a member can write their own rows with
-- the public key and the form is only a courtesy:
--
--   * A page is one of the owner's OWN PUBLISHED photographs — checked by a
--     trigger, as a CHECK cannot look at another table. The same rule as the
--     profile cover (0017), for the same reason.
--   * At most 24 pages per book, enforced by a trigger on insert.
--   * One book per member for now (unique on owner_id). Lifting that later is
--     one `drop constraint`; adding it later would mean deciding what to do
--     with members who already have two.
--   * Visibility is `public` or `unlisted`. There is no `private`: a book
--     nobody can open is not what this feature is for, and `unlisted` already
--     keeps it off the profile tab and out of the sitemap.
--   * The cover and paper presets are closed vocabularies, kept in step with
--     PHOTOBOOK_COVERS / PHOTOBOOK_PAPERS in src/types/domain.ts.
--
-- `opens` is a count the server bumps when the book page is served. It is the
-- one thing a visitor leaves behind, and it is a number, not a record.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.photobooks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  slug          text not null unique
                  constraint photobooks_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null
                  constraint photobooks_title_length check (char_length(btrim(title)) between 1 and 60),
  dedication    text
                  constraint photobooks_dedication_length check (dedication is null or char_length(dedication) <= 160),
  cover_preset  text not null default 'linen'
                  constraint photobooks_cover_preset_allowed check (cover_preset in (
                    'linen', 'darkroom', 'kraft', 'gallery', 'signal',
                    'contact', 'zine', 'archive', 'monolith', 'mat',
                    'ticket', 'film', 'newsprint', 'blueprint', 'label')),
  paper_preset  text not null default 'lustre'
                  constraint photobooks_paper_preset_allowed check (paper_preset in ('matte', 'lustre', 'fineart')),
  -- The gear line on the cover: words in the cover's own type, never a logo.
  gear_mode     text not null default 'none'
                  constraint photobooks_gear_mode_allowed check (gear_mode in ('none', 'brand', 'model')),
  gear_brand    text
                  constraint photobooks_gear_brand_length check (gear_brand is null or char_length(btrim(gear_brand)) between 1 and 30),
  gear_model    text
                  constraint photobooks_gear_model_length check (gear_model is null or char_length(btrim(gear_model)) between 1 and 30),
  visibility    text not null default 'unlisted'
                  constraint photobooks_visibility_allowed check (visibility in ('public', 'unlisted')),
  opens         integer not null default 0
                  constraint photobooks_opens_non_negative check (opens >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint photobooks_one_per_owner unique (owner_id)
);

comment on table public.photobooks is
  'One member''s published photographs bound as a book, under a cover preset, at a shareable address. One per member for now.';
comment on column public.photobooks.visibility is
  'public: on the profile tab and in the sitemap. unlisted: anyone with the link. There is no private — see 0018.';
comment on column public.photobooks.opens is
  'Bumped by bump_photobook_opens() when the book page is served. A count, not a record of who.';

create table if not exists public.photobook_pages (
  photobook_id  uuid not null references public.photobooks (id) on delete cascade,
  photograph_id uuid not null references public.photographs (id) on delete cascade,
  position      integer not null
                  constraint photobook_pages_position_range check (position between 1 and 24),
  primary key (photobook_id, position),
  constraint photobook_pages_unique_photograph unique (photobook_id, photograph_id)
);

comment on table public.photobook_pages is
  'The frames in a photobook, in order. Each must be the owner''s own published photograph — photobook_pages_must_be_own_published.';

drop trigger if exists photobooks_set_updated_at on public.photobooks;
create trigger photobooks_set_updated_at
  before update on public.photobooks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- photobook_pages_must_be_own_published
-- -----------------------------------------------------------------------------
create or replace function public.photobook_pages_must_be_own_published()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select b.owner_id into v_owner from public.photobooks b where b.id = new.photobook_id;

  if not exists (
    select 1 from public.photographs p
     where p.id = new.photograph_id
       and p.owner_id = v_owner
       and p.status = 'published'
  ) then
    raise exception 'A photobook page must be one of your own published photographs.'
      using errcode = '42501';
  end if;

  if (select count(*) from public.photobook_pages g where g.photobook_id = new.photobook_id) >= 24
     and tg_op = 'INSERT' then
    raise exception 'A photobook holds at most 24 pages.' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.photobook_pages_must_be_own_published() is
  'Refuses a page that is not the book owner''s own published photograph, and a twenty-fifth page.';

drop trigger if exists photobook_pages_must_be_own_published on public.photobook_pages;
create trigger photobook_pages_must_be_own_published
  before insert or update on public.photobook_pages
  for each row execute function public.photobook_pages_must_be_own_published();

-- -----------------------------------------------------------------------------
-- bump_photobook_opens — the one write a visitor causes
-- -----------------------------------------------------------------------------
-- Called by the server when it serves a book page. SECURITY DEFINER so the
-- anonymous role, which has no UPDATE on photobooks, can still count; it
-- touches nothing but the counter of a book that is actually viewable.
create or replace function public.bump_photobook_opens(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.photobooks set opens = opens + 1 where slug = p_slug;
$$;

revoke all on function public.bump_photobook_opens(text) from public;
grant execute on function public.bump_photobook_opens(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Privileges and row-level security
-- -----------------------------------------------------------------------------
alter table public.photobooks      enable row level security;
alter table public.photobook_pages enable row level security;

grant select on table public.photobooks, public.photobook_pages to anon, authenticated;
grant insert, update, delete on table public.photobooks, public.photobook_pages to authenticated;

-- Readable when public or unlisted — both are "anyone with the link" — or
-- the reader's own. The distinction between the two is where the book is
-- listed, which is the repository's business, not a reading permission.
drop policy if exists photobooks_select_viewable on public.photobooks;
create policy photobooks_select_viewable
  on public.photobooks for select
  to anon, authenticated
  using (visibility in ('public', 'unlisted') or owner_id = (select auth.uid()));

drop policy if exists photobooks_insert_own on public.photobooks;
create policy photobooks_insert_own
  on public.photobooks for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists photobooks_update_own on public.photobooks;
create policy photobooks_update_own
  on public.photobooks for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists photobooks_delete_own on public.photobooks;
create policy photobooks_delete_own
  on public.photobooks for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.owns_photobook(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.photobooks b where b.id = p_id and b.owner_id = (select auth.uid()));
$$;

drop policy if exists photobook_pages_select_with_book on public.photobook_pages;
create policy photobook_pages_select_with_book
  on public.photobook_pages for select
  to anon, authenticated
  using (exists (select 1 from public.photobooks b where b.id = photobook_id));

drop policy if exists photobook_pages_write_owner on public.photobook_pages;
create policy photobook_pages_write_owner
  on public.photobook_pages for all
  to authenticated
  using (public.owns_photobook(photobook_id))
  with check (public.owns_photobook(photobook_id));

create index if not exists photobook_pages_photograph_id_idx on public.photobook_pages (photograph_id);
