-- =============================================================================
-- FRAME — 0019  The photobook shelf: more than one book per member
-- =============================================================================
-- 0018 allowed one book per member and said, in so many words, that lifting
-- that later would be one `drop constraint` while adding it later would mean
-- deciding what to do with members who already had two. This is the lift.
--
-- WHAT CHANGES
--
--   * The unique on owner_id goes. A member may bind several books: a city, a
--     year, a project each get their own.
--   * A cap of TWELVE books per member, enforced by a trigger on insert — the
--     same shape as the 24-page cap on photobook_pages. Twelve is a shelf; a
--     hundred is a warehouse, and a profile is not that.
--   * `position`, so the owner decides the order the shelf shows them in.
--     1..12, defaulting to 1; the application appends new books at the end
--     and the shelf orders by position, then by creation. It is NOT unique per
--     owner on purpose: a reorder written as several single-row updates would
--     otherwise trip over itself halfway through.
--
-- WHAT DOES NOT CHANGE: a page is still the owner's own published photograph,
-- a book still holds at most 24, slugs are still unique across the site so
-- every pasted /b/<slug> link keeps working, and nothing here touches a row
-- that already exists except to give it position 1.
-- =============================================================================

set search_path = public, extensions;

alter table public.photobooks
  drop constraint if exists photobooks_one_per_owner;

alter table public.photobooks
  add column if not exists position integer not null default 1;

alter table public.photobooks
  drop constraint if exists photobooks_position_range;
alter table public.photobooks
  add constraint photobooks_position_range check (position between 1 and 12);

comment on table public.photobooks is
  'A member''s published photographs bound as a book, under a cover preset, at a shareable address. Up to twelve per member — photobooks_at_most_twelve.';
comment on column public.photobooks.position is
  'Where the book sits on the owner''s shelf, 1..12. Not unique per owner, so a reorder can be written row by row.';

-- -----------------------------------------------------------------------------
-- photobooks_at_most_twelve
-- -----------------------------------------------------------------------------
create or replace function public.photobooks_at_most_twelve()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.photobooks b where b.owner_id = new.owner_id) >= 12 then
    raise exception 'A member may bind at most twelve photobooks.' using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.photobooks_at_most_twelve() is
  'Refuses a thirteenth photobook for the same owner. The shelf has twelve slots.';

drop trigger if exists photobooks_at_most_twelve on public.photobooks;
create trigger photobooks_at_most_twelve
  before insert on public.photobooks
  for each row execute function public.photobooks_at_most_twelve();

-- The shelf reads one owner's books in order; the profile and Settings both
-- ask for exactly this.
create index if not exists photobooks_owner_position_idx
  on public.photobooks (owner_id, position, created_at);
