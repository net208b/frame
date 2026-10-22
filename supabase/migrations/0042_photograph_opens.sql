-- -----------------------------------------------------------------------------
-- 0042 — how many times a photograph was opened. A number, not a record of who.
-- -----------------------------------------------------------------------------
-- A photographer publishing work here could see how much appreciation it had
-- received and nothing else: not whether anybody had opened it at all. That is
-- the one piece of "analytics" this platform can honestly offer, and the shape
-- it takes is the shape 0018 and 0020 already chose for a photobook and a
-- series — an integer on the row, bumped when the page is served.
--
-- WHAT THIS DELIBERATELY IS NOT. There is no per-viewer table, no referrer, no
-- geography, no time series, and the bump function receives nothing but a slug:
-- it cannot know who opened the page because it is never told. /legal/privacy
-- says FRAME embeds no analytics vendor and keeps no behavioural profile, and
-- an aggregate integer is the most that promise admits. Anything that would
-- answer "who looked at my photograph" is refused by design, not deferred.
--
-- THE TENSION WITH "COUNTERS ARE RECOUNTED, NEVER INCREMENTED", stated plainly
-- because the README's rule is a good one. That rule exists so a replayed
-- request cannot bend a number permanently, and it works for every counter with
-- rows behind it: appreciations are counted from photograph_appreciations, a
-- place's photograph_count from its photographs. An open has no rows behind it
-- — recording them is exactly the per-viewer table this refuses to keep — so it
-- cannot be recounted, and `opens = opens + 1` is the only available shape.
-- 0018 and 0020 reached the same conclusion for the same reason. The cost is
-- accepted knowingly: this number is an indication, not an audited figure, and
-- nothing in FRAME reads it except the owner's own view of their own work.

-- -----------------------------------------------------------------------------
-- photographs.opens
-- -----------------------------------------------------------------------------
alter table public.photographs
  add column if not exists opens integer not null default 0;

alter table public.photographs
  drop constraint if exists photographs_opens_non_negative,
  add constraint photographs_opens_non_negative check (opens >= 0);

comment on column public.photographs.opens is
  'How many times the photograph page was served. A number, not a record of who: there is no per-viewer row anywhere, and bump_photograph_opens() is never told who is reading. Incremented rather than recounted because an open has nothing behind it to recount — see the note at the top of 0042.';

-- -----------------------------------------------------------------------------
-- bump_photograph_opens — the one write a visitor causes
-- -----------------------------------------------------------------------------
-- The same shape as bump_series_opens (0020): security definer, takes the slug
-- and nothing else, granted to anon and authenticated. Two differences, both
-- deliberate:
--
--   * `status = 'published'` — the owner and a moderator can open an
--     unpublished photograph's page (0032, and the route since then), and a
--     draft nobody can reach should not accumulate opens.
--   * no return value, so a caller cannot read the count back out of the bump
--     and turn this into a live counter on a public page. The number is the
--     owner's, shown on their own view.
create or replace function public.bump_photograph_opens(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.photographs
     set opens = opens + 1
   where slug = p_slug
     and status = 'published';
$$;

comment on function public.bump_photograph_opens(text) is
  'Counts one open of a published photograph. Takes a slug and nothing else — it is never told who is reading, which is what keeps the counter aggregate.';

revoke all on function public.bump_photograph_opens(text) from public;
grant execute on function public.bump_photograph_opens(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Who may READ the count
-- -----------------------------------------------------------------------------
-- Nobody, through the table. `photographs` has carried a column-level grant
-- since 0029 — the raw capture time is withheld from every public role — and
-- `opens` is deliberately not added to it. The number is the photographer's own
-- view of their own work, and whether anybody else should see how often a frame
-- was opened is the owner's decision to make, not a default to drift into.
--
-- So it is read the way 0015 reads the private EXIF position: one SECURITY
-- DEFINER function, for a batch of photographs at once, answering only for the
-- rows the caller owns — or any row, for a moderator, who already sees
-- everything a review needs. The service role keeps its full grant, and the
-- bump above is untouched: anybody may add to the number, only its owner may
-- read it.
create or replace function public.photograph_open_counts(p_photograph_ids uuid[])
returns table (photograph_id uuid, opens integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.opens
    from public.photographs p
   where p.id = any (p_photograph_ids)
     and (public.owns_photograph(p.id) or public.is_moderator());
$$;

comment on function public.photograph_open_counts(uuid[]) is
  'How many times each photograph was opened, for its owner or a moderator. The column itself is granted to no public role (0042), so this is the only way the number is read.';

-- `from public` alone is not enough on a Supabase project: a default privilege
-- there grants EXECUTE on new functions in `public` to `anon` as well, so the
-- role is named explicitly. Verified on production — without this line
-- has_function_privilege('anon', …) came back true, which is not what the two
-- lines below were written to mean.
--
-- It was never a leak: an anonymous caller got zero rows back, because the
-- filter is in the body and `auth.uid()` is null. That is also why the
-- assertion in supabase/tests/constraints.sql checks what the function ANSWERS
-- rather than only who may call it — a grant can differ between a plain
-- PostgreSQL and a Supabase project, and an assertion that passes in CI while
-- being false in production is worse than no assertion.
revoke all on function public.photograph_open_counts(uuid[]) from public, anon;
grant execute on function public.photograph_open_counts(uuid[]) to authenticated;
