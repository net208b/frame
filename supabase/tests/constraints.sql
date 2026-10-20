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

-- ----------------------------------------------------------- account settings
-- Migration 0011. Unlike most of this file, these run as the `authenticated`
-- role, not as the superuser: the rules under test are a trigger that reads
-- who is writing, column grants, and EXECUTE grants, and a superuser walks
-- straight past all three. Each block that switches role does so inside its
-- own transaction, so the role cannot leak into the next test.

reset "app.current_user_id";

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('dddddddd-0000-4000-8000-000000000001', 'leaver@example.test',
   '{"username":"leaver","display_name":"Leaver"}', '{"provider":"email"}'),
  ('dddddddd-0000-4000-8000-000000000002', 'departing@example.test',
   '{"username":"departing_mod","display_name":"Departing"}', '{"provider":"email"}'),
  ('dddddddd-0000-4000-8000-000000000003', 'p.member@example.test',
   '{"full_name":"Provider Member"}', '{"provider":"google"}'),
  ('dddddddd-0000-4000-8000-000000000004', 'e.member@example.test',
   '{"username":"email_member","display_name":"Email Member"}', '{"provider":"email"}');

-- The hole 0010 closed, still closed under 0011's fuller guard.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_accepts('a member editing their own display name directly',
  $$update public.profiles set display_name = 'Renamed Member'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$);

select public.test_rejects('a member renaming themselves directly',
  $$update public.profiles set username = 'admin'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '42501');

select public.test_rejects('a member promoting themselves',
  $$update public.profiles set role = 'admin'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '42501');

select public.test_accepts('an https website',
  $$update public.profiles set website = 'https://example.test/portfolio'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$);

select public.test_rejects('a javascript: website',
  $$update public.profiles set website = 'javascript:alert(document.cookie)'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('thirteen pieces of gear',
  $$update public.profiles
       set usual_gear = array['a1','a2','a3','a4','a5','a6','a7','a8','a9','b1','b2','b3','b4']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('a gear entry that is only spaces',
  $$update public.profiles set usual_gear = array['Ricoh GR III', '   ']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

-- An email account was told its username would not change.
select public.test_rejects('an email account changing its username',
  $$select public.change_username('fresh_name')$$, '42501');
commit;

-- One change, for an account whose username was chosen for it.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000003';

select public.test_rejects('a reserved name through change_username',
  $$select public.change_username('Support')$$, '23514');
select public.test_rejects('a malformed name through change_username',
  $$select public.change_username('no spaces!')$$, '22023');
select public.test_rejects('a name already in use through change_username',
  $$select public.change_username('owner')$$, '23505');

do $$
declare v_name text; v_at timestamptz; v_result text;
begin
  -- Asking for the name you already have is not a change.
  select username::text into v_name from public.profiles
   where id = 'dddddddd-0000-4000-8000-000000000003';
  perform public.change_username(v_name);
  select username_changed_at into v_at from public.profiles
   where id = 'dddddddd-0000-4000-8000-000000000003';
  if v_at is not null then
    raise exception 'USERNAME BUG  asking for the current name used up the one change';
  end if;

  v_result := public.change_username('Street_Eye');
  select username::text, username_changed_at into v_name, v_at from public.profiles
   where id = 'dddddddd-0000-4000-8000-000000000003';
  if v_result <> 'street_eye' or v_name <> 'street_eye' or v_at is null then
    raise exception 'USERNAME BUG  the change did not land: returned %, stored %, at %', v_result, v_name, v_at;
  end if;
  raise notice 'username ok   a provider account changed its username once, to "%"', v_name;
end $$;

-- The record of that change cannot be wiped to earn a second one: the guard
-- keeps the stored value whatever a direct update asks for.
update public.profiles set username_changed_at = null
 where id = 'dddddddd-0000-4000-8000-000000000003';

select public.test_rejects('a second change after trying to erase the first',
  $$select public.change_username('street_eye_2')$$, '42501');
commit;

begin;
set local role anon;
select public.test_rejects('a signed-out visitor calling change_username',
  $$select public.change_username('visitor_name')$$, '42501');
select public.test_rejects('a signed-out visitor calling delete_own_account',
  $$select public.delete_own_account('leaver')$$, '42501');
commit;

-- Fixtures for deletion, written as the superuser with no session.
reset "app.current_user_id";

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, location_id, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'leaver-photograph',
   'dddddddd-0000-4000-8000-000000000001', 'Leaver photograph',
   'A man waiting under a station canopy while rain streaks across the lamps.',
   'night', 'aaaaaaaa-0000-4000-8000-000000000001', 'published', now(), now(), 1600, 1200),
  ('eeeeeeee-0000-4000-8000-000000000002', 'departing-photograph',
   'dddddddd-0000-4000-8000-000000000002', 'Departing photograph',
   'Two cyclists crossing a wide empty avenue in the low orange evening light.',
   'night', 'aaaaaaaa-0000-4000-8000-000000000001', 'published', now(), now(), 1600, 1200),
  ('eeeeeeee-0000-4000-8000-000000000003', 'someone-elses-photograph',
   'dddddddd-0000-4000-8000-000000000004', 'Someone else''s photograph',
   'A market stall stacked with oranges beneath a single hanging bare bulb.',
   'night', 'aaaaaaaa-0000-4000-8000-000000000001', 'published', now(), now(), 1600, 1200);

insert into public.collections (id, slug, owner_id, title, visibility) values
  ('ffffffff-0000-4000-8000-000000000001', 'leaver-collection',
   'dddddddd-0000-4000-8000-000000000001', 'Leaver collection', 'public'),
  ('ffffffff-0000-4000-8000-000000000002', 'departing-collection',
   'dddddddd-0000-4000-8000-000000000002', 'Departing collection', 'public');
insert into public.collection_items (collection_id, photograph_id) values
  ('ffffffff-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001');

insert into public.locations
  (id, slug, name, city, country, country_code, latitude, longitude,
   status, approved_at, categories, submitted_by)
values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'leaver-place', 'Leaver place',
   'Tokyo', 'Japan', 'JP', 35.701, 139.702, 'approved', now(), array['street'],
   'dddddddd-0000-4000-8000-000000000001');

insert into public.reports (id, subject_type, subject_id, reason, reported_by) values
  ('abababab-0000-4000-8000-000000000001', 'photograph',
   'eeeeeeee-0000-4000-8000-000000000003', 'spam', 'dddddddd-0000-4000-8000-000000000001');

update public.profiles set role = 'moderator', biography = 'Something personal.'
 where id = 'dddddddd-0000-4000-8000-000000000002';
insert into public.moderation_actions (decision, subject_type, subject_id, moderator_id) values
  ('approve', 'location', 'aaaaaaaa-0000-4000-8000-0000000000d1',
   'dddddddd-0000-4000-8000-000000000002');
insert into auth.sessions (user_id) values ('dddddddd-0000-4000-8000-000000000002');

-- The leaver appreciates someone else's photograph, through the real path.
set "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000001';
select public.toggle_appreciation('eeeeeeee-0000-4000-8000-000000000003');
reset "app.current_user_id";

-- An ordinary account.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000001';

select public.test_rejects('deleting an account without typing its username',
  $$select public.delete_own_account('somebody_else')$$, '22023');

do $$
declare v_result text;
begin
  v_result := public.delete_own_account('  Leaver ');
  if v_result <> 'deleted' then
    raise exception 'DELETE BUG  an ordinary account returned %', v_result;
  end if;
end $$;
commit;

do $$
declare v_count integer; v_rows integer;
begin
  if exists (select 1 from auth.users where id = 'dddddddd-0000-4000-8000-000000000001')
     or exists (select 1 from public.profiles where id = 'dddddddd-0000-4000-8000-000000000001') then
    raise exception 'DELETE BUG  the account or its profile survived deletion';
  end if;
  if exists (select 1 from public.photographs where id = 'eeeeeeee-0000-4000-8000-000000000001')
     or exists (select 1 from public.collections where id = 'ffffffff-0000-4000-8000-000000000001')
     or exists (select 1 from public.photograph_appreciations
                 where profile_id = 'dddddddd-0000-4000-8000-000000000001') then
    raise exception 'DELETE BUG  photographs, collections or appreciations survived deletion';
  end if;
  raise notice 'delete ok     the account, its photographs, collections and appreciations are gone';

  select appreciation_count into v_count from public.photographs
   where id = 'eeeeeeee-0000-4000-8000-000000000003';
  select count(*) into v_rows from public.photograph_appreciations
   where photograph_id = 'eeeeeeee-0000-4000-8000-000000000003';
  if v_count <> v_rows or v_count <> 0 then
    raise exception 'DRIFT  after deletion another member''s photograph counts % with % rows', v_count, v_rows;
  end if;
  raise notice 'delete ok     the appreciation it gave was taken off the other photograph''s count';

  if not exists (select 1 from public.locations
                  where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' and submitted_by is null) then
    raise exception 'DELETE BUG  the approved place was lost, or still names the deleted account';
  end if;
  if not exists (select 1 from public.reports
                  where id = 'abababab-0000-4000-8000-000000000001' and reported_by is null) then
    raise exception 'DELETE BUG  the report was lost, or still names the deleted account';
  end if;
  raise notice 'delete ok     the place and the report are kept, with the account reference removed';
end $$;

-- What Settings tells each member before they press the button. The demoted
-- case is the one that matters: a member who is no longer a moderator cannot
-- read moderation_actions, and must still be told their account will be kept.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
do $$
begin
  if public.deletion_would_retain_account() then
    raise exception 'RETAIN BUG  an account with no moderation decisions was told it would be kept';
  end if;
end $$;
commit;

-- Demoted by an administrator first — as the superuser, since a member cannot
-- change their own role — then asked as themselves. Rolled back, so the
-- deletion below still meets a moderator.
begin;
update public.profiles set role = 'member'
 where id = 'dddddddd-0000-4000-8000-000000000002';
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000002';
do $$
begin
  if not public.deletion_would_retain_account() then
    raise exception 'RETAIN BUG  a former moderator was told their account would be deleted, but it will be kept';
  end if;
  raise notice 'retain ok     Settings predicts both outcomes, including for a moderator since demoted';
end $$;
rollback;

-- An account that has made moderation decisions.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000002';
do $$
declare v_result text;
begin
  v_result := public.delete_own_account('departing_mod');
  if v_result <> 'retained' then
    raise exception 'RETAIN BUG  an account with moderation decisions returned %', v_result;
  end if;
end $$;
commit;

do $$
declare r record;
begin
  select * into r from public.profiles where id = 'dddddddd-0000-4000-8000-000000000002';
  if not found then
    raise exception 'RETAIN BUG  the profile that moderation decisions name was erased';
  end if;
  if r.role <> 'member' or not r.is_suspended or r.biography is not null
     or r.display_name <> 'departing_mod' then
    raise exception 'RETAIN BUG  kept account not demoted, suspended and stripped: role %, suspended %, display %',
      r.role, r.is_suspended, r.display_name;
  end if;
  if not exists (select 1 from public.moderation_actions
                  where moderator_id = 'dddddddd-0000-4000-8000-000000000002') then
    raise exception 'RETAIN BUG  the moderation decision lost its author';
  end if;
  if exists (select 1 from public.photographs where id = 'eeeeeeee-0000-4000-8000-000000000002')
     or exists (select 1 from public.collections where id = 'ffffffff-0000-4000-8000-000000000002') then
    raise exception 'RETAIN BUG  a kept account''s photographs or collections survived';
  end if;
  if (select banned_until from auth.users where id = 'dddddddd-0000-4000-8000-000000000002')
       < now() + interval '100 years'
     or exists (select 1 from auth.sessions where user_id = 'dddddddd-0000-4000-8000-000000000002') then
    raise exception 'RETAIN BUG  a kept account can still sign in, or kept a session';
  end if;
  raise notice 'retain ok     a moderator''s account is demoted, suspended, emptied and barred, and the decision keeps its author';
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

-- --------------------------------------------------- review before publishing
-- Migration 0012. Run as `authenticated`, for the same reason as the account
-- settings block: the rule is a trigger reading who is writing.

reset "app.current_user_id";

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'uploader@example.test',
   '{"username":"review_uploader","display_name":"Uploader"}', '{"provider":"email"}'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'reviewer@example.test',
   '{"username":"review_mod","display_name":"Reviewer"}', '{"provider":"email"}'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'chief@example.test',
   '{"username":"review_admin","display_name":"Chief"}', '{"provider":"email"}'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'newcomer@example.test',
   '{"username":"review_newcomer","display_name":"Newcomer"}', '{"provider":"email"}');

update public.profiles set role = 'moderator' where id = 'eeeeeeee-0000-4000-8000-000000000002';
update public.profiles set role = 'admin'     where id = 'eeeeeeee-0000-4000-8000-000000000003';

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, rights_confirmed_at,
   image_width, image_height)
values
  ('eeeeeeee-1111-4000-8000-000000000001', 'review-pending',
   'eeeeeeee-0000-4000-8000-000000000001', 'Waiting for review',
   'A cyclist crossing a wet zebra crossing under a single orange street lamp.',
   'street', 'draft', now(), 2400, 1600),
  ('eeeeeeee-1111-4000-8000-000000000002', 'review-removed',
   'eeeeeeee-0000-4000-8000-000000000001', 'Removed earlier',
   'A shuttered market stall photographed straight on in flat morning light.',
   'street', 'draft', now(), 2400, 1600);

update public.photographs
   set status = 'removed', removed_reason = 'Not the uploader''s own work.'
 where id = 'eeeeeeee-1111-4000-8000-000000000002';

-- The owner submits, and cannot publish.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';

select public.test_accepts('an owner sending their photograph to review',
  $$update public.photographs set status = 'under_review'
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$);

select public.test_rejects('an owner publishing their own photograph',
  $$update public.photographs set status = 'published', published_at = now()
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '42501');

select public.test_rejects('an owner setting a publication date',
  $$update public.photographs set published_at = now()
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '42501');

select public.test_rejects('an owner resubmitting a removed photograph',
  $$update public.photographs set status = 'under_review'
     where id = 'eeeeeeee-1111-4000-8000-000000000002'$$, '42501');

select public.test_rejects('a member calling set_member_role',
  $$select public.set_member_role('review_newcomer', 'moderator')$$, '42501');
commit;

-- A moderator publishes it.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000002';

select public.test_accepts('a moderator publishing a reviewed photograph',
  $$update public.photographs set status = 'published', published_at = now()
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$);

select public.test_rejects('a moderator calling set_member_role',
  $$select public.set_member_role('review_newcomer', 'moderator')$$, '42501');

select public.test_rejects('a moderator writing a role change into the trail by hand',
  $$insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
    values ('change_role', 'profile', 'eeeeeeee-0000-4000-8000-000000000004',
            'Role changed from member to admin.', 'eeeeeeee-0000-4000-8000-000000000002')$$, '42501');

select public.test_rejects('a moderator changing a role directly',
  $$update public.profiles set role = 'moderator'
     where id = 'eeeeeeee-0000-4000-8000-000000000004'$$, '42501');
commit;

-- The owner can still edit it once it is published.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';

select public.test_accepts('an owner retitling their published photograph',
  $$update public.photographs set title = 'Waiting for review, retitled'
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$);
commit;

-- An administrator manages roles.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000003';

select public.test_accepts('an administrator appointing a moderator',
  $$select public.set_member_role('review_newcomer', 'moderator')$$);

select public.test_rejects('an administrator changing their own role',
  $$select public.set_member_role('review_admin', 'member')$$, '42501');

select public.test_rejects('a role that does not exist',
  $$select public.set_member_role('review_newcomer', 'owner')$$, '22023');

select public.test_rejects('a username that does not exist',
  $$select public.set_member_role('nobody_by_this_name', 'moderator')$$, 'P0002');
commit;

do $$
declare v_role text; v_trail integer; v_status text;
begin
  select role into v_role from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000004';
  if v_role is distinct from 'moderator' then
    raise exception 'ROLE BUG  set_member_role did not appoint the moderator (role is %)', v_role;
  end if;

  select count(*) into v_trail
    from public.moderation_actions
   where decision = 'change_role'
     and subject_id = 'eeeeeeee-0000-4000-8000-000000000004'
     and moderator_id = 'eeeeeeee-0000-4000-8000-000000000003';
  if v_trail <> 1 then
    raise exception 'AUDIT GAP  the role change left % rows in the moderation trail, not 1', v_trail;
  end if;

  select status into v_status from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000001';
  if v_status <> 'published' then
    raise exception 'REVIEW BUG  the approved photograph is %, not published', v_status;
  end if;

  raise notice 'review ok     uploads wait for a moderator, and only an administrator changes roles, on the record';
end $$;


-- ---------------------------------------------------------- content checks
-- Migration 0013. The server trusts a 'clear' row enough to publish on it, so
-- nobody but the service role may write one.

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, rights_confirmed_at,
   image_width, image_height)
values
  ('eeeeeeee-1111-4000-8000-000000000003', 'content-check-subject',
   'eeeeeeee-0000-4000-8000-000000000001', 'Checked automatically',
   'Two umbrellas crossing a tram line in heavy rain, seen from a first-floor window.',
   'street', 'under_review', now(), 2400, 1600);

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';

select public.test_rejects('an owner recording a clear content check for their own upload',
  $$insert into public.photograph_content_checks (photograph_id, provider, verdict)
    values ('eeeeeeee-1111-4000-8000-000000000003', 'google_vision_safesearch', 'clear')$$, '42501');
commit;

-- Written as the service role would.
insert into public.photograph_content_checks (photograph_id, provider, verdict, adult, note)
values ('eeeeeeee-1111-4000-8000-000000000003', 'google_vision_safesearch', 'review', 'LIKELY',
        'The automated check rated this image: adult likely.');

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';

select public.test_rejects('an owner turning a held check into a clear one',
  $$update public.photograph_content_checks set verdict = 'clear'
     where photograph_id = 'eeeeeeee-1111-4000-8000-000000000003'$$, '42501');

do $$
begin
  if exists (select 1 from public.photograph_content_checks) then
    raise exception 'CONTENT CHECK LEAK  a member can read automated check results';
  end if;
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000002';
do $$
begin
  if not exists (select 1 from public.photograph_content_checks
                  where photograph_id = 'eeeeeeee-1111-4000-8000-000000000003') then
    raise exception 'CONTENT CHECK GAP  a moderator cannot read why an upload was held';
  end if;
  raise notice 'content ok    only the server records a check; moderators read it, members do not';
end $$;
commit;

do $$
declare v_verdict text;
begin
  select verdict into v_verdict from public.photograph_content_checks
   where photograph_id = 'eeeeeeee-1111-4000-8000-000000000003';
  if v_verdict <> 'review' then
    raise exception 'CONTENT CHECK BUG  a member changed the stored verdict to %', v_verdict;
  end if;
end $$;

-- ------------------------------------------------------- deleting your own
-- Members delete their own photographs from the photograph page, published or
-- not. RLS hides other members' rows from a DELETE rather than raising, so the
-- refusal is checked by what survives.

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, published_at, rights_confirmed_at,
   image_width, image_height)
values
  ('eeeeeeee-1111-4000-8000-000000000004', 'to-be-deleted',
   'eeeeeeee-0000-4000-8000-000000000001', 'Deleted by its owner',
   'A bus shelter at dawn with condensation running down the glass panels.',
   'street', 'published', now(), now(), 2400, 1600);

insert into public.photograph_appreciations (photograph_id, profile_id)
values ('eeeeeeee-1111-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000004');

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000004';
delete from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000004';
commit;

do $$
begin
  if not exists (select 1 from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000004') then
    raise exception 'DELETE BUG  one member deleted another member''s photograph';
  end if;
end $$;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
delete from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000004';
commit;

do $$
begin
  if exists (select 1 from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000004') then
    raise exception 'DELETE GAP  an owner could not delete their own published photograph';
  end if;
  if exists (select 1 from public.photograph_appreciations where photograph_id = 'eeeeeeee-1111-4000-8000-000000000004') then
    raise exception 'DELETE GAP  appreciation outlived the photograph it was for';
  end if;
  raise notice 'delete ok     an owner deletes their own published photograph, its dependants go with it, and nobody else can';
end $$;

-- ------------------------------------------------ nobody deletes another's
-- Every route by which a photograph, or the parts that make it show, could be
-- deleted or overwritten — tried by a member, a moderator and an
-- administrator against a photograph that is not theirs. RLS turns a forbidden
-- DELETE or UPDATE into one that matches nothing, so each attempt is judged by
-- what is still there afterwards. The owner's own delete at the end is the
-- positive control: it proves these checks can see a deletion when one happens.

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, published_at, rights_confirmed_at,
   image_width, image_height)
values
  ('eeeeeeee-1111-4000-8000-000000000005', 'not-yours-to-delete', 'eeeeeeee-0000-4000-8000-000000000001', 'Not yours to delete',
   'A cyclist under a railway bridge, the rails throwing a ladder of shadow across the road.',
   'street', 'published', now(), now(), 2400, 1600);

insert into public.photograph_images (photograph_id, variant, storage_key, width, height, byte_size, content_type)
values ('eeeeeeee-1111-4000-8000-000000000005', 'display', 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp', 2400, 1600, 1000, 'image/webp');

insert into public.photograph_metadata (photograph_id, camera_brand_text) values ('eeeeeeee-1111-4000-8000-000000000005', 'Ricoh');

insert into storage.objects (bucket_id, name, owner) values ('photographs', 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp', 'eeeeeeee-0000-4000-8000-000000000001');

create or replace function pg_temp.photo_parts_left() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000005'),
    (select count(*) from public.photograph_images where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005'),
    (select count(*) from public.photograph_metadata where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005'),
    (select count(*) from storage.objects where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp'),
    (select storage_key from public.photograph_images where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005' limit 1))
$$;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
delete from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from public.photograph_images where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from public.photograph_metadata where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
update public.photograph_images set storage_key = 'someone-else/x/display.webp' where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from storage.objects where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
update storage.objects set name = 'someone-else/x/display.webp' where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
commit;

do $$
declare v text := pg_temp.photo_parts_left();
begin
  if v <> '1,1,1,1,eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp' then
    raise exception 'CROSS-USER DELETE  a member changed another member''s photograph (left: %)', v;
  end if;
  raise notice 'isolation ok  a member cannot delete or alter another member''s photograph, images, metadata or files';
end $$;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000002';
delete from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from public.photograph_images where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from public.photograph_metadata where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
update public.photograph_images set storage_key = 'someone-else/x/display.webp' where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from storage.objects where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
update storage.objects set name = 'someone-else/x/display.webp' where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
commit;

do $$
declare v text := pg_temp.photo_parts_left();
begin
  if v <> '1,1,1,1,eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp' then
    raise exception 'CROSS-USER DELETE  a moderator changed another member''s photograph (left: %)', v;
  end if;
  raise notice 'isolation ok  a moderator cannot delete or alter another member''s photograph, images, metadata or files';
end $$;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000003';
delete from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from public.photograph_images where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from public.photograph_metadata where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
update public.photograph_images set storage_key = 'someone-else/x/display.webp' where photograph_id = 'eeeeeeee-1111-4000-8000-000000000005';
delete from storage.objects where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
update storage.objects set name = 'someone-else/x/display.webp' where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
commit;

do $$
declare v text := pg_temp.photo_parts_left();
begin
  if v <> '1,1,1,1,eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp' then
    raise exception 'CROSS-USER DELETE  an administrator changed another member''s photograph (left: %)', v;
  end if;
  raise notice 'isolation ok  an administrator cannot delete or alter another member''s photograph, images, metadata or files';
end $$;

-- Positive control: the owner can do every one of those things.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
delete from storage.objects where bucket_id = 'photographs' and name = 'eeeeeeee-0000-4000-8000-000000000001/eeeeeeee-1111-4000-8000-000000000005/display.webp';
delete from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000005';
commit;

do $$
declare v text := pg_temp.photo_parts_left();
begin
  if v <> '0,0,0,0' then
    raise exception 'OWNER DELETE GAP  the owner could not delete their own photograph and files (left: %)', v;
  end if;
  raise notice 'isolation ok  the owner deletes their own photograph and files — the checks above can see a deletion';
end $$;

-- ---------------------------------------------------- raw GPS stays private
-- Migration 0015. A member who consents to share their camera's position gives
-- it to moderators, not to the world: FRAME only ever publishes a rounded point
-- for an approved place. The raw coordinates must not be readable by a
-- visitor or by another member, even on a published photograph — while the
-- camera details beside them stay public, and the owner and moderators can
-- still read the position through photograph_exif_positions().

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, published_at, rights_confirmed_at,
   image_width, image_height)
values
  ('eeeeeeee-1111-4000-8000-000000000006', 'gps-stays-private', 'eeeeeeee-0000-4000-8000-000000000001', 'Where exactly',
   'A doorway in a narrow lane, a cat asleep on the step in the last of the sun.',
   'street', 'published', now(), now(), 2400, 1600);

insert into public.photograph_metadata
  (photograph_id, camera_brand_text, exif_gps_latitude, exif_gps_longitude, exif_gps_consent)
values ('eeeeeeee-1111-4000-8000-000000000006', 'Ricoh', 13.7466, 100.5393, true);

begin;
set local role anon;
select public.test_rejects('a visitor reading a photograph''s raw GPS',
  $$select exif_gps_latitude, exif_gps_longitude from public.photograph_metadata
     where photograph_id = 'eeeeeeee-1111-4000-8000-000000000006'$$, '42501');
select public.test_accepts('a visitor reading a published photograph''s camera',
  $$select camera_brand_text from public.photograph_metadata where photograph_id = 'eeeeeeee-1111-4000-8000-000000000006'$$);
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('another member reading a photograph''s raw GPS',
  $$select exif_gps_latitude from public.photograph_metadata where photograph_id = 'eeeeeeee-1111-4000-8000-000000000006'$$, '42501');
do $$
begin
  if exists (select 1 from public.photograph_exif_positions(array['eeeeeeee-1111-4000-8000-000000000006']::uuid[])) then
    raise exception 'GPS LEAK  another member read a photograph''s raw position through the function';
  end if;
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
do $$
declare v_lat double precision;
begin
  select latitude into v_lat from public.photograph_exif_positions(array['eeeeeeee-1111-4000-8000-000000000006']::uuid[]);
  if v_lat is distinct from 13.7466 then
    raise exception 'GPS GAP  the owner cannot read their own photograph''s position (got %)', v_lat;
  end if;
end $$;
-- The upload form still writes the position, the way publishPhotograph does:
-- an UPDATE (returning only the id), and an INSERT when there was no row. An
-- upsert would be refused, because SET col = EXCLUDED.col reads the column.
select public.test_accepts('the owner updating their own photograph''s position',
  $$update public.photograph_metadata
       set exif_gps_latitude = 13.7467, exif_gps_longitude = 100.5394, exif_gps_consent = true
     where photograph_id = 'eeeeeeee-1111-4000-8000-000000000006'
    returning photograph_id$$);
select public.test_rejects('an upsert reading back the position columns',
  $$insert into public.photograph_metadata (photograph_id, exif_gps_latitude)
    values ('eeeeeeee-1111-4000-8000-000000000006', 1)
    on conflict (photograph_id) do update set exif_gps_latitude = excluded.exif_gps_latitude$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000002';
do $$
declare v_lat double precision;
begin
  select latitude into v_lat from public.photograph_exif_positions(array['eeeeeeee-1111-4000-8000-000000000006']::uuid[]);
  if v_lat is distinct from 13.7467 then
    raise exception 'GPS GAP  a moderator cannot read the position to check it against the place (got %)', v_lat;
  end if;
  raise notice 'gps ok        raw GPS is hidden from visitors and other members; the owner and moderators can read it';
end $$;
commit;

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
