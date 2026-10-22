-- -----------------------------------------------------------------------------
-- 0045 — a photograph says how it was made, in the words a photographer already uses
-- -----------------------------------------------------------------------------
-- A photograph has had a `category` since 0003 — its subject, one value, chosen
-- at upload — and a photographer has had `style_tags` since 0016: how they
-- work, from a closed set of eight words. What a photograph could not say was
-- how IT was made. "Black and white" is not a subject, and a member who shoots
-- colour and black and white both had no way to mark which was which.
--
-- THE VOCABULARY IS THE ONE THAT ALREADY EXISTS, and that is the whole design.
-- 0016's eight words — black-and-white, colour, film, candid, flash, minimal,
-- geometry, layered — describe how a frame was made just as well as how a
-- photographer works, because that is what makes them a closed set rather than
-- a tag cloud. "I shoot black and white" and "this frame is black and white"
-- are the same word, and a second parallel vocabulary for photographs would
-- have been two lists to keep in step and two labels to translate for one idea.
--
-- WHAT THIS DOES NOT MERGE. `category` stays exactly what it was: the subject,
-- one value, and the thing the Discover chips filter by. domain.ts is explicit
-- that subject and style are different axes, and they still are — a frame can
-- be `street` in category and `black-and-white, flash` in style, and neither
-- answer substitutes for the other. The brief's "Architecture & Urban Life" is
-- a SUBJECT and is already two category values; it gets no style here, which is
-- the point of keeping the axes apart.

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- photographs.styles
-- -----------------------------------------------------------------------------
alter table public.photographs
  add column if not exists styles text[] not null default '{}';

comment on column public.photographs.styles is
  'How the frame was made, from the same closed set as profiles.style_tags (0016). Not its subject — that is `category`, and the two are different axes on purpose.';

-- An array with a CHECK rather than an enum, for 0001''s reason: adding a value
-- to an enum is a migration that cannot be rolled back inside a transaction,
-- while a CHECK is replaced like any other constraint. Bounded and
-- de-duplicated by the same helper 0016 wrote for style_tags, so one rule about
-- arrays of chosen words is enforced the same way in both places.
alter table public.photographs
  drop constraint if exists photographs_styles_allowed,
  add constraint photographs_styles_allowed
    check (cardinality(styles) <= 5
           and public.text_items_distinct(styles)
           and styles <@ array[
             'black-and-white', 'colour', 'film', 'candid',
             'flash', 'minimal', 'geometry', 'layered'
           ]::text[]);

-- -----------------------------------------------------------------------------
-- The two indexes this makes necessary
-- -----------------------------------------------------------------------------
-- A containment query over an array needs GIN; a btree is no use to `&&`.
-- Partial on both, because the empty array is the default and most rows will
-- keep it until members start marking their work.
create index if not exists photographs_styles_idx
  on public.photographs using gin (styles)
  where cardinality(styles) > 0;

-- The one 0016 never added. `profiles.style_tags` has been filterable in
-- principle since it existed and has never been filtered, so nothing noticed;
-- the photographer facet added alongside this migration does filter it.
create index if not exists profiles_style_tags_idx
  on public.profiles using gin (style_tags)
  where cardinality(style_tags) > 0;

-- -----------------------------------------------------------------------------
-- Who may read it
-- -----------------------------------------------------------------------------
-- Everyone: it is shown on the photograph's own page and filtered on in
-- Discover. `photographs` has carried a column-level grant since 0029, so a new
-- column is invisible until it is named.
--
-- ONE COLUMN, ADDED. Not the whole list restated, which is what 0029 and 0015
-- both do and what 0044 did an hour ago. Column grants are additive, so naming
-- one column cannot disturb another — while restating a list replaces it, and
-- the list in 0029 is already out of date: `editors_picked_at` was granted
-- later by 0030 and does not appear in it. Copying 0029's list forward would
-- have silently revoked a column the editorial pages read. Verified against the
-- live schema before writing this, which is the only way that was visible.
--
-- `opens` (0042) and `captured_at` (0028) stay withheld, untouched by this.
grant select (styles) on table public.photographs to anon, authenticated;
