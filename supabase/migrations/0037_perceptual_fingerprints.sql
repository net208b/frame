-- =============================================================================
-- FRAME — 0037  A perceptual fingerprint for every stored photograph
-- =============================================================================
-- /legal/copyright has said since 0004 that FRAME "computes a perceptual
-- fingerprint of each upload and shows a moderator when a new photograph
-- closely resembles one already on the site". The signal kind, its badge, the
-- queue's caveat and the policy copy were all built for it; the computation and
-- the column were not. docs/LIMITATIONS.md called that the most serious honesty
-- gap in the repository. This is the column, and the comparison.
--
-- WHAT IS STORED. A 64-bit difference hash (dHash) of the display derivative:
-- the image reduced to 9×8 greyscale, each bit saying whether a pixel is
-- brighter than the one to its right. Two files of the same picture — the same
-- export at two sizes, a re-save, a light recompress — land within a few bits
-- of each other. lib/images/fingerprint.ts computes it; the server stores it
-- with the service role at the same moment it stores the derivatives.
--
-- WHAT THE COMPARISON IS, AND IS NOT. similar_photographs() returns the
-- published photographs whose hash sits within a Hamming distance of the
-- given ones. That is a reason for a person to look at two frames side by
-- side, and nothing more: it cannot say which was uploaded first, cannot
-- tell a crop or a flip from a copy, and cannot tell a member re-uploading
-- their own work from somebody taking it. The row that comes back says
-- whether the two share an owner so the queue can word it. Nothing here
-- removes or holds a photograph on its own; the server turns a match into a
-- high-severity signal and a moderator decides.
--
-- WHO MAY READ. Nobody but the server and a moderator. The fingerprint of a
-- published photograph is not sensitive in itself, but a table that answers
-- "does this image exist on FRAME" to anyone is a table that answers it for
-- a photograph that is still under review or has been removed. So the table
-- has no policy and no grant for either public role — the same shape as
-- photograph_content_checks (0013) — and the function admits a moderator or
-- the service role and gives everyone else no rows.
--
-- WHY NOT A COLUMN ON photographs. The owner's update policy (0007) covers the
-- whole row, and the table grant from 0002 is ALL, so a new column there is a
-- column the owner can write unless a trigger stops them. A table of its own
-- with no public grant needs no trigger, and keeps the hash out of every
-- select on photographs.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.photograph_fingerprints (
  photograph_id uuid primary key
                  references public.photographs (id) on delete cascade,
  -- dHash, 64 bits, computed from the display derivative. Always a full
  -- 64: a shorter value would make every distance from it meaningless.
  dhash         bit(64) not null,
  -- Which algorithm and input produced it. One for now; named so a second
  -- (a different hash, or the original instead of the derivative) is visible
  -- in the record rather than silently comparable with the first.
  method        text not null default 'dhash-9x8-display'
                  constraint photograph_fingerprints_method_allowed
                  check (method in ('dhash-9x8-display')),
  computed_at   timestamptz not null default now()
);

comment on table public.photograph_fingerprints is
  'A 64-bit difference hash of each stored photograph, written by the server with the service role. Read through similar_photographs() by a moderator or the server; no public role may read it.';

alter table public.photograph_fingerprints enable row level security;

-- Revoke before grant: the schema arrives with ALL granted to both public
-- roles, and TRUNCATE escapes row-level security.
revoke all on table public.photograph_fingerprints from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- is_service_role — whether the caller is the server
-- -----------------------------------------------------------------------------
-- is_moderator() is false for the service role, which has no auth.uid(). A
-- function the server calls at publish time and a moderator calls from the
-- queue needs to admit both, so this reads the role claim PostgREST sets.
create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role',
    false)
$$;

comment on function public.is_service_role() is
  'True when the request carries the service_role claim, i.e. the server is calling. False for every member and visitor.';

revoke all on function public.is_service_role() from public;
grant execute on function public.is_service_role() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- similar_photographs — the published frames that look like these ones
-- -----------------------------------------------------------------------------
-- One call for a whole queue, like photograph_exif_positions() (0015). For
-- each given photograph that has a fingerprint, every *other* published
-- photograph with a fingerprint within p_max_distance bits. Ten of sixty-four
-- is the usual near-duplicate cutoff for a dHash; the server passes the
-- application's own constant so the number lives in one place.
create or replace function public.similar_photographs(
  p_photograph_ids uuid[],
  p_max_distance   integer default 10
)
returns table (
  photograph_id  uuid,
  match_id       uuid,
  match_slug     text,
  match_title    text,
  match_username text,
  same_owner     boolean,
  distance       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.photograph_id,
         o.id,
         o.slug,
         o.title,
         pr.username,
         o.owner_id = p.owner_id,
         bit_count(f.dhash # g.dhash)
    from public.photograph_fingerprints f
    join public.photographs p on p.id = f.photograph_id
    join public.photograph_fingerprints g on g.photograph_id <> f.photograph_id
    join public.photographs o on o.id = g.photograph_id and o.status = 'published'
    join public.profiles pr on pr.id = o.owner_id
   where f.photograph_id = any (p_photograph_ids)
     and bit_count(f.dhash # g.dhash) <= greatest(0, least(p_max_distance, 64))
     and (public.is_moderator() or public.is_service_role())
   order by f.photograph_id, bit_count(f.dhash # g.dhash), o.published_at
$$;

comment on function public.similar_photographs(uuid[], integer) is
  'Published photographs within a Hamming distance of each given one, for a moderator or the server only. A hint to look, never evidence: it cannot tell a crop from a copy or say which came first.';

revoke all on function public.similar_photographs(uuid[], integer) from public, anon;
grant execute on function public.similar_photographs(uuid[], integer) to authenticated, service_role;
