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

-- ------------------------------------------------------------------ summary
do $$
declare n_tables integer; n_unprotected integer;
begin
  select count(*) into n_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';

  -- rate_limit_hits is deliberately policy-free: RLS on with no policy denies
  -- every direct read and write, leaving check_rate_limit() the only way in.
  select count(*) into n_unprotected
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if n_unprotected > 0 then
    raise exception 'RLS GAP  % of % public tables have row-level security off',
      n_unprotected, n_tables;
  end if;
  raise notice 'rls ok        row-level security is enabled on all % public tables', n_tables;
  raise notice '';
  raise notice 'All database guarantees held.';
end $$;
