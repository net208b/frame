-- =========================================================================
-- FRAME — database guarantees, tested against a real PostgreSQL server.
--
-- These are not type checks. Every assertion here corresponds to a promise
-- the product makes to its members, and each one is enforced in the database
-- rather than only in application code, so a replayed request or a direct
-- query cannot route around it:
--
--   * one appreciation per member per photograph, reversible
--   * a location restriction always carries a source
--   * a collection item is exactly one photograph or one place
--   * a published photograph has a rights confirmation
--   * a negative moderation decision carries a reason the member is shown
--   * a new account never arrives with a role above member
--   * the denormalised appreciation counter never drifts from its rows
--
-- Run with: supabase/tests/run.sh   (see supabase/tests/README.md)
-- Requires: helpers.sql loaded first, and an empty database with the
-- migrations applied.
-- =========================================================================

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------ people
-- Inserting into auth.users exercises handle_new_user(), so the profiles
-- below are created by the trigger rather than written directly.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test',
   '{"username":"owner","display_name":"Owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'member@example.test',
   '{"username":"member_two","display_name":"Member Two"}'),
  ('33333333-3333-4333-8333-333333333333', 'mod@example.test',
   '{"username":"moderator_one","display_name":"Moderator"}');

do $$
declare n integer;
begin
  select count(*) into n from public.profiles;
  if n <> 3 then
    raise exception 'TRIGGER FAILED  handle_new_user created % of 3 profiles', n;
  end if;
  raise notice 'trigger ok    handle_new_user created a profile per account';
end $$;

do $$
declare bad text;
begin
  select string_agg(username || '=' || role, ', ') into bad
    from public.profiles where role <> 'member';
  if bad is not null then
    raise exception 'PRIVILEGE BUG  a new account arrived above member: %', bad;
  end if;
  raise notice 'trigger ok    no new account can arrive above member';
end $$;

-- A requested username is sanitised into the identifier format rather than
-- failing the signup, and a collision never silently reuses a name.
do $$
declare v_created text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('44444444-4444-4444-8444-444444444444', 'messy@example.test',
          '{"username":"Owner!!","display_name":"Messy"}');
  select username into v_created from public.profiles
   where id = '44444444-4444-4444-8444-444444444444';
  if v_created is null then
    raise exception 'TRIGGER FAILED  no profile for a messy requested username';
  end if;
  if v_created !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'SANITISER BUG  produced an invalid username: %', v_created;
  end if;
  if v_created = 'owner' then
    raise exception 'COLLISION BUG  reused an existing username';
  end if;
  raise notice 'sanitise ok   "Owner!!" became "%"', v_created;
end $$;

-- ------------------------------------------------- sign-in provider accounts
-- An account made through Google, Apple, Facebook or X arrives with no
-- username of its own; handle_new_user() chooses one (migration 0009). Each
-- block below states what a provider actually sends.

-- Positive control: the Join form's own choice still wins outright. If the
-- fallbacks below were ever tried first, this is what would break.
do $$
declare v_name text;
begin
  select username into v_name from public.profiles
   where id = '11111111-1111-4111-8111-111111111111';
  if v_name is distinct from 'owner' then
    raise exception 'TRIGGER BUG  a requested username was not used as given: %', v_name;
  end if;
  raise notice 'provider ok   a requested username is still used as given';
end $$;

-- X sends the handle as preferred_username and user_name, and often no email.
do $$
declare v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('55555555-5555-4555-8555-555555555555', null,
          '{"preferred_username":"Street_Walker","user_name":"Street_Walker","full_name":"Street Walker"}');
  select username into v_name from public.profiles
   where id = '55555555-5555-4555-8555-555555555555';
  if v_name is distinct from 'street_walker' then
    raise exception 'TRIGGER BUG  an X handle did not become the username: %', v_name;
  end if;
  raise notice 'provider ok   an X handle with no email became "%"', v_name;
end $$;

-- Apple can hide the real address behind a relay whose local part is random.
-- That must not become a permanent public username when a name is available.
do $$
declare v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('66666666-6666-4666-8666-666666666666', 'k3j9x2q8vm@privaterelay.appleid.com',
          '{"full_name":"Ada Lovelace"}');
  select username into v_name from public.profiles
   where id = '66666666-6666-4666-8666-666666666666';
  if v_name like 'k3j9x2q8vm%' then
    raise exception 'TRIGGER BUG  an Apple relay address became the username: %', v_name;
  end if;
  if v_name is distinct from 'adalovelace' then
    raise exception 'TRIGGER BUG  an Apple relay account did not take its name: %', v_name;
  end if;
  raise notice 'provider ok   an Apple relay address was passed over for "%"', v_name;
end $$;

-- A source that sanitises to nothing falls through to the next one, rather
-- than straight to "member": a Thai handle, then the email address.
do $$
declare v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('77777777-7777-4777-8777-777777777777', 'nirut.photo@example.test',
          '{"preferred_username":"ช่างภาพ"}');
  select username into v_name from public.profiles
   where id = '77777777-7777-4777-8777-777777777777';
  if v_name is distinct from 'nirutphoto' then
    raise exception 'TRIGGER BUG  an unusable handle did not fall through to the email: %', v_name;
  end if;
  raise notice 'provider ok   an unusable handle fell through to "%"', v_name;
end $$;

-- A reserved name is treated as taken, whichever source offered it — an X
-- handle here, but a Gmail address of admin@… arrives the same way.
do $$
declare v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('88888888-8888-4888-8888-888888888888', 'someone@example.test',
          '{"preferred_username":"admin"}');
  select username into v_name from public.profiles
   where id = '88888888-8888-4888-8888-888888888888';
  if v_name = 'admin' then
    raise exception 'RESERVED NAME TAKEN  a provider account became "admin"';
  end if;
  if v_name !~ '^admin_[0-9a-f]{4}$' then
    raise exception 'TRIGGER BUG  a reserved name was not suffixed as a taken one would be: %', v_name;
  end if;
  raise notice 'reserved ok   a provider asking for "admin" got "%"', v_name;
end $$;

update public.profiles set role = 'moderator'
 where id = '33333333-3333-4333-8333-333333333333';

select public.test_rejects('a role outside the allowed set',
  $$update public.profiles set role = 'superadmin'
     where id = '22222222-2222-4222-8222-222222222222'$$, '23514');

select public.test_rejects('suspending an account with no reason',
  $$update public.profiles set is_suspended = true
     where id = '22222222-2222-4222-8222-222222222222'$$, '23514');

select public.test_accepts('suspending an account with a reason',
  $$update public.profiles set is_suspended = true,
          suspended_reason = 'Repeated copyright complaints.'
     where id = '22222222-2222-4222-8222-222222222222'$$);

update public.profiles set is_suspended = false, suspended_reason = null
 where id = '22222222-2222-4222-8222-222222222222';

-- --------------------------------------------- writing your own row directly
-- Migration 0010. These run as the `authenticated` role, not as the superuser
-- the rest of this file uses: the rule under test is a trigger that reads who
-- is writing, and a superuser with no session walks straight past it. Each
-- block switches role inside its own transaction so the role cannot leak.
begin;
set local role authenticated;
set local "app.current_user_id" = '22222222-2222-4222-8222-222222222222';

-- The positive control: the policy does let a member edit their own row.
select public.test_accepts('a member editing their own display name directly',
  $$update public.profiles set display_name = 'Member Two, renamed'
     where id = '22222222-2222-4222-8222-222222222222'$$);

-- The hole 0010 closes. "support" is reserved: the Join form refuses it.
select public.test_rejects('a member renaming themselves directly',
  $$update public.profiles set username = 'support'
     where id = '22222222-2222-4222-8222-222222222222'$$, '42501');

select public.test_rejects('a member promoting themselves',
  $$update public.profiles set role = 'admin'
     where id = '22222222-2222-4222-8222-222222222222'$$, '42501');
commit;

-- Renaming somebody else is not a moderation tool either.
begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('a moderator renaming another member',
  $$update public.profiles set username = 'renamed_by_mod'
     where id = '22222222-2222-4222-8222-222222222222'$$, '42501');
commit;

do $$
declare v_name text;
begin
  select username into v_name from public.profiles
   where id = '22222222-2222-4222-8222-222222222222';
  if v_name <> 'member_two' then
    raise exception 'GUARD BUG  a refused rename still changed the username to %', v_name;
  end if;
  raise notice 'guard ok      the username is unchanged after every refused attempt';
end $$;

-- ------------------------------------------------------------------ places
insert into public.locations
  (id, slug, name, city, country, country_code, latitude, longitude,
   status, approved_at, categories)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'test-backstreets',
   'Test backstreets', 'Tokyo', 'Japan', 'JP', 35.693835, 139.699738,
   'approved', now(), array['street','night']);

do $$
declare g text;
begin
  select geog::text into g from public.locations where slug = 'test-backstreets';
  if g is null then
    raise exception 'TRIGGER FAILED  locations_set_geog left geog null';
  end if;
  raise notice 'trigger ok    locations_set_geog derived the geography column';
end $$;

select public.test_rejects('latitude outside the globe',
  $$insert into public.locations (slug, name, city, country, country_code, latitude, longitude)
    values ('off-globe','Off globe','Nowhere','Nowhere','JP',91,0)$$, '23514');

select public.test_rejects('a lowercase country code',
  $$insert into public.locations (slug, name, city, country, country_code, latitude, longitude)
    values ('lower-cc','Lower','Tokyo','Japan','jp',35.6,139.7)$$, '23514');

select public.test_rejects('a category outside the taxonomy',
  $$insert into public.locations (slug, name, city, country, country_code, latitude, longitude, categories)
    values ('bad-cat','Bad','Tokyo','Japan','JP',35.6,139.7,array['wedding'])$$, '23514');

-- A restriction is a claim the platform puts its name to, so it must say
-- where the claim came from.
select public.test_accepts('a restriction with a source',
  $$insert into public.location_restrictions (location_id, kind, note, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001','no-tripod',
            'The lane is too narrow for a tripod.',
            'On-site signage recorded during a moderator review.')$$);

select public.test_rejects('a restriction with no source at all',
  $$insert into public.location_restrictions (location_id, kind, note, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001','permit','Permit required.',null)$$, '23502');

select public.test_rejects('a restriction with a blank source',
  $$insert into public.location_restrictions (location_id, kind, note, source)
    values ('aaaaaaaa-0000-4000-8000-000000000001','fee','Entry fee.','   ')$$, '23514');

-- ------------------------------------------------------------- photographs
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, location_id, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'test-published',
   '11111111-1111-4111-8111-111111111111', 'Test published',
   'A narrow city street at night lit entirely by blue and magenta signage.',
   'night', 'aaaaaaaa-0000-4000-8000-000000000001', 'published',
   now(), now(), 1800, 1200);

select public.test_rejects('publishing with no rights confirmation',
  $$insert into public.photographs
      (slug, owner_id, title, alt_text, category, status, published_at, image_width, image_height)
    values ('no-rights','11111111-1111-4111-8111-111111111111','No rights',
            'A photograph published without its uploader confirming any rights.',
            'street','published',now(),1800,1200)$$, '23514');

select public.test_accepts('the same row saved as a draft instead',
  $$insert into public.photographs (slug, owner_id, title, alt_text, category, status)
    values ('no-rights','11111111-1111-4111-8111-111111111111','No rights',
            'A photograph published without its uploader confirming any rights.',
            'street','draft')$$);

select public.test_rejects('alt text too short to describe anything',
  $$insert into public.photographs (slug, owner_id, title, alt_text)
    values ('short-alt','11111111-1111-4111-8111-111111111111','Short','brief')$$, '23514');

select public.test_rejects('removing a photograph with no reason',
  $$update public.photographs set status = 'removed'
     where slug = 'test-published'$$, '23514');

-- --------------------------------------------- the duplicate-vote guarantee
select public.test_accepts('a first appreciation',
  $$insert into public.photograph_appreciations (photograph_id, profile_id)
    values ('bbbbbbbb-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222')$$);

select public.test_rejects('the same member appreciating twice',
  $$insert into public.photograph_appreciations (photograph_id, profile_id)
    values ('bbbbbbbb-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222')$$, '23505');

select public.test_accepts('a different member appreciating the same photograph',
  $$insert into public.photograph_appreciations (photograph_id, profile_id)
    values ('bbbbbbbb-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333')$$);

delete from public.photograph_appreciations
 where photograph_id = 'bbbbbbbb-0000-4000-8000-000000000001';

-- ------------------------------------------------------------- collections
insert into public.collections (id, slug, owner_id, title, visibility)
values ('cccccccc-0000-4000-8000-000000000001','test-collection',
        '11111111-1111-4111-8111-111111111111','Test collection','public');

select public.test_accepts('a collection item holding one photograph',
  $$insert into public.collection_items (collection_id, photograph_id)
    values ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001')$$);

select public.test_accepts('a collection item holding one place',
  $$insert into public.collection_items (collection_id, location_id)
    values ('cccccccc-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001')$$);

select public.test_rejects('a collection item holding both',
  $$insert into public.collection_items (collection_id, photograph_id, location_id)
    values ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',
            'aaaaaaaa-0000-4000-8000-000000000001')$$, '23514');

select public.test_rejects('a collection item holding neither',
  $$insert into public.collection_items (collection_id)
    values ('cccccccc-0000-4000-8000-000000000001')$$, '23514');

select public.test_rejects('the same photograph saved to one collection twice',
  $$insert into public.collection_items (collection_id, photograph_id)
    values ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001')$$, '23505');

-- -------------------------------------------------------------- moderation
select public.test_accepts('approving with no reason',
  $$insert into public.moderation_actions (decision, subject_type, subject_id, moderator_id)
    values ('approve','location','aaaaaaaa-0000-4000-8000-000000000001',
            '33333333-3333-4333-8333-333333333333')$$);

select public.test_rejects('removing content with no reason',
  $$insert into public.moderation_actions (decision, subject_type, subject_id, moderator_id)
    values ('remove_content','photograph','bbbbbbbb-0000-4000-8000-000000000001',
            '33333333-3333-4333-8333-333333333333')$$, '23514');

select public.test_rejects('suspending an account with a blank reason',
  $$insert into public.moderation_actions (decision, subject_type, subject_id, moderator_id, reason)
    values ('suspend_account','profile','22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333','  ')$$, '23514');

select public.test_rejects('rejecting a submission with no reason',
  $$insert into public.location_submissions
      (proposed_name, city, country, country_code, latitude, longitude, submitted_by, status)
    values ('Rejected place','Tokyo','Japan','JP',35.6,139.7,
            '11111111-1111-4111-8111-111111111111','rejected')$$, '23514');

select public.test_accepts('rejecting a submission with a reason',
  $$insert into public.location_submissions
      (proposed_name, city, country, country_code, latitude, longitude, submitted_by,
       status, rejection_reason)
    values ('Rejected place','Tokyo','Japan','JP',35.6,139.7,
            '11111111-1111-4111-8111-111111111111','rejected',
            'The coordinates fall inside a private residence.')$$);

-- -------------------------------------------------- appreciation behaviour
-- toggle_appreciation() acts on auth.uid(). Anonymous callers must be refused
-- by the function itself, not merely by a policy.
do $$
begin
  perform public.toggle_appreciation('bbbbbbbb-0000-4000-8000-000000000001');
  raise exception 'SECURITY BUG  an anonymous caller appreciated a photograph';
exception
  when others then
    if sqlerrm like '%SECURITY BUG%' then raise; end if;
    raise notice 'anon ok       refused: %', sqlerrm;
end $$;

set "app.current_user_id" = '33333333-3333-4333-8333-333333333333';

do $$
declare r record;
begin
  select * into r from public.toggle_appreciation('bbbbbbbb-0000-4000-8000-000000000001');
  if not r.appreciated or r.count <> 1 then
    raise exception 'TOGGLE BUG  first call expected true/1, got %/%', r.appreciated, r.count;
  end if;
  select * into r from public.toggle_appreciation('bbbbbbbb-0000-4000-8000-000000000001');
  if r.appreciated or r.count <> 0 then
    raise exception 'TOGGLE BUG  second call expected false/0, got %/%', r.appreciated, r.count;
  end if;
  select * into r from public.toggle_appreciation('bbbbbbbb-0000-4000-8000-000000000001');
  if not r.appreciated or r.count <> 1 then
    raise exception 'TOGGLE BUG  third call expected true/1, got %/%', r.appreciated, r.count;
  end if;
  raise notice 'toggle ok     three calls alternate and the count follows';
end $$;

do $$
declare v_counter integer; v_rows integer;
begin
  select appreciation_count into v_counter from public.photographs
   where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  select count(*) into v_rows from public.photograph_appreciations
   where photograph_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_counter <> v_rows then
    raise exception 'DRIFT  appreciation_count=% but % rows exist', v_counter, v_rows;
  end if;
  raise notice 'counter ok    appreciation_count matches its rows';
end $$;

-- Ranking only ever counts published work, so a draft cannot be appreciated.
do $$
begin
  perform public.toggle_appreciation(
    (select id from public.photographs where slug = 'no-rights'));
  raise exception 'STATUS BUG  a draft accepted an appreciation';
exception
  when others then
    if sqlerrm like '%STATUS BUG%' then raise; end if;
    raise notice 'draft ok      refused: %', sqlerrm;
end $$;

-- ------------------------------------------------------------ rate limiting
do $$
declare r record; v_allowed integer := 0; v_denied integer := 0; i integer;
begin
  for i in 1..5 loop
    select * into r from public.check_rate_limit('test:bucket', 3, 60);
    if r.allowed then v_allowed := v_allowed + 1; else v_denied := v_denied + 1; end if;
  end loop;
  if v_allowed <> 3 or v_denied <> 2 then
    raise exception 'RATE LIMIT BUG  expected 3 allowed and 2 denied, got %/%',
      v_allowed, v_denied;
  end if;
  raise notice 'rate limit ok five calls against a limit of three: 3 allowed, 2 denied';
end $$;

do $$
declare r record;
begin
  select * into r from public.check_rate_limit('test:separate', 3, 60);
  if not r.allowed then
    raise exception 'RATE LIMIT BUG  a separate bucket was charged for another';
  end if;
  raise notice 'rate limit ok separate buckets are counted separately';
end $$;

-- Regression test for a real bug. An action that applies two limits to the same
-- caller — appreciation uses 20/minute and 200/hour — used to pass the same
-- bucket name to both checks. Each check records a hit, so every attempt was
-- counted twice and both limits bit at half their stated value. lib/rate-limit
-- now appends the window to the storage key; this reproduces the shape it
-- produces and asserts the per-minute limit is reached at 20, not 10.
do $$
declare
  r         record;
  v_allowed integer := 0;
  i         integer;
begin
  for i in 1..20 loop
    -- Exactly what checkRateLimit() now sends for one toggle.
    select * into r from public.check_rate_limit('appreciate:member@60s', 20, 60);
    if r.allowed then v_allowed := v_allowed + 1; end if;
    perform public.check_rate_limit('appreciate:member@3600s', 200, 3600);
  end loop;

  if v_allowed <> 20 then
    raise exception
      'RATE LIMIT REGRESSION  the per-minute limit of 20 allowed only % attempts; the second window is contaminating the first',
      v_allowed;
  end if;

  select * into r from public.check_rate_limit('appreciate:member@60s', 20, 60);
  if r.allowed then
    raise exception 'RATE LIMIT BUG  the 21st attempt in a minute was allowed';
  end if;
  raise notice 'rate limit ok two windows on one caller stay independent (20 allowed, 21st refused)';
end $$;

-- ----------------------------------------------------------------- storage
-- 0008_storage.sql is the only description of the bucket and of who may write
-- into it, and it was a block of SQL applied by hand before that. The point of
-- asserting it here is that a missing policy does not announce itself: the
-- storage driver uses the cookie-bound client, so an absent insert policy
-- reads as a row-level security refusal at upload time and nothing earlier.
--
-- What this cannot cover is the storage service — see the storage note in
-- local-shims.sql. The shape is checked; the HTTP path is not.
do $$
declare v_missing text; v_limit bigint; v_public boolean;
begin
  select public, file_size_limit into v_public, v_limit
    from storage.buckets where id = 'photographs';
  if not found then
    raise exception 'STORAGE GAP  the photographs bucket does not exist';
  end if;
  if not v_public then
    raise exception 'STORAGE DRIFT  the photographs bucket is not public, so no derivative is readable';
  end if;
  if v_limit is distinct from 26214400 then
    raise exception 'STORAGE DRIFT  file_size_limit is %, not UPLOAD_POLICY.maxFileBytes (26214400)', v_limit;
  end if;

  -- Named rather than counted: four policies of the wrong kinds would pass a count.
  select string_agg(want.cmd, ', ' order by want.cmd) into v_missing
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as want(cmd)
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects' and p.cmd = want.cmd
        and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%photographs%');
  if v_missing is not null then
    raise exception 'STORAGE GAP  no policy on storage.objects for: %', v_missing;
  end if;

  -- The owner-prefix rule is the whole of write authorisation, so a write
  -- policy that does not mention auth.uid() is a policy that lets a member
  -- write into somebody else's prefix.
  select string_agg(p.cmd, ', ' order by p.cmd) into v_missing
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
     and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%uid()%';
  if v_missing is not null then
    raise exception 'STORAGE GAP  write policy with no owner check: %', v_missing;
  end if;

  raise notice 'storage ok    the photographs bucket is public, capped at 25 MiB, and writable only inside the owner prefix';
end $$;


-- ------------------------------------------------------------------ summary
do $$
declare n_tables integer; n_unprotected integer; v_offenders text;
begin
  -- Application tables only. An extension installed into `public` brings its own
  -- — PostGIS puts `spatial_ref_sys` there, and a managed image may install it
  -- before the migrations run — and counting those reported a gap on a table
  -- FRAME does not own and cannot protect.
  select count(*) into n_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.oid not in (select objid from pg_depend
                        where classid = 'pg_class'::regclass and deptype = 'e');

  -- rate_limit_hits is deliberately policy-free: RLS on with no policy denies
  -- every direct read and write, leaving check_rate_limit() the only way in.
  select count(*), string_agg(c.relname, ', ' order by c.relname)
    into n_unprotected, v_offenders
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not c.relrowsecurity
     and c.oid not in (select objid from pg_depend
                        where classid = 'pg_class'::regclass and deptype = 'e');

  if n_unprotected > 0 then
    raise exception 'RLS GAP  % of % application tables have row-level security off: %',
      n_unprotected, n_tables, v_offenders;
  end if;
  raise notice 'rls ok        row-level security is enabled on all % application tables', n_tables;
  raise notice '';
  raise notice 'All database guarantees held.';
end $$;
