-- =============================================================================
-- FRAME — 0006  Functions and triggers
-- =============================================================================
-- Conventions used throughout this file:
--
-- * Every function declares an explicit `set search_path`. Without it, a
--   security-definer function can be made to resolve `profiles` to a table an
--   attacker created in a schema earlier in their own search path. Most
--   functions here use `set search_path = ''` and schema-qualify every name,
--   which is the strictest form; the two that need a PostGIS or unaccent
--   lookup say so and explain why.
-- * `security definer` appears only where it is genuinely required, and each
--   use states what it is for. Where it appears, EXECUTE is revoked from PUBLIC
--   and granted to named roles, because a definer function with a default grant
--   is a privilege anyone can call.
-- =============================================================================

set search_path = public, extensions;

-- The EXECUTE grants below name the three roles every Supabase project has. On
-- a database without them the grants would fail one by one with an unhelpful
-- message, so fail once, early, with a useful one.
do $guard$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception
      'These migrations target a Supabase database: the roles anon, authenticated and service_role must exist. See supabase/README.md.';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- set_updated_at — the updated_at convention, in one place
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Keeps updated_at honest. An application-supplied timestamp is overwritten, so the column always means "when the row last changed".';

-- -----------------------------------------------------------------------------
-- frame_slugify — the SQL counterpart of slugify() in src/lib/utils.ts
-- -----------------------------------------------------------------------------
-- Only used by approve_location_submission(), which has to invent a slug with
-- no TypeScript in the loop. The accent folding is the reason this function is
-- STABLE rather than IMMUTABLE: unaccent() reads a text-search dictionary, so
-- Postgres cannot promise the result is fixed forever. It is never used in an
-- index, so stability is enough.
--
-- search_path includes `extensions` because the single-argument unaccent() form
-- resolves its dictionary by name through the search path.
create or replace function public.frame_slugify(p_input text)
returns text
language sql
stable
set search_path = extensions, public
as $$
  select left(
           btrim(
             regexp_replace(lower(unaccent(coalesce(p_input, ''))), '[^a-z0-9]+', '-', 'g'),
             '-'
           ),
           70
         )
$$;

comment on function public.frame_slugify(text) is
  'Lowercase, accent-folded, non-alphanumerics collapsed to hyphens, trimmed to 70 characters — the same rules as slugify() in src/lib/utils.ts.';

revoke all on function public.frame_slugify(text) from public;

-- -----------------------------------------------------------------------------
-- locations_set_geog — keep the geography column in step with the numbers
-- -----------------------------------------------------------------------------
-- latitude and longitude are the source of truth, because they are what a
-- member typed and what the UI renders. geog is derived, every time, so the two
-- can never disagree — which also means nothing may write geog directly.
--
-- search_path includes `extensions` rather than schema-qualifying st_makepoint:
-- PostGIS lives in `extensions` on a project set up by 0001, but in `public` on
-- some older hosted projects, and this way the same function works on both.
create or replace function public.locations_set_geog()
returns trigger
language plpgsql
set search_path = extensions, public
as $$
begin
  new.geog = st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;

comment on function public.locations_set_geog() is
  'Derives locations.geog from latitude/longitude on every write. Note the argument order: st_makepoint takes longitude first.';

-- -----------------------------------------------------------------------------
-- locations_stamp_approval — an approval always carries its timestamp
-- -----------------------------------------------------------------------------
-- The locations_approved_needs_timestamp constraint requires approved_at on an
-- approved row. This trigger fills it in, so the constraint catches a bug
-- rather than rejecting an otherwise correct moderator action.
create or replace function public.locations_stamp_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' and new.approved_at is null then
    new.approved_at = now();
  end if;

  -- A place that is no longer approved no longer has an approval. The record of
  -- who decided what, and why, lives in moderation_actions, which is append-only.
  if new.status <> 'approved' then
    new.approved_at = null;
    new.approved_by = null;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- current_profile_role / is_moderator — the two helpers the policies rest on
-- -----------------------------------------------------------------------------
-- Both are SECURITY DEFINER, and this is the one place where that is not
-- optional. The row-level policies on `profiles` need to ask "is the caller a
-- moderator?", which means reading `profiles`. A plain function would have the
-- caller's own policies applied to that read, and the policy would call the
-- function again: Postgres reports "infinite recursion detected in policy for
-- relation profiles" and every query against the table fails. Reading the role
-- as the function's owner breaks the cycle.
--
-- A suspended account is treated as having no privileges at all, so a suspended
-- moderator cannot moderate.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_suspended = false
$$;

comment on function public.current_profile_role() is
  'The caller''s role, or null when signed out or suspended. SECURITY DEFINER to avoid recursive policy evaluation on profiles.';

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() in ('moderator', 'admin'), false)
$$;

comment on function public.is_moderator() is
  'True for role moderator or admin on a non-suspended account. The server-side authorisation check behind every moderator policy — hiding a button is not a permission check.';

revoke all on function public.current_profile_role() from public;
revoke all on function public.is_moderator() from public;
grant execute on function public.current_profile_role() to anon, authenticated, service_role;
grant execute on function public.is_moderator() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Visibility helpers used by the policies in 0007
-- -----------------------------------------------------------------------------
-- A policy on photograph_images has to ask whether the caller may see the
-- parent photograph. Expressed inline, that subquery would have the parent's
-- own policies applied to it, which works but makes the two sets of rules
-- interdependent and very hard to reason about. These SECURITY DEFINER helpers
-- state the visibility rule once, in one readable place, and every policy that
-- needs it calls the same function.
create or replace function public.can_view_photograph(p_photograph_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.photographs p
     where p.id = p_photograph_id
       and (p.status = 'published'
            or p.owner_id = (select auth.uid())
            or public.is_moderator())
  )
$$;

create or replace function public.can_edit_photograph(p_photograph_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.photographs p
     where p.id = p_photograph_id
       and (p.owner_id = (select auth.uid()) or public.is_moderator())
  )
$$;

create or replace function public.can_view_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.locations l
     where l.id = p_location_id
       and (l.status = 'approved' or public.is_moderator())
  )
$$;

create or replace function public.can_view_collection(p_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.collections c
     where c.id = p_collection_id
       and (c.visibility = 'public' or c.owner_id = (select auth.uid()))
  )
$$;

create or replace function public.owns_collection(p_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.collections c
     where c.id = p_collection_id
       and c.owner_id = (select auth.uid())
  )
$$;

revoke all on function public.can_view_photograph(uuid) from public;
revoke all on function public.can_edit_photograph(uuid) from public;
revoke all on function public.can_view_location(uuid) from public;
revoke all on function public.can_view_collection(uuid) from public;
revoke all on function public.owns_collection(uuid) from public;
grant execute on function public.can_view_photograph(uuid) to anon, authenticated, service_role;
grant execute on function public.can_edit_photograph(uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_location(uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_collection(uuid) to anon, authenticated, service_role;
grant execute on function public.owns_collection(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- handle_new_user — one profile per account, created with the account
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER is required: this runs inside the auth service's insert into
-- auth.users, whose session has no rights on public.profiles, and the profiles
-- table has no INSERT policy for anyone (see 0007) precisely because this
-- trigger is the only writer.
--
-- The role is never set here. It defaults to 'member', so there is no code path
-- in which signup metadata can mint a moderator.
--
-- If this function raises, the signup fails and no account is created. That is
-- the intended behaviour: an auth.users row with no profile is an account that
-- can sign in and then 404 on its own profile page, which is worse than a
-- signup error the member can retry.
--
-- search_path lists `extensions` rather than being empty because the collision
-- check casts to `citext`, and a bare `''` search path cannot resolve a type
-- name from an extension schema. Neither schema named here is writable by anon
-- or authenticated, so the usual shadowing risk does not apply.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = extensions, public
as $$
declare
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_display     text;
  v_base        text;
  v_candidate   text;
  v_attempt     integer := 0;
begin
  v_display := nullif(btrim(coalesce(v_meta ->> 'display_name',
                                     v_meta ->> 'full_name',
                                     v_meta ->> 'name',
                                     '')), '');

  -- Prefer an explicitly requested username, then the local part of the email
  -- address. Anything outside [a-z0-9_] is dropped rather than transliterated:
  -- a username is an identifier in a URL, not a display name.
  v_base := lower(coalesce(nullif(btrim(v_meta ->> 'username'), ''),
                           nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                           ''));
  v_base := regexp_replace(v_base, '[^a-z0-9_]', '', 'g');

  if length(v_base) < 3 then
    v_base := 'member';
  end if;

  -- Leave room for the collision suffix inside the 24-character limit.
  v_base := left(v_base, 18);
  v_candidate := v_base;

  -- A short random suffix on collision, rather than a counter: a counter tells
  -- anyone who can read usernames how many people wanted the same one.
  while exists (select 1 from public.profiles p where p.username = v_candidate::citext) loop
    v_attempt := v_attempt + 1;
    exit when v_attempt > 20;
    v_candidate := v_base || '_' || substr(md5(random()::text || new.id::text), 1, 4);
  end loop;

  -- Deterministic last resort. The account id is unique, so this cannot
  -- collide, and it still satisfies the username format constraint.
  if exists (select 1 from public.profiles p where p.username = v_candidate::citext) then
    v_candidate := 'm_' || substr(replace(new.id::text, '-', ''), 1, 20);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_candidate::citext, coalesce(v_display, v_candidate))
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'After-insert trigger on auth.users. Creates the profiles row, derives a unique username, and never assigns a role above member.';

revoke all on function public.handle_new_user() from public;

-- The trigger lives on auth.users, which is owned by the auth service; creating
-- it needs the postgres role, which is what the Supabase CLI and the SQL editor
-- both use. On a database with no auth schema this statement is the first thing
-- that fails, and the message says why.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- profiles_guard_privileged_columns — authorisation that a column cannot dodge
-- -----------------------------------------------------------------------------
-- The UPDATE policy on profiles lets a member write their own row. Three
-- columns on that row are not theirs to write: role, is_suspended and
-- suspended_reason.
--
-- This is a trigger rather than a column-level REVOKE, deliberately:
--
-- * A column privilege error surfaces through PostgREST as a bare "permission
--   denied for table profiles", which tells the member nothing. A trigger
--   raises the sentence we actually want them to read.
-- * Column privileges are silently widened again by any later `grant update on
--   profiles`, which is a one-line mistake in a future migration. A trigger
--   cannot be undone by accident.
-- * The rule is conditional (an admin may change a role, nobody may change
--   their own), and a column privilege cannot express a condition.
--
-- Self-promotion is blocked even for an admin: raising your own privileges is
-- the one operation that should always require a second pair of hands, or the
-- service role.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- No JWT means the service role or a direct SQL session: someone holding the
  -- keys, doing something deliberate. Migrations and support fixes run here, so
  -- this path is not second-guessed.
  if v_actor is null then
    return new;
  end if;

  -- Ignored rather than rejected, the same way set_updated_at ignores a
  -- client-supplied updated_at: these are not a member's to set, and a form
  -- that posts them back unchanged should not fail.
  new.id = old.id;
  new.created_at = old.created_at;
  new.member_since = old.member_since;

  if new.role is distinct from old.role
     and not (public.current_profile_role() = 'admin' and v_actor <> old.id) then
    raise exception 'Only an administrator may change another member''s role.'
      using errcode = '42501';
  end if;

  if (new.is_suspended is distinct from old.is_suspended
      or new.suspended_reason is distinct from old.suspended_reason)
     and not public.is_moderator() then
    raise exception 'Only a moderator may suspend or reinstate an account.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- photographs_guard_privileged_columns
-- -----------------------------------------------------------------------------
-- An owner may edit their own photograph. Two columns on it are not theirs:
--
-- * editors_pick, which is an editorial decision. If an owner could set it,
--   "chosen by FRAME editors" would be a lie the UI prints.
-- * appreciation_count, which is a summary of rows in
--   photograph_appreciations. The only writer is toggle_appreciation(), which
--   recomputes it; an owner who could set it directly could manufacture a
--   trending photograph with one UPDATE, and the unique constraint protecting
--   the ranking would be beside the point.
-- The true appreciation count for one photograph, read past RLS.
--
-- SECURITY DEFINER because the guard trigger below has to compare a proposed
-- appreciation_count against reality, and a member can only see their own rows
-- in photograph_appreciations (0007). Without this the guard would compute 1
-- where the answer is 400 and reject a legitimate write. It returns a single
-- number that is already public on photographs.appreciation_count, so it leaks
-- nothing the caller could not read anyway.
create or replace function public.appreciation_count_of(p_photograph_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
    from public.photograph_appreciations a
   where a.photograph_id = p_photograph_id
$$;

revoke all on function public.appreciation_count_of(uuid) from public;
grant execute on function public.appreciation_count_of(uuid) to anon, authenticated, service_role;

create or replace function public.photographs_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- A null actor is the service role or a direct SQL session; the definer
  -- functions in this file write through it on purpose.
  if v_actor is null then
    return new;
  end if;

  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
    raise exception 'A photograph''s identity and owner cannot be reassigned.'
      using errcode = '42501';
  end if;

  new.created_at = old.created_at;

  if new.editors_pick is distinct from old.editors_pick and not public.is_moderator() then
    raise exception 'Only a FRAME editor may mark a photograph as an editor''s pick.'
      using errcode = '42501';
  end if;

  -- appreciation_count may only ever hold the number of appreciation rows that
  -- actually exist. toggle_appreciation() computes exactly that, so it passes;
  -- any other value is refused. Expressed as "the value must be true" rather
  -- than "only this function may write it", because a caller who writes the
  -- correct number has changed nothing, and a caller who writes any other
  -- number is inflating a ranking.
  if new.appreciation_count is distinct from old.appreciation_count
     and new.appreciation_count <> public.appreciation_count_of(old.id) then
    raise exception 'Appreciation counts are derived from appreciation rows and cannot be set directly.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Denormalised counters
-- -----------------------------------------------------------------------------
-- Both of these recount from the rows rather than adding or subtracting one. An
-- increment is correct only if every past increment was correct; a recount is
-- correct on its own, and these tables are small enough per parent that the
-- count is an index-only scan.
--
-- Each branch touches OLD or NEW only where the trigger guarantees it exists.
-- Reading OLD in an INSERT trigger raises "record old is not assigned yet", and
-- a CASE expression is not a reliable guard against that, so the branching is
-- done with nested IFs on TG_OP.
--
-- Both are SECURITY DEFINER, and without it they would quietly stop working.
-- Writing to locations needs the moderator policy; counting published
-- photographs needs to see photographs the caller cannot. A member publishing
-- their own frame would update zero location rows — no error, because an UPDATE
-- filtered out by RLS is simply an UPDATE that matched nothing — and the
-- counter would drift away from the truth with nothing to show for it. The
-- definer rights are not an escalation: these functions only ever write a
-- number they derived from the rows, and only a caller who was already allowed
-- to write the parent row can fire them.
create or replace function public.recount_location_photographs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
begin
  if tg_op = 'INSERT' then
    if new.location_id is not null then
      v_ids := array[new.location_id];
    end if;
  elsif tg_op = 'DELETE' then
    if old.location_id is not null then
      v_ids := array[old.location_id];
    end if;
  else
    if old.location_id is not null then
      v_ids := v_ids || old.location_id;
    end if;
    if new.location_id is not null then
      v_ids := v_ids || new.location_id;
    end if;
  end if;

  if cardinality(v_ids) = 0 then
    return null;
  end if;

  -- Both derived columns are rebuilt in one statement. categories is what
  -- LocationDetail.categories means: the categories this place has actually
  -- produced published work in, not a list somebody typed when proposing it.
  -- Deriving it here rather than in the read query is what keeps /map cheap —
  -- that page asks for every approved pin at once, and a correlated subquery
  -- per pin would be the most expensive thing on the site.
  update public.locations l
     set photograph_count = (
           select pg_catalog.count(*)
             from public.photographs p
            where p.location_id = l.id
              and p.status = 'published'
         ),
         categories = coalesce((
           select array_agg(distinct p.category order by p.category)
             from public.photographs p
            where p.location_id = l.id
              and p.status = 'published'
              and p.category is not null
         ), '{}')
   where l.id = any (v_ids);

  return null;
end;
$$;

comment on function public.recount_location_photographs() is
  'Rebuilds locations.photograph_count and locations.categories from the published photographs at that place. Counts, never increments.';

revoke all on function public.recount_location_photographs() from public;

create or replace function public.recount_collection_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.collection_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.collection_id];
  else
    v_ids := array[old.collection_id, new.collection_id];
  end if;

  update public.collections c
     set item_count = (
           select pg_catalog.count(*)
             from public.collection_items i
            where i.collection_id = c.id
         )
   where c.id = any (v_ids);

  return null;
end;
$$;

revoke all on function public.recount_collection_items() from public;

-- The third denormalised counter, and the one with two writers.
--
-- toggle_appreciation() already recomputes photographs.appreciation_count, but
-- it is not the only way a row can reach photograph_appreciations: the policies
-- in 0007 deliberately let a member insert and delete their own row directly,
-- which is what makes the table auditable and what lets a client written
-- against PostgREST work without an RPC. Without this trigger that path would
-- leave the count behind, and the claim that the summary cannot drift from the
-- rows would be false for exactly the request an attacker would choose.
--
-- The two writers are redundant on purpose. The function keeps its own
-- guarantee without depending on a trigger; the trigger covers every other
-- path. When both run, the second write sets the value the first already
-- computed, so the guard in photographs_guard_privileged_columns sees no change
-- and the cost is one extra row version per appreciation.
--
-- SECURITY DEFINER for the same reason as the counters above, and here it is
-- load-bearing: the member appreciating a photograph is almost never its owner,
-- so an UPDATE on photographs under their own privileges would match no rows
-- and fail silently.
create or replace function public.recount_photograph_appreciations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.photograph_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.photograph_id];
  else
    v_ids := array[old.photograph_id, new.photograph_id];
  end if;

  update public.photographs p
     set appreciation_count = (
           select pg_catalog.count(*)::integer
             from public.photograph_appreciations a
            where a.photograph_id = p.id
         )
   where p.id = any (v_ids)
     and p.appreciation_count <> (
           select pg_catalog.count(*)::integer
             from public.photograph_appreciations a
            where a.photograph_id = p.id
         );

  return null;
end;
$$;

comment on function public.recount_photograph_appreciations() is
  'Keeps photographs.appreciation_count equal to the number of appreciation rows, whichever path wrote them.';

revoke all on function public.recount_photograph_appreciations() from public;

-- -----------------------------------------------------------------------------
-- toggle_appreciation — the one write a member makes most often
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER for one reason: it has to write photographs.appreciation_count
-- on a row the caller does not own, and no policy should ever let a member
-- update someone else's photograph. The function is the narrow hole in that
-- wall — it changes exactly one column, on exactly one row, to a value it
-- computed from the appreciation rows themselves.
--
-- Properties worth checking against the code below:
--
-- * It acts on auth.uid(). The photograph id is a parameter; the actor never is.
-- * It refuses anything that is not published, so a draft cannot be warmed up
--   before release.
-- * The count is recomputed from photograph_appreciations in the same statement
--   that writes it, so the summary cannot drift from the rows. There is no
--   `appreciation_count + 1` anywhere in this schema.
-- * A replayed insert hits photograph_appreciations_one_per_member and is
--   treated as the idempotent success it is: the caller asked for the state
--   they are already in, and gets it, with the true count.
-- * The row lock serialises concurrent toggles of the same photograph, so two
--   simultaneous requests cannot both recount a half-finished picture.
--
-- Rate limiting is not done here. It belongs to the server action, which has
-- the bucket naming and can report a retry-after; see check_rate_limit below.
create or replace function public.toggle_appreciation(p_photograph_id uuid)
returns table (appreciated boolean, count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_status  text;
  v_deleted integer;
  v_count   integer;
begin
  if v_actor is null then
    raise exception 'You need an account to appreciate a photograph.'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_actor and p.is_suspended) then
    raise exception 'This account is suspended and cannot appreciate photographs.'
      using errcode = '42501';
  end if;

  select p.status
    into v_status
    from public.photographs p
   where p.id = p_photograph_id
     for update;

  if not found then
    raise exception 'That photograph no longer exists.' using errcode = 'P0002';
  end if;

  if v_status <> 'published' then
    raise exception 'Only a published photograph can be appreciated.' using errcode = '22023';
  end if;

  delete from public.photograph_appreciations a
   where a.photograph_id = p_photograph_id
     and a.profile_id = v_actor;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    insert into public.photograph_appreciations (photograph_id, profile_id)
    values (p_photograph_id, v_actor)
    on conflict (photograph_id, profile_id) do nothing;
  end if;

  -- pg_catalog.count is qualified because this function's RETURNS TABLE
  -- declares an output column named "count", and a bare `count` inside the
  -- body would be ambiguous between that variable and the aggregate.
  update public.photographs p
     set appreciation_count = (
           select pg_catalog.count(*)::integer
             from public.photograph_appreciations a
            where a.photograph_id = p.id
         )
   where p.id = p_photograph_id
  returning p.appreciation_count into v_count;

  return query select (v_deleted = 0), coalesce(v_count, 0);
end;
$$;

comment on function public.toggle_appreciation(uuid) is
  'Adds or removes the caller''s single appreciation and returns the resulting state with a recounted total. Idempotent under replay.';

revoke all on function public.toggle_appreciation(uuid) from public;
grant execute on function public.toggle_appreciation(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- check_rate_limit
-- -----------------------------------------------------------------------------
-- Counts the hits already recorded in a named bucket inside a window, records
-- this one when it is allowed, and tells the caller when to try again.
--
-- SECURITY DEFINER because rate_limit_hits grants no privilege to any
-- application role: this function is the only way in, which stops a client
-- deleting its own hits to reset a limit.
--
-- The bucket name is built by the caller and must key on the account id — see
-- the comment on the table. The housekeeping delete runs on roughly one call in
-- a hundred rather than on every call: at this table's write rate, a scan per
-- request would cost far more than the rows it reclaims, and bounded-by-a-day
-- is all the guarantee the limiter needs.
create or replace function public.check_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit   integer := greatest(1, coalesce(p_limit, 1));
  v_window  interval := make_interval(secs => greatest(1, coalesce(p_window_seconds, 1)));
  v_used    integer;
  v_oldest  timestamptz;
  v_allowed boolean;
begin
  if p_bucket is null or btrim(p_bucket) = '' then
    raise exception 'A rate-limit bucket name is required.' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer, min(h.created_at)
    into v_used, v_oldest
    from public.rate_limit_hits h
   where h.bucket = p_bucket
     and h.created_at > now() - v_window;

  v_allowed := v_used < v_limit;

  if v_allowed then
    insert into public.rate_limit_hits (bucket) values (p_bucket);
    v_used := v_used + 1;
  end if;

  if random() < 0.01 then
    delete from public.rate_limit_hits h where h.created_at < now() - interval '1 day';
  end if;

  return query
    select v_allowed,
           greatest(0, v_limit - v_used),
           case
             when v_allowed then 0
             else greatest(1, ceil(extract(epoch from (coalesce(v_oldest, now()) + v_window - now())))::integer)
           end;
end;
$$;

comment on function public.check_rate_limit(text, integer, integer) is
  'Fixed-window limiter. Returns allowed/remaining/retry_after_seconds and records the hit when it is allowed. The only access path to rate_limit_hits.';

revoke all on function public.check_rate_limit(text, integer, integer) from public;
-- anon is granted execute because the limits that matter most — sign-in,
-- sign-up, password reset — have to be applied before a session exists.
grant execute on function public.check_rate_limit(text, integer, integer)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- trending_score — one formula, two callers
-- -----------------------------------------------------------------------------
-- The maths lives in trending_score_at(), which takes "now" as a parameter and
-- is therefore IMMUTABLE: usable in a generated column or an expression index,
-- and provably the same arithmetic every time. The two-argument form the
-- application calls supplies now() and is consequently STABLE, because a
-- function whose result changes as the clock moves cannot honestly claim
-- immutability.
--
-- This is the formula in src/lib/ranking.ts, unchanged:
--
--   score = (appreciations + 1) / 2 ^ (ageHours / halfLifeHours)
--
-- with halfLifeHours = 36 (APPRECIATION_POLICY.trendingHalfLifeHours). The +1
-- keeps a brand-new photograph with no appreciations from tying with an old
-- one, and ageHours is clamped at zero so a published_at in the future cannot
-- score above the present. If one side of the app is ever changed, the other
-- has to change in the same commit or the SQL ordering and the TypeScript
-- ordering will disagree about the same two photographs.
create or replace function public.trending_score_at(
  p_appreciations integer,
  p_published_at  timestamptz,
  p_now           timestamptz
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when p_published_at is null then 0::double precision
           else (coalesce(p_appreciations, 0) + 1)::double precision
                / power(
                    2::double precision,
                    greatest(
                      0::double precision,
                      extract(epoch from (p_now - p_published_at))::double precision / 3600::double precision
                    ) / 36::double precision
                  )
         end
$$;

create or replace function public.trending_score(
  p_appreciations integer,
  p_published_at  timestamptz
)
returns double precision
language sql
stable
parallel safe
set search_path = ''
as $$
  select public.trending_score_at(p_appreciations, p_published_at, now())
$$;

comment on function public.trending_score(integer, timestamptz) is
  'Time-decayed appreciation score with a 36-hour half-life. Must stay identical to trendingScore() in src/lib/ranking.ts.';

revoke all on function public.trending_score_at(integer, timestamptz, timestamptz) from public;
revoke all on function public.trending_score(integer, timestamptz) from public;
grant execute on function public.trending_score_at(integer, timestamptz, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.trending_score(integer, timestamptz)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- approve_location_submission
-- -----------------------------------------------------------------------------
-- Turns a member's proposal into a published place, in one transaction:
-- creates the locations row, links the submission to it, and writes the
-- moderation_actions row that records who decided and when.
--
-- SECURITY DEFINER because it writes three tables with three different
-- ownership rules, and because the audit row must be written whether or not
-- the caller could have written it directly. The definer rights are immediately
-- narrowed again by the explicit role check at the top: this function is not a
-- way to become a moderator, it is a way for a moderator to act atomically.
--
-- p_moderator is a parameter rather than being read from auth.uid() because a
-- server action running under the service role has no JWT. When there *is* a
-- JWT it must match, so a signed-in member cannot record a decision under
-- somebody else's name.
--
-- Calling it twice returns the same location id rather than creating a second
-- place: a double-clicked Approve button is not two decisions.
create or replace function public.approve_location_submission(
  p_submission_id uuid,
  p_moderator     uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.location_submissions;
  v_role       text;
  v_actor      uuid := (select auth.uid());
  v_slug       text;
  v_candidate  text;
  v_attempt    integer := 0;
  v_location   uuid;
begin
  if p_moderator is null then
    raise exception 'A moderator id is required to approve a submission.' using errcode = '22023';
  end if;

  if v_actor is not null and v_actor <> p_moderator then
    raise exception 'A moderator may only record a decision under their own account.'
      using errcode = '42501';
  end if;

  select p.role
    into v_role
    from public.profiles p
   where p.id = p_moderator
     and p.is_suspended = false;

  if v_role is null or v_role not in ('moderator', 'admin') then
    raise exception 'Only a moderator may approve a location submission.' using errcode = '42501';
  end if;

  select *
    into v_submission
    from public.location_submissions s
   where s.id = p_submission_id
     for update;

  if not found then
    raise exception 'That location submission no longer exists.' using errcode = 'P0002';
  end if;

  if v_submission.status = 'approved' and v_submission.approved_location_id is not null then
    return v_submission.approved_location_id;
  end if;

  v_slug := public.frame_slugify(v_submission.proposed_name || ' ' || v_submission.city);
  if length(v_slug) = 0 then
    v_slug := 'location';
  end if;
  v_candidate := v_slug;

  while v_attempt < 20
        and exists (select 1 from public.locations l where l.slug = v_candidate) loop
    v_attempt := v_attempt + 1;
    v_candidate := left(v_slug, 60) || '-' || v_attempt::text;
  end loop;

  -- Deterministic last resort, derived from the submission id, so twenty
  -- identically named places in one city still cannot collide.
  if exists (select 1 from public.locations l where l.slug = v_candidate) then
    v_candidate := left(v_slug, 50) || '-' || substr(replace(p_submission_id::text, '-', ''), 1, 12);
  end if;

  insert into public.locations (
    slug, name, city, country, country_code,
    latitude, longitude, status, submitted_by, approved_at, approved_by
  )
  values (
    v_candidate, v_submission.proposed_name, v_submission.city, v_submission.country,
    upper(v_submission.country_code::text),
    v_submission.latitude, v_submission.longitude, 'approved', v_submission.submitted_by,
    now(), p_moderator
  )
  returning id into v_location;

  update public.location_submissions s
     set status               = 'approved',
         approved_location_id = v_location,
         rejection_reason     = null,
         resolved_at          = now(),
         resolved_by          = p_moderator
   where s.id = p_submission_id;

  insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
  values ('approve', 'location_submission', p_submission_id, null, p_moderator);

  return v_location;
end;
$$;

comment on function public.approve_location_submission(uuid, uuid) is
  'Moderator-only. Creates the location, links the submission, writes the audit row. Idempotent: a second call returns the same location id.';

revoke all on function public.approve_location_submission(uuid, uuid) from public;
grant execute on function public.approve_location_submission(uuid, uuid)
  to authenticated, service_role;

-- =============================================================================
-- Triggers
-- =============================================================================
-- drop-then-create, so re-running this file replaces a trigger rather than
-- failing on it.

-- updated_at, on every table that has the column.
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.camera_brands;
create trigger set_updated_at before update on public.camera_brands
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.camera_models;
create trigger set_updated_at before update on public.camera_models
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.lens_brands;
create trigger set_updated_at before update on public.lens_brands
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.lens_models;
create trigger set_updated_at before update on public.lens_models
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.locations;
create trigger set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.location_submissions;
create trigger set_updated_at before update on public.location_submissions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.photographs;
create trigger set_updated_at before update on public.photographs
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.photograph_metadata;
create trigger set_updated_at before update on public.photograph_metadata
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.collections;
create trigger set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.reports;
create trigger set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- geog follows the coordinates on insert and whenever either changes.
drop trigger if exists locations_set_geog on public.locations;
create trigger locations_set_geog
  before insert or update of latitude, longitude on public.locations
  for each row execute function public.locations_set_geog();

drop trigger if exists locations_stamp_approval on public.locations;
create trigger locations_stamp_approval
  before insert or update of status on public.locations
  for each row execute function public.locations_stamp_approval();

-- Column-level authorisation guards.
drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

drop trigger if exists photographs_guard_privileged_columns on public.photographs;
create trigger photographs_guard_privileged_columns
  before update on public.photographs
  for each row execute function public.photographs_guard_privileged_columns();

-- Denormalised counters. `update of` keeps the recount off every unrelated
-- edit: retitling a photograph does not touch any location.
drop trigger if exists recount_location_photographs on public.photographs;
create trigger recount_location_photographs
  after insert or delete or update of location_id, status, category on public.photographs
  for each row execute function public.recount_location_photographs();

drop trigger if exists recount_collection_items on public.collection_items;
create trigger recount_collection_items
  after insert or delete or update of collection_id on public.collection_items
  for each row execute function public.recount_collection_items();

drop trigger if exists recount_photograph_appreciations on public.photograph_appreciations;
create trigger recount_photograph_appreciations
  after insert or delete or update of photograph_id on public.photograph_appreciations
  for each row execute function public.recount_photograph_appreciations();
