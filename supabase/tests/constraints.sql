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

-- The two facts createDraft()'s slug derivation is written around. A title in
-- any non-Latin script folds to the empty string under slugify(), so the
-- address has to be built from something else; these say why there is no
-- shortcut, and that a repeated address is refused rather than silently taken.
select public.test_rejects('a slug in the script its title was written in',
  $$insert into public.photographs (slug, owner_id, title, alt_text, category, status)
    values ('บางกะปิ','11111111-1111-4111-8111-111111111111','ตลาดเช้าบางกะปิ',
            'A morning market lit by bare bulbs, with vegetables stacked on low tables.',
            'street','draft')$$, '23514');

select public.test_rejects('a second frame at an address already taken',
  $$insert into public.photographs (slug, owner_id, title, alt_text, category, status)
    values ('test-published','11111111-1111-4111-8111-111111111111','Same address',
            'A second photograph claiming an address another photograph already has.',
            'street','draft')$$, '23505');

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

-- 0016: the five things a profile says about the member's own work.
select public.test_accepts('a country code, a style, an availability and a link',
  $$update public.profiles
       set country_code = 'JP',
           style_tags = array['black-and-white', 'candid'],
           collaboration_status = 'selective',
           critique_preference = 'technical',
           social_links = array['https://example.test/@member']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$);

select public.test_rejects('a lowercase country code',
  $$update public.profiles set country_code = 'jp'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('a style tag outside the vocabulary',
  $$update public.profiles set style_tags = array['black-and-white', 'bokeh']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('the same style tag twice',
  $$update public.profiles set style_tags = array['film', 'film']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('six style tags',
  $$update public.profiles
       set style_tags = array['black-and-white','colour','film','candid','flash','minimal']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('an invented collaboration status',
  $$update public.profiles set collaboration_status = 'maybe'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('an invented critique preference',
  $$update public.profiles set critique_preference = 'harsh'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('a javascript: social link',
  $$update public.profiles set social_links = array['javascript:alert(1)']
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '23514');

select public.test_rejects('five social links',
  $$update public.profiles
       set social_links = array['https://a.test','https://b.test','https://c.test',
                                'https://d.test','https://e.test']
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
  if v_limit is distinct from 52428800 then
    raise exception 'STORAGE DRIFT  file_size_limit is %, not UPLOAD_POLICY.maxFileBytes (52428800)', v_limit;
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

  raise notice 'storage ok    the photographs bucket is public, capped at 50 MiB, and writable only inside the owner prefix';
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

-- 0021: the camera-only rule. Without a camera verdict on file the owner
-- cannot send the photograph to review; a refused verdict is no better; only
-- a camera verdict, which members cannot write themselves, opens the door.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';

select public.test_rejects('sending a photograph to review with no EXIF verdict on file',
  $$update public.photographs set status = 'under_review'
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '42501');

select public.test_rejects('a member writing their own EXIF verdict',
  $$insert into public.photograph_exif_checks (photograph_id, verdict, device_class)
    values ('eeeeeeee-1111-4000-8000-000000000001', 'camera', 'camera')$$, '42501');
commit;

reset "app.current_user_id";
insert into public.photograph_exif_checks (photograph_id, verdict, device_class, missing, make, model)
values ('eeeeeeee-1111-4000-8000-000000000001', 'rejected', 'phone', '{}', 'Apple', 'iPhone 15 Pro');

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
select public.test_rejects('sending a photograph to review whose file was judged a phone',
  $$update public.photographs set status = 'under_review'
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '42501');
commit;

reset "app.current_user_id";
select public.test_rejects('an EXIF verdict outside the vocabulary',
  $$update public.photograph_exif_checks set verdict = 'maybe'
     where photograph_id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '23514');
select public.test_accepts('a declared film scan as a verdict',
  $$update public.photograph_exif_checks set verdict = 'film', film_declared = true
     where photograph_id = 'eeeeeeee-1111-4000-8000-000000000001'$$);
update public.photograph_exif_checks
   set verdict = 'camera', device_class = 'camera', film_declared = false, make = 'Fujifilm', model = 'X-Pro3',
       aperture = 1.4, shutter_speed = '1/60', iso = 1600, focal_length_mm = 35, captured_at = now()
 where photograph_id = 'eeeeeeee-1111-4000-8000-000000000001';

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

-- ------------------------------------------------- 0017: the profile cover
-- A cover is a reference to one of the member's own published photographs, so
-- the two ways of getting that wrong — somebody else's frame, and one that is
-- not published — are what these assert. Fixtures as the superuser; the
-- assertions as the member, through the same path the Settings form uses.
reset "app.current_user_id";

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, location_id, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('eeeeeeee-2222-4000-8000-000000000001', 'cover-candidate',
   'dddddddd-0000-4000-8000-000000000004', 'Cover candidate',
   'A pedestrian crossing an empty junction while the signals change behind them.',
   'street', 'aaaaaaaa-0000-4000-8000-000000000001', 'published', now(), now(), 1600, 1200),
  ('eeeeeeee-2222-4000-8000-000000000002', 'cover-draft',
   'dddddddd-0000-4000-8000-000000000004', 'Cover draft',
   'A half-finished frame of a market street, saved as a draft and never published.',
   'street', 'aaaaaaaa-0000-4000-8000-000000000001', 'draft', null, null, 1600, 1200);

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_accepts('a cover that is the member''s own published photograph',
  $$update public.profiles set cover_photograph_id = 'eeeeeeee-2222-4000-8000-000000000001'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$);

select public.test_rejects('a cover that is their own draft',
  $$update public.profiles set cover_photograph_id = 'eeeeeeee-2222-4000-8000-000000000002'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '42501');

select public.test_rejects('a cover that is somebody else''s photograph',
  $$update public.profiles set cover_photograph_id = 'eeeeeeee-0000-4000-8000-000000000001'
     where id = 'dddddddd-0000-4000-8000-000000000004'$$, '42501');

select public.test_accepts('clearing the cover',
  $$update public.profiles set cover_photograph_id = null
     where id = 'dddddddd-0000-4000-8000-000000000004'$$);
commit;

-- Deleting the photograph clears the reference rather than leaving a profile
-- pointing at a row that is gone.
do $$
declare v_cover uuid;
begin
  update public.profiles set cover_photograph_id = 'eeeeeeee-2222-4000-8000-000000000001'
   where id = 'dddddddd-0000-4000-8000-000000000004';
  delete from public.photographs where id = 'eeeeeeee-2222-4000-8000-000000000001';

  select cover_photograph_id into v_cover
    from public.profiles where id = 'dddddddd-0000-4000-8000-000000000004';
  if v_cover is not null then
    raise exception 'COVER GAP  deleting the photograph left the profile pointing at it (%)', v_cover;
  end if;
  raise notice 'cover ok      deleting the photograph clears the profile cover';
end $$;

-- ------------------------------------------------------- 0018: photobooks
-- Fixtures as the superuser: a second published frame for the email member,
-- then the assertions as that member through the same path the editor uses.
reset "app.current_user_id";

insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, location_id, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('eeeeeeee-3333-4000-8000-000000000001', 'book-page-one',
   'dddddddd-0000-4000-8000-000000000004', 'Book page one',
   'A woman waiting at a crossing with a red umbrella against grey tower blocks.',
   'street', 'aaaaaaaa-0000-4000-8000-000000000001', 'published', now(), now(), 1600, 1200),
  ('eeeeeeee-3333-4000-8000-000000000002', 'book-page-draft',
   'dddddddd-0000-4000-8000-000000000004', 'Book page draft',
   'A half-finished frame of a station concourse, saved as a draft and never published.',
   'street', 'aaaaaaaa-0000-4000-8000-000000000001', 'draft', null, null, 1600, 1200);

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_accepts('a member making their one photobook',
  $$insert into public.photobooks (id, owner_id, slug, title, cover_preset, paper_preset, visibility)
    values ('abcdabcd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004',
            'email-member-book', 'After Hours', 'linen', 'lustre', 'unlisted')$$);

-- 0019: the shelf. A second book is fine; a thirteenth is not.
select public.test_accepts('a second photobook for the same member',
  $$insert into public.photobooks (owner_id, slug, title, position)
    values ('dddddddd-0000-4000-8000-000000000004', 'email-member-book-two', 'Second', 2)$$);

select public.test_rejects('a shelf position past the twelfth slot',
  $$update public.photobooks set position = 13 where slug = 'email-member-book-two'$$, '23514');

-- Fill the shelf to twelve through the same path the editor uses, then ask
-- for one more.
do $$
declare i integer;
begin
  for i in 3..12 loop
    insert into public.photobooks (owner_id, slug, title, position)
    values ('dddddddd-0000-4000-8000-000000000004', 'email-member-book-' || i, 'Book ' || i, i);
  end loop;
end $$;

select public.test_rejects('a thirteenth photobook for the same member',
  $$insert into public.photobooks (owner_id, slug, title)
    values ('dddddddd-0000-4000-8000-000000000004', 'email-member-book-13', 'Thirteen')$$, '23514');

-- Back to one spare book so the page assertions below read as they always did.
delete from public.photobooks
 where owner_id = 'dddddddd-0000-4000-8000-000000000004'
   and slug <> 'email-member-book' and slug <> 'email-member-book-two';

select public.test_rejects('a photobook with a private visibility',
  $$update public.photobooks set visibility = 'private'
     where id = 'abcdabcd-0000-4000-8000-000000000001'$$, '23514');

select public.test_rejects('a cover preset outside the vocabulary',
  $$update public.photobooks set cover_preset = 'velvet'
     where id = 'abcdabcd-0000-4000-8000-000000000001'$$, '23514');

select public.test_rejects('a photobook owned by somebody else',
  $$insert into public.photobooks (owner_id, slug, title)
    values ('dddddddd-0000-4000-8000-000000000001', 'not-mine', 'Not mine')$$, '42501');

select public.test_accepts('a page that is the member''s own published photograph',
  $$insert into public.photobook_pages (photobook_id, photograph_id, position)
    values ('abcdabcd-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000001', 1)$$);

select public.test_rejects('a page that is the member''s own draft',
  $$insert into public.photobook_pages (photobook_id, photograph_id, position)
    values ('abcdabcd-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000002', 2)$$, '42501');

select public.test_rejects('a page that is somebody else''s photograph',
  $$insert into public.photobook_pages (photobook_id, photograph_id, position)
    values ('abcdabcd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 2)$$, '42501');

select public.test_rejects('the same photograph on two pages',
  $$insert into public.photobook_pages (photobook_id, photograph_id, position)
    values ('abcdabcd-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000001', 2)$$, '23505');

select public.test_rejects('a twenty-fifth position',
  $$insert into public.photobook_pages (photobook_id, photograph_id, position)
    values ('abcdabcd-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000001', 25)$$, '23514');
commit;

-- A visitor can open an unlisted book by its address and count an open, and
-- nothing else.
begin;
set local role anon;
do $$
declare v_count integer; v_opens integer;
begin
  select count(*) into v_count from public.photobooks where slug = 'email-member-book';
  if v_count <> 1 then raise exception 'BOOK GAP  an unlisted book is not readable by its address'; end if;
  perform public.bump_photobook_opens('email-member-book');
  select opens into v_opens from public.photobooks where slug = 'email-member-book';
  if v_opens <> 1 then raise exception 'BOOK GAP  bump_photobook_opens did not count (opens = %)', v_opens; end if;
  raise notice 'book ok       a visitor reads an unlisted book by its address and leaves one count';
end $$;
select public.test_rejects('a visitor editing a photobook',
  $$update public.photobooks set title = 'Defaced' where slug = 'email-member-book'$$, '42501');
commit;

-- ---------------------------------------------------------- 0020: photo series
-- The same member, the same two fixtures (one published, one draft), through
-- the path the editor uses.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_accepts('a member starting a series',
  $$insert into public.photo_series (id, owner_id, slug, title, standfirst, body, visibility)
    values ('5e71e5e5-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004',
            'email-member-series', 'After the Rain', 'Three corners, one evening.', 'It rained until six.', 'unlisted')$$);

select public.test_rejects('a series with a private visibility',
  $$update public.photo_series set visibility = 'private' where id = '5e71e5e5-0000-4000-8000-000000000001'$$, '23514');

select public.test_rejects('a series title past 80 characters',
  $$update public.photo_series set title = repeat('x', 81) where id = '5e71e5e5-0000-4000-8000-000000000001'$$, '23514');

select public.test_rejects('a series owned by somebody else',
  $$insert into public.photo_series (owner_id, slug, title)
    values ('dddddddd-0000-4000-8000-000000000001', 'not-my-series', 'Not mine')$$, '42501');

select public.test_accepts('an item that is the member''s own published photograph',
  $$insert into public.photo_series_items (series_id, photograph_id, position, caption)
    values ('5e71e5e5-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000001', 1, 'The first corner.')$$);

select public.test_rejects('an item that is the member''s own draft',
  $$insert into public.photo_series_items (series_id, photograph_id, position)
    values ('5e71e5e5-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000002', 2)$$, '42501');

select public.test_rejects('an item that is somebody else''s photograph',
  $$insert into public.photo_series_items (series_id, photograph_id, position)
    values ('5e71e5e5-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 2)$$, '42501');

select public.test_rejects('the same photograph twice in a series',
  $$insert into public.photo_series_items (series_id, photograph_id, position)
    values ('5e71e5e5-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000001', 2)$$, '23505');

select public.test_rejects('an eleventh position',
  $$insert into public.photo_series_items (series_id, photograph_id, position)
    values ('5e71e5e5-0000-4000-8000-000000000001', 'eeeeeeee-3333-4000-8000-000000000001', 11)$$, '23514');

select public.test_rejects('a caption past 240 characters',
  $$update public.photo_series_items set caption = repeat('c', 241)
     where series_id = '5e71e5e5-0000-4000-8000-000000000001' and position = 1$$, '23514');

select public.test_accepts('a cover that is one of the series'' own frames',
  $$update public.photo_series set cover_photograph_id = 'eeeeeeee-3333-4000-8000-000000000001'
     where id = '5e71e5e5-0000-4000-8000-000000000001'$$);

select public.test_rejects('a cover that is not one of the series'' frames',
  $$update public.photo_series set cover_photograph_id = 'eeeeeeee-0000-4000-8000-000000000001'
     where id = '5e71e5e5-0000-4000-8000-000000000001'$$, '23514');

-- Fill to twenty-four, ask for one more.
do $$
declare i integer;
begin
  for i in 2..24 loop
    insert into public.photo_series (owner_id, slug, title)
    values ('dddddddd-0000-4000-8000-000000000004', 'email-member-series-' || i, 'Series ' || i);
  end loop;
end $$;
select public.test_rejects('a twenty-fifth series for the same member',
  $$insert into public.photo_series (owner_id, slug, title)
    values ('dddddddd-0000-4000-8000-000000000004', 'email-member-series-25', 'Twenty-five')$$, '23514');
delete from public.photo_series
 where owner_id = 'dddddddd-0000-4000-8000-000000000004' and slug <> 'email-member-series';
commit;

begin;
set local role anon;
do $$
declare v_count integer; v_opens integer;
begin
  select count(*) into v_count from public.photo_series where slug = 'email-member-series';
  if v_count <> 1 then raise exception 'SERIES GAP  an unlisted series is not readable by its address'; end if;
  perform public.bump_series_opens('email-member-series');
  select opens into v_opens from public.photo_series where slug = 'email-member-series';
  if v_opens <> 1 then raise exception 'SERIES GAP  bump_series_opens did not count (opens = %)', v_opens; end if;
  raise notice 'series ok     a visitor reads an unlisted series by its address and leaves one count';
end $$;
select public.test_rejects('a visitor editing a series',
  $$update public.photo_series set title = 'Defaced' where slug = 'email-member-series'$$, '42501');
commit;

-- ------------------------------------------------------------- 0022: comments
-- The email member comments on the owner's published photograph; the owner
-- hides what they do not want under their frame; a moderator's hide is on
-- the record. Fixture ids: owner eeeeeeee-0000-...-0001 owns the published
-- photograph eeeeeeee-1111-...-0001; the email member is dddddddd-...-0004.
reset "app.current_user_id";
update public.photographs set status = 'published', published_at = now()
 where id = 'eeeeeeee-1111-4000-8000-000000000001' and status <> 'published';

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_accepts('a member commenting on a published photograph',
  $$insert into public.photograph_comments (id, photograph_id, author_id, body)
    values ('c0c0c0c0-0000-4000-8000-000000000001', 'eeeeeeee-1111-4000-8000-000000000001',
            'dddddddd-0000-4000-8000-000000000004', 'The light on the far kerb is the whole picture.')$$);

select public.test_rejects('a comment written as somebody else',
  $$insert into public.photograph_comments (photograph_id, author_id, body)
    values ('eeeeeeee-1111-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'Not me.')$$, '42501');

select public.test_rejects('a comment on a draft',
  $$insert into public.photograph_comments (photograph_id, author_id, body)
    values ('eeeeeeee-3333-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000004', 'Too early.')$$, '42501');

select public.test_rejects('an empty comment',
  $$insert into public.photograph_comments (photograph_id, author_id, body)
    values ('eeeeeeee-1111-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004', '   ')$$, '23514');

select public.test_rejects('a comment past 1000 characters',
  $$insert into public.photograph_comments (photograph_id, author_id, body)
    values ('eeeeeeee-1111-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004', repeat('x', 1001))$$, '23514');

select public.test_accepts('a reply to a top-level comment',
  $$insert into public.photograph_comments (id, photograph_id, author_id, parent_id, body)
    values ('c0c0c0c0-0000-4000-8000-000000000002', 'eeeeeeee-1111-4000-8000-000000000001',
            'dddddddd-0000-4000-8000-000000000004', 'c0c0c0c0-0000-4000-8000-000000000001', 'And the shadow under it.')$$);

select public.test_rejects('a reply to a reply',
  $$insert into public.photograph_comments (photograph_id, author_id, parent_id, body)
    values ('eeeeeeee-1111-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004',
            'c0c0c0c0-0000-4000-8000-000000000002', 'Too deep.')$$, '23514');

select public.test_accepts('the author editing their own words',
  $$update public.photograph_comments set body = 'The light on the far kerb is the picture.'
     where id = 'c0c0c0c0-0000-4000-8000-000000000001'$$);

select public.test_rejects('the author moving their comment to another photograph',
  $$update public.photograph_comments set photograph_id = 'eeeeeeee-3333-4000-8000-000000000001'
     where id = 'c0c0c0c0-0000-4000-8000-000000000001'$$, '42501');

select public.test_rejects('the author hiding their own comment through the table',
  $$update public.photograph_comments set hidden_at = now()
     where id = 'c0c0c0c0-0000-4000-8000-000000000001'$$, '42501');

select public.test_rejects('a member hiding a comment under somebody else''s photograph',
  $$select public.hide_comment('c0c0c0c0-0000-4000-8000-000000000002', 'nope')$$, '42501');

select public.test_accepts('the author deleting their own comment',
  $$select public.delete_comment('c0c0c0c0-0000-4000-8000-000000000002')$$);
commit;

do $$
declare v_body text; v_count integer; v_edited timestamptz;
begin
  select body into v_body from public.photograph_comments where id = 'c0c0c0c0-0000-4000-8000-000000000002';
  if v_body <> '' then raise exception 'COMMENT GAP  a deleted comment kept its body'; end if;
  select edited_at into v_edited from public.photograph_comments where id = 'c0c0c0c0-0000-4000-8000-000000000001';
  if v_edited is null then raise exception 'COMMENT GAP  an edit was not marked as edited'; end if;
  select comment_count into v_count from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000001';
  if v_count <> 1 then raise exception 'COMMENT GAP  comment_count is % after one live comment and one deleted', v_count; end if;
  raise notice 'comment ok    a delete clears the body, an edit is marked, and the count follows the rows';
end $$;

-- The owner hides; a moderator hides on the record; a visitor cannot read a hidden one.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
select public.test_accepts('the photograph''s owner hiding a comment under their frame',
  $$select public.hide_comment('c0c0c0c0-0000-4000-8000-000000000001', 'off topic')$$);
commit;

begin;
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.photograph_comments where id = 'c0c0c0c0-0000-4000-8000-000000000001';
  if v_count <> 0 then raise exception 'COMMENT GAP  a visitor can read a hidden comment'; end if;
  raise notice 'comment ok    a hidden comment is invisible to a visitor';
end $$;
commit;

reset "app.current_user_id";
insert into public.photograph_comments (id, photograph_id, author_id, body)
values ('c0c0c0c0-0000-4000-8000-000000000003', 'eeeeeeee-1111-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-000000000004', 'For a moderator to look at.');
begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('a moderator hiding a comment, with a reason',
  $$select public.hide_comment('c0c0c0c0-0000-4000-8000-000000000003', 'Personal attack.')$$);
commit;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.moderation_actions
   where subject_type = 'comment' and subject_id = 'c0c0c0c0-0000-4000-8000-000000000003' and decision = 'remove_content';
  if v_count <> 1 then raise exception 'COMMENT GAP  a moderator''s hide was not written to the trail'; end if;
  raise notice 'comment ok    a moderator''s hide is on the record with its reason';
end $$;

-- ------------------------------- 0023: following, and being told about it
-- Fixture ids as above: the owner eeeeeeee-…-0001, the email member
-- dddddddd-…-0004, the moderator 33333333-…, and the owner's published
-- photograph eeeeeeee-1111-…-0001.
reset "app.current_user_id";

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_rejects('following oneself',
  $$insert into public.profile_follows (follower_id, followee_id)
    values ('dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004')$$, '23514');

select public.test_rejects('following as somebody else',
  $$insert into public.profile_follows (follower_id, followee_id)
    values ('eeeeeeee-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333')$$, '42501');

select public.test_accepts('a member following a photographer',
  $$insert into public.profile_follows (follower_id, followee_id)
    values ('dddddddd-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000001')$$);

select public.test_rejects('following the same photographer twice',
  $$insert into public.profile_follows (follower_id, followee_id)
    values ('dddddddd-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000001')$$, '23505');

select public.test_rejects('editing a follow',
  $$update public.profile_follows set followee_id = '33333333-3333-4333-8333-333333333333'
     where follower_id = 'dddddddd-0000-4000-8000-000000000004'$$, '42501');

commit;

-- Somebody else's follow is not the member's to undo. A delete the policy
-- filters out does not raise — it matches nothing — so the check is that the
-- row is still standing afterwards.
reset "app.current_user_id";
insert into public.profile_follows (follower_id, followee_id)
values ('eeeeeeee-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333')
on conflict do nothing;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
delete from public.profile_follows
 where follower_id = 'eeeeeeee-0000-4000-8000-000000000001';
commit;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.profile_follows
   where follower_id = 'eeeeeeee-0000-4000-8000-000000000001'
     and followee_id = '33333333-3333-4333-8333-333333333333';
  if v_count <> 1 then raise exception 'FOLLOW GAP  a member undid somebody else''s follow'; end if;
  raise notice 'follow ok    one member cannot undo another member''s follow';
end $$;

do $$
declare v_followers integer; v_following integer; v_notified integer;
begin
  select follower_count into v_followers from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000001';
  select following_count into v_following from public.profiles where id = 'dddddddd-0000-4000-8000-000000000004';
  if v_followers <> 1 then raise exception 'FOLLOW GAP  follower_count is % after one follow', v_followers; end if;
  if v_following <> 1 then raise exception 'FOLLOW GAP  following_count is % after one follow', v_following; end if;

  select count(*) into v_notified from public.notifications
   where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001' and kind = 'follow'
     and actor_id = 'dddddddd-0000-4000-8000-000000000004';
  if v_notified <> 1 then raise exception 'NOTIFY GAP  a new follower produced % notifications', v_notified; end if;
  raise notice 'follow ok    both counts follow the rows, and the photographer was told';
end $$;

-- The counts come back down, and nobody is told about their own doing.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_accepts('unfollowing one''s own follow',
  $$delete from public.profile_follows
     where follower_id = 'dddddddd-0000-4000-8000-000000000004'
       and followee_id = 'eeeeeeee-0000-4000-8000-000000000001'$$);
commit;

do $$
declare v_followers integer;
begin
  select follower_count into v_followers from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000001';
  if v_followers <> 0 then raise exception 'FOLLOW GAP  follower_count is % after unfollowing', v_followers; end if;
  raise notice 'follow ok    unfollowing puts the count back';
end $$;

-- The comment and reply written in the 0022 block above should have told the
-- photographer once, and told nobody about their own reply.
do $$
declare v_comment integer; v_self integer;
begin
  select count(*) into v_comment from public.notifications
   where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001' and kind = 'comment';
  if v_comment < 1 then raise exception 'NOTIFY GAP  a comment told the photographer % times', v_comment; end if;

  select count(*) into v_self from public.notifications where recipient_id = actor_id;
  if v_self <> 0 then raise exception 'NOTIFY GAP  % members were told about their own action', v_self; end if;
  raise notice 'notify ok    a comment reaches the photographer, and nobody hears about themselves';
end $$;

-- A member may not write a notification, for anybody, including themselves.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';

select public.test_rejects('a member inventing a notification for somebody else',
  $$insert into public.notifications (recipient_id, kind, actor_id, subject_type, subject_id, subject_label)
    values ('eeeeeeee-0000-4000-8000-000000000001', 'follow', 'dddddddd-0000-4000-8000-000000000004',
            'profile', 'dddddddd-0000-4000-8000-000000000004', 'Not real')$$, '42501');

select public.test_rejects('a member inventing a notification for themselves',
  $$insert into public.notifications (recipient_id, kind, subject_type, subject_id, subject_label)
    values ('dddddddd-0000-4000-8000-000000000004', 'photograph_published',
            'photograph', 'eeeeeeee-1111-4000-8000-000000000001', 'Not real')$$, '42501');
commit;

-- A recipient reads only their own, and may change only read_at.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.notifications
   where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001';
  if v_count <> 0 then raise exception 'NOTIFY GAP  a member can read % of somebody else''s notifications', v_count; end if;
  raise notice 'notify ok    a notification is readable only by the member it is about';
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';

select public.test_rejects('rewriting what a notification said',
  $$update public.notifications set subject_label = 'something else'
     where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001'$$, '42501');

select public.test_accepts('marking one''s own notifications read',
  $$select public.mark_notifications_read()$$);
commit;

do $$
declare v_unread integer;
begin
  select count(*) into v_unread from public.notifications
   where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001' and read_at is null;
  if v_unread <> 0 then raise exception 'NOTIFY GAP  % notifications stayed unread after marking all read', v_unread; end if;
  raise notice 'notify ok    marking read clears the badge and changes nothing else';
end $$;

-- ------------------------------- 0024: the approval gate, from the outside
-- The bug this replaces: approve_location_submission compared auth.uid() to
-- the moderator named in the argument only when auth.uid() was not null, so an
-- unauthenticated caller naming a real moderator's id passed both gates. The
-- probe below is the one that mattered — a signed-out caller naming the
-- moderator — and it must now be refused before anything is read or written.
reset "app.current_user_id";
insert into public.location_submissions
  (id, proposed_name, city, country, country_code, latitude, longitude, status, submitted_by)
values
  ('0ca11050-0000-4000-8000-000000000001'::uuid, 'Gate Test Alley', 'Bangkok', 'Thailand', 'TH',
   13.7563, 100.5018, 'pending', 'dddddddd-0000-4000-8000-000000000004')
on conflict (id) do nothing;

begin;
set local role anon;
select public.test_rejects('a signed-out caller approving a submission as a real moderator',
  $$select public.approve_location_submission(
      '0ca11050-0000-4000-8000-000000000001'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid)$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('an ordinary member approving a submission as a real moderator',
  $$select public.approve_location_submission(
      '0ca11050-0000-4000-8000-000000000001'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid)$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('a moderator approving under somebody else''s account',
  $$select public.approve_location_submission(
      '0ca11050-0000-4000-8000-000000000001'::uuid,
      'dddddddd-0000-4000-8000-000000000004'::uuid)$$, '42501');

select public.test_accepts('a moderator approving under their own account',
  $$select public.approve_location_submission(
      '0ca11050-0000-4000-8000-000000000001'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid)$$);
commit;

do $$
declare v_status text; v_approver uuid;
begin
  select status, resolved_by into v_status, v_approver
    from public.location_submissions where id = '0ca11050-0000-4000-8000-000000000001';
  if v_status <> 'approved' then
    raise exception 'GATE GAP  a moderator''s own approval did not go through (status %)', v_status;
  end if;
  if v_approver <> '33333333-3333-4333-8333-333333333333' then
    raise exception 'GATE GAP  the approval was recorded against %', v_approver;
  end if;
  raise notice 'gate ok      only the signed-in moderator themselves may approve, and it still works';
end $$;

-- The privileges these six tables were always supposed to withhold. TRUNCATE
-- is the one that matters most: row-level security does not cover it, so a
-- missing policy was never standing in front of it.
do $$
declare
  v_table text;
  v_role  text;
  v_priv  text;
  v_leaks text := '';
begin
  foreach v_table in array array[
    'photobooks', 'photobook_pages', 'photo_series', 'photo_series_items',
    'photograph_exif_checks', 'photograph_content_checks',
    'photograph_comments', 'profile_follows', 'notifications']
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['TRUNCATE', 'TRIGGER', 'REFERENCES'] loop
        if has_table_privilege(v_role, 'public.' || v_table, v_priv) then
          v_leaks := v_leaks || ' ' || v_role || ':' || v_priv || ' on ' || v_table || ';';
        end if;
      end loop;
    end loop;
    -- anon writes nowhere, on any of them.
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || v_table, v_priv) then
        v_leaks := v_leaks || ' anon:' || v_priv || ' on ' || v_table || ';';
      end if;
    end loop;
  end loop;

  if length(v_leaks) > 0 then
    raise exception 'PRIVILEGE GAP %', v_leaks;
  end if;
  raise notice 'privilege ok no TRUNCATE, TRIGGER or REFERENCES for either public role, and anon writes nowhere';
end $$;

-- ---------------------------------- 0025: restoring a hidden comment
-- The owner hides one; a moderator hides another. The owner may restore the
-- first and not the second; the moderator may restore either.
reset "app.current_user_id";
insert into public.photograph_comments (id, photograph_id, author_id, body)
values
  ('c0c0c0c0-0000-4000-8000-000000000011', 'eeeeeeee-1111-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000004', 'Hidden by the photographer.'),
  ('c0c0c0c0-0000-4000-8000-000000000012', 'eeeeeeee-1111-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000004', 'Hidden by a moderator.')
on conflict (id) do nothing;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
select public.test_accepts('the photographer hiding a comment',
  $$select public.hide_comment('c0c0c0c0-0000-4000-8000-000000000011', 'off topic')$$);
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('a moderator hiding a comment',
  $$select public.hide_comment('c0c0c0c0-0000-4000-8000-000000000012', 'Harassment.')$$);
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('the author restoring their own hidden comment',
  $$select public.unhide_comment('c0c0c0c0-0000-4000-8000-000000000011')$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
select public.test_rejects('the photographer overruling a moderator''s hide',
  $$select public.unhide_comment('c0c0c0c0-0000-4000-8000-000000000012')$$, '42501');
select public.test_accepts('the photographer restoring a comment they hid',
  $$select public.unhide_comment('c0c0c0c0-0000-4000-8000-000000000011')$$);
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('a moderator restoring a comment',
  $$select public.unhide_comment('c0c0c0c0-0000-4000-8000-000000000012')$$);
commit;

do $$
declare v_hidden integer; v_logged integer;
begin
  select count(*) into v_hidden from public.photograph_comments
   where id in ('c0c0c0c0-0000-4000-8000-000000000011', 'c0c0c0c0-0000-4000-8000-000000000012')
     and (hidden_at is not null or hidden_by is not null or hidden_reason is not null);
  if v_hidden <> 0 then raise exception 'UNHIDE GAP  % restored comments still carry hidden state', v_hidden; end if;

  select count(*) into v_logged from public.moderation_actions
   where subject_type = 'comment' and subject_id = 'c0c0c0c0-0000-4000-8000-000000000012'
     and decision = 'approve';
  if v_logged <> 1 then raise exception 'UNHIDE GAP  a moderator''s restore was not on the record'; end if;
  raise notice 'unhide ok    restoring clears the hidden state, and a moderator''s restore is recorded';
end $$;

-- ----------------------------------- 0025: who may EXECUTE what
do $$
declare
  v_fn   text;
  v_gaps text := '';
begin
  -- Internal helpers: neither public role.
  foreach v_fn in array array[
    'public.record_notification(uuid, text, uuid, text, uuid, text, text)',
    'public.check_rate_limit(text, integer, integer)']
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then v_gaps := v_gaps || ' anon:' || v_fn || ';'; end if;
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then v_gaps := v_gaps || ' authenticated:' || v_fn || ';'; end if;
  end loop;

  -- Writes: signed-in members only.
  foreach v_fn in array array[
    'public.approve_location_submission(uuid, uuid)', 'public.set_member_role(text, text)',
    'public.change_username(text)', 'public.delete_own_account(text)',
    'public.toggle_appreciation(uuid)', 'public.toggle_follow(uuid)',
    'public.delete_comment(uuid)', 'public.hide_comment(uuid, text)',
    'public.unhide_comment(uuid)', 'public.mark_notifications_read(uuid[])']
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then v_gaps := v_gaps || ' anon:' || v_fn || ';'; end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      v_gaps := v_gaps || ' authenticated LOST ' || v_fn || ';';
    end if;
  end loop;

  if length(v_gaps) > 0 then raise exception 'EXECUTE GAP %', v_gaps; end if;
  raise notice 'execute ok   helpers are internal, writes need a session, members keep what they use';
end $$;

-- ------------------------------ 0026: nobody lists somebody else's folder
-- A public bucket serves its files without consulting row-level security, so
-- the read policy only governs listing and authenticated download. Those are
-- now a member's own folder and nothing else.
reset "app.current_user_id";
insert into storage.objects (bucket_id, name) values
  ('photographs', 'dddddddd-0000-4000-8000-000000000004/aaaaaaaa-0000-4000-8000-000000000001/grid.webp'),
  ('photographs', 'eeeeeeee-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000002/original')
on conflict (bucket_id, name) do nothing;

begin;
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from storage.objects where bucket_id = 'photographs';
  if v_count <> 0 then raise exception 'STORAGE GAP  a visitor can list % objects in the bucket', v_count; end if;
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
do $$
declare v_own integer; v_others integer;
begin
  select count(*) into v_own from storage.objects
   where bucket_id = 'photographs' and name like 'dddddddd-0000-4000-8000-000000000004/%';
  select count(*) into v_others from storage.objects
   where bucket_id = 'photographs' and name not like 'dddddddd-0000-4000-8000-000000000004/%';
  if v_own < 1 then raise exception 'STORAGE GAP  a member cannot see their own objects'; end if;
  if v_others <> 0 then raise exception 'STORAGE GAP  a member can list % objects of other members', v_others; end if;
  raise notice 'storage ok   a visitor lists nothing, a member lists only their own folder';
end $$;
commit;

do $$
begin
  if has_sequence_privilege('anon', 'public.rate_limit_hits_id_seq', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.rate_limit_hits_id_seq', 'USAGE')
     or has_sequence_privilege('anon', 'public.rate_limit_hits_id_seq', 'UPDATE')
     or has_sequence_privilege('authenticated', 'public.rate_limit_hits_id_seq', 'UPDATE') then
    raise exception 'PRIVILEGE GAP  a public role can still use rate_limit_hits_id_seq';
  end if;
  raise notice 'sequence ok  the rate-limit sequence is the owner''s alone';
end $$;

-- ---------------------------------------------------------- 0027: challenges
-- Fixtures: two published photographs of the email member (dddddddd-…-0004),
-- one made long ago and one made today; an open challenge with the new-work
-- rule and an allowance of one; a closed challenge with one entry in it.
reset "app.current_user_id";
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status,
   published_at, rights_confirmed_at, image_width, image_height, captured_at)
values
  ('cafecafe-0000-4000-8000-000000000001', 'challenge-old', 'dddddddd-0000-4000-8000-000000000004',
   'An old frame', 'A tram crossing an empty square under a low winter sun in the old town.',
   'street', 'published', now(), now(), 1800, 1200, now() - interval '400 days'),
  ('cafecafe-0000-4000-8000-000000000002', 'challenge-new', 'dddddddd-0000-4000-8000-000000000004',
   'A new frame', 'Two cyclists passing a shuttered market stall in the early morning light.',
   'street', 'published', now(), now(), 1800, 1200, now()),
  ('cafecafe-0000-4000-8000-000000000003', 'challenge-draft', 'dddddddd-0000-4000-8000-000000000004',
   'A draft frame', 'A woman reading on a bench while pigeons gather around her shoes.',
   'street', 'draft', null, null, null, null, now())
on conflict (id) do nothing;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('a member setting a challenge',
  $$insert into public.challenges (slug, title_en, title_th, brief_en, brief_th, opens_at, closes_at)
    values ('member-made', 'Member made', 'สมาชิกตั้งเอง', 'A challenge a member tried to set themselves.',
            'หัวข้อที่สมาชิกพยายามตั้งขึ้นเองโดยไม่ใช่ทีมงาน', now(), now() + interval '20 days')$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('staff setting an open challenge',
  $$insert into public.challenges (id, slug, title_en, title_th, brief_en, brief_th,
                                   opens_at, closes_at, max_entries, requires_new_work)
    values ('c4a11e00-0000-4000-8000-000000000001', 'night-light', 'Night light', 'แสงยามค่ำ',
            'Streets after dark, lit by whatever the city leaves on.',
            'ถนนหลังพระอาทิตย์ตก สว่างด้วยแสงที่เมืองทิ้งไว้',
            now() - interval '1 day', now() + interval '20 days', 1, true)$$);
select public.test_rejects('a second challenge overlapping the first',
  $$insert into public.challenges (slug, title_en, title_th, brief_en, brief_th, opens_at, closes_at)
    values ('overlap', 'Overlap', 'ซ้อนกัน', 'A window that runs into the open challenge.',
            'ช่วงเวลาที่ทับซ้อนกับหัวข้อที่เปิดอยู่', now() + interval '10 days', now() + interval '30 days')$$, '23P01');
select public.test_rejects('a challenge that closes before it opens',
  $$insert into public.challenges (slug, title_en, title_th, brief_en, brief_th, opens_at, closes_at)
    values ('backwards', 'Backwards', 'กลับด้าน', 'A window that ends before it begins at all.',
            'ช่วงเวลาที่จบก่อนจะเริ่มต้นด้วยซ้ำ', now() + interval '90 days', now() + interval '80 days')$$, '23514');
select public.test_rejects('changing the allowance of a challenge that has opened',
  $$update public.challenges set max_entries = 5 where id = 'c4a11e00-0000-4000-8000-000000000001'$$, '42501');
select public.test_accepts('correcting the copy of a challenge that has opened',
  $$update public.challenges set title_en = 'Night lights' where id = 'c4a11e00-0000-4000-8000-000000000001'$$);
select public.test_rejects('publishing results by writing the column',
  $$update public.challenges set results_published_at = now() where id = 'c4a11e00-0000-4000-8000-000000000001'$$, '42501');
commit;

-- The closed challenge, and an entry in it, are history: written as fixtures
-- past the triggers that would (correctly) refuse them today.
begin;
set local session_replication_role = replica;
insert into public.challenges (id, slug, title_en, title_th, brief_en, brief_th, opens_at, closes_at)
values ('c4a11e00-0000-4000-8000-000000000002', 'last-month', 'Last month', 'เดือนที่แล้ว',
        'The challenge that closed a couple of days ago.', 'หัวข้อที่ปิดรับไปเมื่อสองสามวันก่อน',
        now() - interval '30 days', now() - interval '2 days');
insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
values ('c4a11e00-0000-4000-8000-000000000002', 'cafecafe-0000-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-000000000004');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('entering an old photograph into a new-work challenge',
  $$insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
    values ('c4a11e00-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000001',
            'dddddddd-0000-4000-8000-000000000004')$$, '23514');
select public.test_rejects('entering a draft',
  $$insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
    values ('c4a11e00-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000003',
            'dddddddd-0000-4000-8000-000000000004')$$, '42501');
select public.test_rejects('entering somebody else''s photograph',
  $$insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
    values ('c4a11e00-0000-4000-8000-000000000001', 'eeeeeeee-1111-4000-8000-000000000001',
            'dddddddd-0000-4000-8000-000000000004')$$, '42501');
select public.test_accepts('entering one''s own new published photograph',
  $$insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
    values ('c4a11e00-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000002',
            'dddddddd-0000-4000-8000-000000000004')$$);
select public.test_rejects('entering a closed challenge',
  $$insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
    values ('c4a11e00-0000-4000-8000-000000000002', 'cafecafe-0000-4000-8000-000000000002',
            'dddddddd-0000-4000-8000-000000000004')$$, '42501');
select public.test_rejects('awarding as a member',
  $$insert into public.challenge_awards (challenge_id, photograph_id, award, awarded_by)
    values ('c4a11e00-0000-4000-8000-000000000002', 'cafecafe-0000-4000-8000-000000000001',
            'winner', 'dddddddd-0000-4000-8000-000000000004')$$, '42501');
-- Withdrawing from a closed challenge matches nothing rather than raising.
delete from public.challenge_entries where challenge_id = 'c4a11e00-0000-4000-8000-000000000002';
select public.test_accepts('withdrawing from the open challenge',
  $$delete from public.challenge_entries
     where challenge_id = 'c4a11e00-0000-4000-8000-000000000001'
       and photograph_id = 'cafecafe-0000-4000-8000-000000000002'$$);
select public.test_accepts('entering again after withdrawing',
  $$insert into public.challenge_entries (challenge_id, photograph_id, entrant_id)
    values ('c4a11e00-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000002',
            'dddddddd-0000-4000-8000-000000000004')$$);
commit;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.challenge_entries
   where challenge_id = 'c4a11e00-0000-4000-8000-000000000002';
  if v_count <> 1 then raise exception 'CHALLENGE GAP  an entry was withdrawn after the challenge closed'; end if;
  raise notice 'challenge ok what was entered before the close is what gets judged';
end $$;

-- Judging: staff, after the close, within the numbers, invisible until published.
begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('awarding in a challenge that is still open',
  $$insert into public.challenge_awards (challenge_id, photograph_id, award, awarded_by)
    values ('c4a11e00-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000002',
            'winner', '33333333-3333-4333-8333-333333333333')$$, '42501');
select public.test_rejects('awarding a photograph that was never entered',
  $$insert into public.challenge_awards (challenge_id, photograph_id, award, awarded_by)
    values ('c4a11e00-0000-4000-8000-000000000002', 'eeeeeeee-1111-4000-8000-000000000001',
            'winner', '33333333-3333-4333-8333-333333333333')$$, '23503');
select public.test_rejects('publishing results with no winner',
  $$select public.publish_challenge_results('c4a11e00-0000-4000-8000-000000000002')$$, '23514');
select public.test_accepts('staff naming a winner after the close',
  $$insert into public.challenge_awards (challenge_id, photograph_id, award, note, awarded_by)
    values ('c4a11e00-0000-4000-8000-000000000002', 'cafecafe-0000-4000-8000-000000000001',
            'winner', 'The light does all the work.', '33333333-3333-4333-8333-333333333333')$$);
commit;

begin;
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.challenge_awards;
  if v_count <> 0 then raise exception 'CHALLENGE GAP  a visitor can read % unpublished awards', v_count; end if;
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('a member publishing results',
  $$select public.publish_challenge_results('c4a11e00-0000-4000-8000-000000000002')$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('staff publishing the results',
  $$select public.publish_challenge_results('c4a11e00-0000-4000-8000-000000000002')$$);
select public.test_rejects('changing an award after publication',
  $$update public.challenge_awards set award = 'runner_up'
     where challenge_id = 'c4a11e00-0000-4000-8000-000000000002'$$, '42501');
select public.test_rejects('publishing the same results twice',
  $$select public.publish_challenge_results('c4a11e00-0000-4000-8000-000000000002')$$, '42501');
commit;

do $$
declare v_visible integer; v_told integer;
begin
  set local role anon;
  select count(*) into v_visible from public.challenge_awards
   where challenge_id = 'c4a11e00-0000-4000-8000-000000000002';
  reset role;
  if v_visible <> 1 then raise exception 'CHALLENGE GAP  published awards are not public (% visible)', v_visible; end if;

  select count(*) into v_told from public.notifications
   where recipient_id = 'dddddddd-0000-4000-8000-000000000004' and kind = 'challenge_award'
     and subject_type = 'challenge' and subject_slug = 'last-month';
  if v_told <> 1 then raise exception 'CHALLENGE GAP  the winner was told % times', v_told; end if;
  raise notice 'challenge ok results appear on publication and the winner is told once';
end $$;

-- A member reads their own capture times through the function, and nobody
-- else's.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
do $$
declare v_own integer; v_others integer;
begin
  select count(*) into v_own from public.own_photograph_capture_times(
    array['cafecafe-0000-4000-8000-000000000002'::uuid]);
  select count(*) into v_others from public.own_photograph_capture_times(
    array['eeeeeeee-1111-4000-8000-000000000001'::uuid]);
  if v_own <> 1 then raise exception 'CAPTURE GAP  a member cannot read their own capture time'; end if;
  if v_others <> 0 then raise exception 'CAPTURE GAP  a member read somebody else''s capture time'; end if;
  raise notice 'capture ok   own capture times only';
end $$;
commit;

-- Deleting one's own awarded photograph still works: the award goes with it.
select public.test_accepts('a member deleting their own awarded photograph',
  $$delete from public.photographs where id = 'cafecafe-0000-4000-8000-000000000001'$$);

do $$
declare v_gaps text := '';
begin
  if has_table_privilege('anon', 'public.challenges', 'INSERT')
     or has_table_privilege('anon', 'public.challenge_entries', 'INSERT')
     or has_table_privilege('anon', 'public.challenge_awards', 'INSERT') then
    v_gaps := v_gaps || ' anon can write;';
  end if;
  if has_table_privilege('authenticated', 'public.challenges', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.challenge_entries', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.challenge_awards', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.challenge_entries', 'UPDATE') then
    v_gaps := v_gaps || ' authenticated holds TRUNCATE or entry UPDATE;';
  end if;
  if has_function_privilege('anon', 'public.publish_challenge_results(uuid)', 'EXECUTE') then
    v_gaps := v_gaps || ' anon can publish;';
  end if;
  if length(v_gaps) > 0 then raise exception 'PRIVILEGE GAP %', v_gaps; end if;
  raise notice 'challenge ok privileges were revoked first and granted back on purpose';
end $$;

-- ------------------------------- 0028–0029: the capture time is the owner's call
-- A capture time the owner did not publish must not be readable at all — not
-- dropped by the page, refused by the database. The public column carries it
-- only when they chose to.
reset "app.current_user_id";
update public.photographs
   set captured_at = '2026-09-01T18:30:00Z', publish_captured_at = false
 where id = 'cafecafe-0000-4000-8000-000000000002';
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status,
   published_at, rights_confirmed_at, image_width, image_height, captured_at, publish_captured_at)
values
  ('cafecafe-0000-4000-8000-000000000004', 'capture-published', 'dddddddd-0000-4000-8000-000000000004',
   'A published capture time', 'A man carrying a ladder across a crossing in the late afternoon rain.',
   'street', 'published', now(), now(), 1800, 1200, '2026-09-02T07:15:00Z', true)
on conflict (id) do nothing;

begin;
set local role anon;
select public.test_rejects('a visitor reading the raw capture time',
  $$select captured_at from public.photographs limit 1$$, '42501');
do $$
declare v_withheld timestamptz; v_published timestamptz;
begin
  select public_captured_at into v_withheld from public.photographs
   where id = 'cafecafe-0000-4000-8000-000000000002';
  select public_captured_at into v_published from public.photographs
   where id = 'cafecafe-0000-4000-8000-000000000004';
  if v_withheld is not null then raise exception 'CAPTURE GAP  a withheld capture time reached a visitor'; end if;
  if v_published is distinct from '2026-09-02T07:15:00Z'::timestamptz then
    raise exception 'CAPTURE GAP  a published capture time did not reach a visitor (%)', v_published;
  end if;
  raise notice 'capture ok   a withheld time reads as nothing, a published one reads as itself';
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('a member reading the raw capture time, even of their own photograph',
  $$select captured_at from public.photographs where owner_id = 'dddddddd-0000-4000-8000-000000000004'$$, '42501');
select public.test_accepts('the owner still setting the capture time of their own draft',
  $$update public.photographs set captured_at = '2026-09-03T09:00:00Z'
     where id = 'cafecafe-0000-4000-8000-000000000003'$$);
commit;

-- Every other column stays readable, so the deliberate list in 0029 cannot
-- quietly fall behind the table: a column added without a grant fails here.
do $$
declare v_missing text;
begin
  select string_agg(column_name, ', ' order by column_name) into v_missing
    from information_schema.columns
   where table_schema = 'public' and table_name = 'photographs'
     and column_name <> 'captured_at'
     and not (has_column_privilege('anon', 'public.photographs', column_name, 'SELECT')
              and has_column_privilege('authenticated', 'public.photographs', column_name, 'SELECT'));
  if v_missing is not null then
    raise exception 'GRANT GAP  photographs columns no public role can read: % — add them to the grant in 0029''s successor', v_missing;
  end if;
  if has_column_privilege('anon', 'public.photographs', 'captured_at', 'SELECT')
     or has_column_privilege('authenticated', 'public.photographs', 'captured_at', 'SELECT') then
    raise exception 'CAPTURE GAP  a public role can still read photographs.captured_at';
  end if;
  raise notice 'capture ok   every column but captured_at is readable, and captured_at by no public role';
end $$;

-- -------------------------------------------- 0030: editor's picks and features
-- Editor's pick: staff only, published only, stamped, told once.
reset "app.current_user_id";
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('a member picking a photograph',
  $$select public.set_editors_pick('eeeeeeee-1111-4000-8000-000000000001', true)$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('picking a draft',
  $$select public.set_editors_pick('cafecafe-0000-4000-8000-000000000003', true)$$, '42501');
select public.test_accepts('an editor picking a published photograph',
  $$select public.set_editors_pick('eeeeeeee-1111-4000-8000-000000000001', true)$$);
select public.test_accepts('picking it again',
  $$select public.set_editors_pick('eeeeeeee-1111-4000-8000-000000000001', true)$$);
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000001';
select public.test_rejects('the owner moving the pick date of their own picked photograph',
  $$update public.photographs set editors_picked_at = now() + interval '30 days'
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '42501');
select public.test_rejects('the owner un-picking their own photograph',
  $$update public.photographs set editors_pick = false
     where id = 'eeeeeeee-1111-4000-8000-000000000001'$$, '42501');
commit;

do $$
declare v_pick boolean; v_at timestamptz; v_told integer;
begin
  select editors_pick, editors_picked_at into v_pick, v_at
    from public.photographs where id = 'eeeeeeee-1111-4000-8000-000000000001';
  if not v_pick or v_at is null then raise exception 'PICK GAP  the pick was not recorded with its time'; end if;
  select count(*) into v_told from public.notifications
   where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001' and kind = 'editors_pick';
  if v_told <> 1 then raise exception 'PICK GAP  the photographer was told % times', v_told; end if;
  raise notice 'pick ok      an editor''s pick is stamped and the photographer told once';
end $$;

-- Features: drafts are private, publication needs three published frames,
-- goes through the function, and tells each photographer once.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('a member writing a feature',
  $$insert into public.features (slug, title_en, title_th, intro_en, intro_th)
    values ('member-piece', 'Member piece', 'บทความสมาชิก', 'A piece a member tried to publish as editorial.',
            'บทความที่สมาชิกพยายามเผยแพร่ในนามบรรณาธิการ')$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('an editor inserting a feature as already published',
  $$insert into public.features (slug, title_en, title_th, intro_en, intro_th, status, published_at)
    values ('skip-the-rules', 'Skip the rules', 'ข้ามกติกา', 'A feature that tried to go up without the function.',
            'บทความที่พยายามขึ้นโดยไม่ผ่านฟังก์ชัน', 'published', now())$$, '42501');
select public.test_accepts('an editor starting a draft',
  $$insert into public.features (id, slug, title_en, title_th, intro_en, intro_th, created_by)
    values ('fea70000-0000-4000-8000-000000000001', 'after-rain', 'After rain', 'หลังฝน',
            'Streets in the hour after the rain, when every surface is a mirror.',
            'ถนนในชั่วโมงหลังฝนตก เมื่อทุกพื้นผิวกลายเป็นกระจก', '33333333-3333-4333-8333-333333333333')$$);
select public.test_rejects('featuring a draft photograph',
  $$insert into public.feature_items (feature_id, photograph_id, position)
    values ('fea70000-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000003', 1)$$, '42501');
select public.test_accepts('featuring two published photographs',
  $$insert into public.feature_items (feature_id, photograph_id, position, caption_en)
    values ('fea70000-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000002', 1, 'The first.'),
           ('fea70000-0000-4000-8000-000000000001', 'cafecafe-0000-4000-8000-000000000004', 2, null)$$);
select public.test_rejects('publishing a feature with only two photographs',
  $$select public.publish_feature('fea70000-0000-4000-8000-000000000001', true)$$, '23514');
select public.test_accepts('adding a third',
  $$insert into public.feature_items (feature_id, photograph_id, position)
    values ('fea70000-0000-4000-8000-000000000001', 'eeeeeeee-1111-4000-8000-000000000001', 3)$$);
commit;

begin;
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.features where id = 'fea70000-0000-4000-8000-000000000001';
  if v_count <> 0 then raise exception 'FEATURE GAP  a visitor can read a draft feature'; end if;
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('publishing the feature',
  $$select public.publish_feature('fea70000-0000-4000-8000-000000000001', true)$$);
select public.test_rejects('taking it down by writing the column',
  $$update public.features set status = 'draft', published_at = null
     where id = 'fea70000-0000-4000-8000-000000000001'$$, '42501');
select public.test_accepts('taking it down with the function',
  $$select public.publish_feature('fea70000-0000-4000-8000-000000000001', false)$$);
select public.test_accepts('putting it back up',
  $$select public.publish_feature('fea70000-0000-4000-8000-000000000001', true)$$);
commit;

do $$
declare v_member integer; v_owner integer; v_visible integer;
begin
  select count(*) into v_member from public.notifications
   where recipient_id = 'dddddddd-0000-4000-8000-000000000004' and kind = 'featured';
  select count(*) into v_owner from public.notifications
   where recipient_id = 'eeeeeeee-0000-4000-8000-000000000001' and kind = 'featured';
  if v_member <> 1 or v_owner <> 1 then
    raise exception 'FEATURE GAP  photographers were told % and % times, not once each', v_member, v_owner;
  end if;
  raise notice 'feature ok   each photographer is told once, however many frames and republications';
end $$;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('cutting a published feature below three photographs',
  $$select public.set_feature_items('fea70000-0000-4000-8000-000000000001',
      '[{"photograph_id": "cafecafe-0000-4000-8000-000000000002"}]'::jsonb)$$, '23514');
select public.test_accepts('reordering a published feature with captions',
  $$select public.set_feature_items('fea70000-0000-4000-8000-000000000001',
      '[{"photograph_id": "eeeeeeee-1111-4000-8000-000000000001", "caption_en": "Now first."},
        {"photograph_id": "cafecafe-0000-4000-8000-000000000002"},
        {"photograph_id": "cafecafe-0000-4000-8000-000000000004", "caption_th": "ภาพสุดท้าย"}]'::jsonb)$$);
commit;

do $$
declare v_first uuid; v_count integer;
begin
  select photograph_id into v_first from public.feature_items
   where feature_id = 'fea70000-0000-4000-8000-000000000001' and position = 1;
  select count(*) into v_count from public.feature_items
   where feature_id = 'fea70000-0000-4000-8000-000000000001';
  if v_first <> 'eeeeeeee-1111-4000-8000-000000000001' or v_count <> 3 then
    raise exception 'FEATURE GAP  the reorder did not land whole (first %, % items)', v_first, v_count;
  end if;
  raise notice 'feature ok   items are replaced whole, in order, and never below three while published';
end $$;

-- A photograph taken down drops out of the published piece.
update public.photographs set status = 'removed', removed_reason = 'Test removal.'
 where id = 'cafecafe-0000-4000-8000-000000000004';
begin;
set local role anon;
do $$
declare v_features integer; v_items integer;
begin
  select count(*) into v_features from public.features where id = 'fea70000-0000-4000-8000-000000000001';
  select count(*) into v_items from public.feature_items where feature_id = 'fea70000-0000-4000-8000-000000000001';
  if v_features <> 1 then raise exception 'FEATURE GAP  a visitor cannot read a published feature'; end if;
  if v_items <> 2 then raise exception 'FEATURE GAP  a visitor sees % items, expected the 2 still published', v_items; end if;
  raise notice 'feature ok   a published piece is public, and a frame taken down drops out of it';
end $$;
commit;

do $$
begin
  if has_table_privilege('anon', 'public.features', 'INSERT')
     or has_table_privilege('anon', 'public.feature_items', 'INSERT')
     or has_table_privilege('authenticated', 'public.features', 'TRUNCATE')
     or has_function_privilege('anon', 'public.set_editors_pick(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.publish_feature(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_feature_items(uuid, jsonb)', 'EXECUTE') then
    raise exception 'PRIVILEGE GAP  0030 left a public role holding a write it should not';
  end if;
  raise notice 'feature ok   privileges were revoked first and granted back on purpose';
end $$;

-- ------------------------------------ 0031: originals in a private bucket
-- The original never has a public address: the bucket is private, a visitor
-- reads nothing in it, and a member reads only their own.
do $$
declare v_public boolean; v_limit bigint;
begin
  select public, file_size_limit into v_public, v_limit
    from storage.buckets where id = 'photograph-originals';
  if not found then raise exception 'STORAGE GAP  the photograph-originals bucket does not exist'; end if;
  if v_public then raise exception 'STORAGE GAP  the originals bucket is public'; end if;
  if v_limit is distinct from 52428800 then
    raise exception 'STORAGE DRIFT  the originals bucket limit is %, not 52428800', v_limit;
  end if;
end $$;

reset "app.current_user_id";
insert into storage.objects (bucket_id, name) values
  ('photograph-originals', 'dddddddd-0000-4000-8000-000000000004/aaaaaaaa-0000-4000-8000-000000000003/original'),
  ('photograph-originals', 'eeeeeeee-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000004/original')
on conflict (bucket_id, name) do nothing;

begin;
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from storage.objects where bucket_id = 'photograph-originals';
  if v_count <> 0 then raise exception 'STORAGE GAP  a visitor can see % originals', v_count; end if;
end $$;
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
do $$
declare v_own integer; v_others integer;
begin
  select count(*) into v_own from storage.objects
   where bucket_id = 'photograph-originals' and name like 'dddddddd-0000-4000-8000-000000000004/%';
  select count(*) into v_others from storage.objects
   where bucket_id = 'photograph-originals' and name not like 'dddddddd-0000-4000-8000-000000000004/%';
  if v_own <> 1 then raise exception 'STORAGE GAP  a member cannot read their own original'; end if;
  if v_others <> 0 then raise exception 'STORAGE GAP  a member can read % originals of other members', v_others; end if;
end $$;
select public.test_rejects('a member writing an original into somebody else''s prefix',
  $$insert into storage.objects (bucket_id, name)
    values ('photograph-originals', 'eeeeeeee-0000-4000-8000-000000000001/aaaaaaaa-0000-4000-8000-000000000005/original')$$,
  '42501');
select public.test_accepts('a member writing an original into their own prefix',
  $$insert into storage.objects (bucket_id, name)
    values ('photograph-originals', 'dddddddd-0000-4000-8000-000000000004/aaaaaaaa-0000-4000-8000-000000000006/original')$$);
commit;

do $$ begin
  raise notice 'storage ok   originals live in a private bucket: invisible to visitors, a member sees and writes only their own';
end $$;

-- -------------------------------------- 0032: a word from the admin
-- A notice reaches the member it is about, from staff only; and only an
-- admin's address can ask the console for a code.
reset "app.current_user_id";
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('a member sending an admin notice',
  $$select public.send_admin_notice('cafecafe-0000-4000-8000-000000000002', 'Please fix the title.')$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000003';
select public.test_rejects('an admin sending an empty notice',
  $$select public.send_admin_notice('cafecafe-0000-4000-8000-000000000002', '   ')$$, '22023');
select public.test_accepts('an admin asking a member to fix their upload',
  $$select public.send_admin_notice('cafecafe-0000-4000-8000-000000000002', 'The title names a street that is not in the frame. Reply to admin@example.test.')$$);
commit;

-- The update policy lets only the recipient touch their notifications, and the
-- guard then pins everything but read_at — so it is the recipient, not the
-- admin, who could try to rewrite the words, and is refused.
begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('the recipient changing what a notice said',
  $$update public.notifications set message = 'something else' where kind = 'admin_notice'$$, '42501');
commit;

do $$
declare v_count integer; v_message text;
begin
  select count(*), max(message) into v_count, v_message from public.notifications
   where recipient_id = 'dddddddd-0000-4000-8000-000000000004' and kind = 'admin_notice'
     and subject_type = 'photograph' and subject_id = 'cafecafe-0000-4000-8000-000000000002'
     and actor_id = 'eeeeeeee-0000-4000-8000-000000000003';
  if v_count <> 1 or v_message not like 'The title names%' then
    raise exception 'NOTICE GAP  the notice did not reach the member with its message (% rows)', v_count;
  end if;

  if not public.admin_email_is_staff('CHIEF@example.test') then
    raise exception 'NOTICE GAP  the admin''s address is not recognised as staff';
  end if;
  if public.admin_email_is_staff('mod@example.test') then
    raise exception 'NOTICE GAP  a moderator''s address can ask the console for a code';
  end if;
  if public.admin_email_is_staff('nobody@example.test') then
    raise exception 'NOTICE GAP  an unknown address is recognised';
  end if;
  if has_function_privilege('anon', 'public.admin_email_is_staff(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_email_is_staff(text)', 'EXECUTE') then
    raise exception 'NOTICE GAP  a public role can look up who is staff by email';
  end if;
  raise notice 'notice ok    a notice reaches its member unchanged, and only an admin''s address gets a code';
end $$;

-- ------------------------------------------ 0033: how a place is pinned
-- One choice, derived flags, changeable by staff and by nobody else.
-- (The backfill for places approved before 0033 cannot be exercised here:
-- every fixture is inserted after the migration runs and so takes the new
-- default. On production there were no approved places to backfill.)
reset "app.current_user_id";

insert into public.locations
  (id, slug, name, city, country, country_code, latitude, longitude, status, approved_at)
values ('aaaaaaaa-0000-4000-8000-000000000033', 'test-exact-pin', 'Exact pin', 'Bangkok', 'Thailand', 'TH',
        13.7563, 100.5018, 'approved', now())
on conflict (id) do nothing;

do $$
declare v_precision text; v_sensitive boolean; v_withhold boolean;
begin
  select pin_precision, is_sensitive, withhold_coordinates into v_precision, v_sensitive, v_withhold
    from public.locations where id = 'aaaaaaaa-0000-4000-8000-000000000033';
  if v_precision <> 'exact' or v_sensitive or v_withhold then
    raise exception 'PRECISION GAP  a new place is pinned % (sensitive=%, withhold=%)', v_precision, v_sensitive, v_withhold;
  end if;
  raise notice 'precision ok a new place is pinned exactly by default';
end $$;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
-- A member's update matches nothing under row-level security rather than
-- raising, so the check is that the precision is still what it was.
update public.locations set pin_precision = 'none' where id = 'aaaaaaaa-0000-4000-8000-000000000033';
commit;
do $$
declare v_precision text;
begin
  select pin_precision into v_precision from public.locations where id = 'aaaaaaaa-0000-4000-8000-000000000033';
  if v_precision <> 'exact' then raise exception 'PRECISION GAP  a member changed how a place is pinned'; end if;
  raise notice 'precision ok a member cannot change how a place is pinned';
end $$;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('a precision outside the four',
  $$update public.locations set pin_precision = 'street' where id = 'aaaaaaaa-0000-4000-8000-000000000033'$$, '23514');
select public.test_accepts('staff pinning a place as an area',
  $$update public.locations set pin_precision = 'area' where id = 'aaaaaaaa-0000-4000-8000-000000000033'$$);
commit;

do $$
declare v_sensitive boolean; v_withhold boolean;
begin
  select is_sensitive, withhold_coordinates into v_sensitive, v_withhold
    from public.locations where id = 'aaaaaaaa-0000-4000-8000-000000000033';
  if not v_sensitive or v_withhold then
    raise exception 'PRECISION GAP  the flags did not follow the precision (sensitive=%, withhold=%)', v_sensitive, v_withhold;
  end if;
  -- Setting a flag directly is overruled by the precision: it is derived, not chosen.
  update public.locations set withhold_coordinates = true where id = 'aaaaaaaa-0000-4000-8000-000000000033';
  select withhold_coordinates into v_withhold from public.locations where id = 'aaaaaaaa-0000-4000-8000-000000000033';
  if v_withhold then raise exception 'PRECISION GAP  a flag could be set apart from the precision'; end if;
  raise notice 'precision ok the two old flags follow the precision and cannot be set apart from it';
end $$;

-- ------------------------ 0034: a proposal remembers its photograph
-- The member proposes a place with their own published frame; approval
-- credits the frame to the new place; a frame can only ever point at an
-- approved place.
reset "app.current_user_id";
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, published_at, rights_confirmed_at, image_width, image_height)
values ('cafecafe-0000-4000-8000-000000000034', 'proposer-frame', 'dddddddd-0000-4000-8000-000000000004',
        'The frame that proposed a place', 'A cyclist crossing a wet junction under sodium light at the edge of town.',
        'street', 'published', now(), now(), 1800, 1200)
on conflict (id) do nothing;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('proposing a place with somebody else''s photograph',
  $$insert into public.location_submissions
      (proposed_name, city, country, country_code, latitude, longitude, submitted_by, photograph_id)
    values ('Not mine', 'Bangkok', 'Thailand', 'TH', 13.75, 100.5,
            'dddddddd-0000-4000-8000-000000000004', 'eeeeeeee-1111-4000-8000-000000000001')$$, '42501');
select public.test_accepts('proposing a place with one''s own photograph',
  $$insert into public.location_submissions
      (id, proposed_name, city, country, country_code, latitude, longitude, submitted_by, photograph_id)
    values ('5ab00000-0000-4000-8000-000000000034', 'Wet Junction', 'Bangkok', 'Thailand', 'TH', 13.7501, 100.5002,
            'dddddddd-0000-4000-8000-000000000004', 'cafecafe-0000-4000-8000-000000000034')$$);
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_accepts('a moderator approving the proposal',
  $$select public.approve_location_submission('5ab00000-0000-4000-8000-000000000034', '33333333-3333-4333-8333-333333333333')$$);
commit;

do $$
declare v_location uuid; v_placed uuid; v_count integer;
begin
  select approved_location_id into v_location from public.location_submissions where id = '5ab00000-0000-4000-8000-000000000034';
  select location_id into v_placed from public.photographs where id = 'cafecafe-0000-4000-8000-000000000034';
  if v_location is null or v_placed is distinct from v_location then
    raise exception 'LINK GAP  approval did not credit the proposing photograph to the place (% vs %)', v_placed, v_location;
  end if;
  select photograph_count into v_count from public.locations where id = v_location;
  if v_count <> 1 then raise exception 'LINK GAP  the new place counts % photographs, expected 1', v_count; end if;
  raise notice 'link ok      approving a proposal credits the photograph that proposed it';
end $$;

-- A member may place their own frame at an approved place later, and nowhere else.
reset "app.current_user_id";
insert into public.locations (id, slug, name, city, country, country_code, latitude, longitude, status)
values ('aaaaaaaa-0000-4000-8000-000000000034', 'still-pending', 'Still pending', 'Bangkok', 'Thailand', 'TH', 13.76, 100.51, 'pending')
on conflict (id) do nothing;

begin;
set local role authenticated;
set local "app.current_user_id" = 'dddddddd-0000-4000-8000-000000000004';
select public.test_rejects('placing a photograph at a place that is not approved',
  $$update public.photographs set location_id = 'aaaaaaaa-0000-4000-8000-000000000034'
     where id = 'cafecafe-0000-4000-8000-000000000002'$$, '42501');
select public.test_accepts('placing one''s own photograph at an approved place',
  $$update public.photographs set location_id = 'aaaaaaaa-0000-4000-8000-000000000033'
     where id = 'cafecafe-0000-4000-8000-000000000002'$$);
select public.test_accepts('taking the place off one''s own photograph',
  $$update public.photographs set location_id = null
     where id = 'cafecafe-0000-4000-8000-000000000002'$$);
commit;


-- ===========================================================================
-- 0035  The same words in the other language
-- ===========================================================================
-- Translations are written only by the service role and read only by whoever
-- can already read what they translate. The checks below are about that pair
-- of claims, and about the table refusing a translation that is not one.

-- A photograph nobody may see yet, to prove its translation is invisible too.
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status, image_width, image_height)
values
  ('ba5e0000-0000-4000-8000-000000000035', 'waiting-on-review',
   '11111111-1111-4111-8111-111111111111', 'Waiting on review',
   'A photograph still sitting in the moderation queue, not yet published.',
   'street', 'under_review', 1800, 1200)
on conflict (id) do nothing;

-- The shape of a translation row.
select public.test_rejects('a translation into the language it was written in',
  $$insert into public.content_translations
      (subject_type, subject_id, field, language, value, source_language, source_hash)
    values ('photograph', 'bbbbbbbb-0000-4000-8000-000000000001', 'title', 'en', 'Test published', 'en',
            '0000000000000000000000000000000000000000000000000000000000000000')$$, '23514');

select public.test_rejects('a photograph with a biography',
  $$insert into public.content_translations
      (subject_type, subject_id, field, language, value, source_language, source_hash)
    values ('photograph', 'bbbbbbbb-0000-4000-8000-000000000001', 'biography', 'th', 'ประวัติ', 'en',
            '0000000000000000000000000000000000000000000000000000000000000000')$$, '23514');

select public.test_rejects('a source hash that is not a sha-256',
  $$insert into public.content_translations
      (subject_type, subject_id, field, language, value, source_language, source_hash)
    values ('photograph', 'bbbbbbbb-0000-4000-8000-000000000001', 'title', 'th', 'ภาพทดสอบ', 'en', 'nope')$$, '23514');

select public.test_accepts('a translation of a published photograph',
  $$insert into public.content_translations
      (subject_type, subject_id, field, language, value, source_language, source_hash)
    values ('photograph', 'bbbbbbbb-0000-4000-8000-000000000001', 'title', 'th', 'ภาพทดสอบ', 'en',
            '1111111111111111111111111111111111111111111111111111111111111111'),
           ('photograph', 'bbbbbbbb-0000-4000-8000-000000000001', 'alt_text', 'th', 'ถนนแคบยามค่ำ', 'en',
            '2222222222222222222222222222222222222222222222222222222222222222'),
           ('photograph', 'ba5e0000-0000-4000-8000-000000000035', 'title', 'th', 'รออนุมัติ', 'en',
            '3333333333333333333333333333333333333333333333333333333333333333')$$);

-- Who can see them.
begin;
set local role anon;
do $$
declare n_published integer; n_queued integer;
begin
  select count(*) into n_published from public.content_translations
   where subject_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  select count(*) into n_queued from public.content_translations
   where subject_id = 'ba5e0000-0000-4000-8000-000000000035';

  if n_published <> 2 then
    raise exception 'TRANSLATION GAP  a visitor sees % of 2 translations of a published photograph', n_published;
  end if;
  if n_queued <> 0 then
    raise exception 'TRANSLATION LEAK  a visitor sees % translation(s) of a photograph still under review', n_queued;
  end if;
  raise notice 'translate ok a translation is visible exactly when the photograph is';
end $$;
commit;

-- Nobody writes them from a session: the table has no insert, update or
-- delete policy, so even the photograph's own owner cannot put words in it.
begin;
set local role authenticated;
set local "app.current_user_id" = '11111111-1111-4111-8111-111111111111';
select public.test_rejects('a member writing a translation',
  $$insert into public.content_translations
      (subject_type, subject_id, field, language, value, source_language, source_hash)
    values ('photograph', 'bbbbbbbb-0000-4000-8000-000000000001', 'description', 'th', 'ของปลอม', 'en',
            '4444444444444444444444444444444444444444444444444444444444444444')$$, '42501');
commit;

-- Not merely filtered to nothing by a policy: the grant itself is absent, so
-- the attempt is refused outright. That is the stronger guarantee of the two,
-- and the one the migration actually makes.
begin;
set local role authenticated;
set local "app.current_user_id" = '11111111-1111-4111-8111-111111111111';
select public.test_rejects('a member rewriting a translation',
  $$update public.content_translations set value = 'ของปลอม'
     where subject_id = 'bbbbbbbb-0000-4000-8000-000000000001' and field = 'title'$$, '42501');
select public.test_rejects('a member deleting a translation',
  $$delete from public.content_translations
     where subject_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '42501');
commit;

do $$
begin
  raise notice 'translate ok only the service role writes a translation';
end $$;

-- An edit drops the translation of the field that changed, and only that one.
update public.photographs
   set title = 'Test published, retitled'
 where id = 'bbbbbbbb-0000-4000-8000-000000000001';

do $$
declare n_title integer; n_alt integer;
begin
  select count(*) into n_title from public.content_translations
   where subject_id = 'bbbbbbbb-0000-4000-8000-000000000001' and field = 'title';
  select count(*) into n_alt from public.content_translations
   where subject_id = 'bbbbbbbb-0000-4000-8000-000000000001' and field = 'alt_text';

  if n_title <> 0 then
    raise exception 'STALE TRANSLATION  the old title survived its own edit';
  end if;
  if n_alt <> 1 then
    raise exception 'TRANSLATION GAP  editing the title threw away the alt text translation too';
  end if;
  raise notice 'translate ok editing a field drops that field''s translation and no other';
end $$;

-- And a translation does not outlive what it translates.
delete from public.photographs where id = 'ba5e0000-0000-4000-8000-000000000035';

do $$
declare n integer;
begin
  select count(*) into n from public.content_translations
   where subject_id = 'ba5e0000-0000-4000-8000-000000000035';
  if n <> 0 then
    raise exception 'ORPHAN TRANSLATION  % row(s) outlived the deleted photograph', n;
  end if;
  raise notice 'translate ok a translation does not outlive the words it translates';
end $$;


-- ===========================================================================
-- 0036  Deleting a place, for an admin
-- ===========================================================================
-- Taking a place down is a moderator's call and reversible. Deleting is the
-- admin's and is not, so the checks below are about who may, what they must
-- say, what stops them, and what is left behind afterwards.

insert into public.locations
  (id, slug, name, city, country, country_code, latitude, longitude, status, approved_at)
values
  ('de1e7e00-0000-4000-8000-000000000001', 'delete-me-empty', 'Delete me, empty',
   'Bangkok', 'Thailand', 'TH', 13.70, 100.50, 'approved', now()),
  ('de1e7e00-0000-4000-8000-000000000002', 'delete-me-busy', 'Delete me, busy',
   'Bangkok', 'Thailand', 'TH', 13.71, 100.51, 'approved', now())
on conflict (id) do nothing;

-- A published frame at the second place, which is what must protect it.
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, location_id, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('de1e7e00-0000-4000-8000-00000000000f', 'frame-at-a-doomed-place',
   '11111111-1111-4111-8111-111111111111', 'Frame at a doomed place',
   'A photograph standing between an admin and the place they want to delete.',
   'street', 'de1e7e00-0000-4000-8000-000000000002', 'published',
   now(), now(), 1800, 1200)
on conflict (id) do nothing;

-- Who may not.
begin;
set local role authenticated;
set local "app.current_user_id" = '11111111-1111-4111-8111-111111111111';
select public.test_rejects('a member deleting a place',
  $$select public.delete_location('de1e7e00-0000-4000-8000-000000000001', 'tidying up')$$, '42501');
commit;

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000002';
select public.test_rejects('a moderator deleting a place',
  $$select public.delete_location('de1e7e00-0000-4000-8000-000000000001', 'tidying up')$$, '42501');
commit;

-- What the admin must say, and what stops them.
begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000003';
select public.test_rejects('an admin deleting a place with no reason',
  $$select public.delete_location('de1e7e00-0000-4000-8000-000000000001', '   ')$$, '22023');
select public.test_rejects('deleting a place that does not exist',
  $$select public.delete_location('de1e7e00-0000-4000-8000-0000000000ff', 'tidying up')$$, 'P0002');
select public.test_rejects('deleting a place that still holds a photograph',
  $$select public.delete_location('de1e7e00-0000-4000-8000-000000000002', 'duplicate')$$, '23503');
select public.test_accepts('an admin deleting an empty place',
  $$select public.delete_location('de1e7e00-0000-4000-8000-000000000001', 'a test pin from setting the site up')$$);
commit;

do $$
declare n_place integer; n_audit integer; v_reason text;
begin
  select count(*) into n_place from public.locations
   where id = 'de1e7e00-0000-4000-8000-000000000001';
  if n_place <> 0 then
    raise exception 'DELETE GAP  the place is still there after being deleted';
  end if;

  -- moderation_actions has no foreign key to locations, which is what lets the
  -- record outlive the place. If that ever changes this assertion is the alarm.
  select count(*), max(reason) into n_audit, v_reason
    from public.moderation_actions
   where subject_type = 'location'
     and subject_id = 'de1e7e00-0000-4000-8000-000000000001'
     and decision = 'delete';
  if n_audit <> 1 then
    raise exception 'AUDIT GAP  % audit rows for the deleted place, expected 1', n_audit;
  end if;
  if position('Delete me, empty' in coalesce(v_reason, '')) = 0 then
    raise exception 'AUDIT GAP  the record does not say which place was deleted: %', v_reason;
  end if;
  raise notice 'delete ok    the place is gone and the record of it outlives it';
end $$;

-- The busy place survives, with its frame still on it.
do $$
declare v_place uuid;
begin
  select location_id into v_place from public.photographs
   where id = 'de1e7e00-0000-4000-8000-00000000000f';
  if v_place is distinct from 'de1e7e00-0000-4000-8000-000000000002' then
    raise exception 'DELETE GAP  a refused delete still moved the photograph';
  end if;
  raise notice 'delete ok    a refused delete changes nothing at all';
end $$;

-- A frame that moderation has removed does not protect a place, and loses its
-- place rather than being deleted with it.
update public.photographs set status = 'removed', removed_reason = 'for the test'
 where id = 'de1e7e00-0000-4000-8000-00000000000f';

begin;
set local role authenticated;
set local "app.current_user_id" = 'eeeeeeee-0000-4000-8000-000000000003';
select public.test_accepts('an admin deleting a place whose only frame was removed',
  $$select public.delete_location('de1e7e00-0000-4000-8000-000000000002', 'duplicate of another pin')$$);
commit;

do $$
declare n_photo integer; v_place uuid;
begin
  select count(*) into n_photo from public.photographs
   where id = 'de1e7e00-0000-4000-8000-00000000000f';
  if n_photo <> 1 then
    raise exception 'DELETE GAP  deleting a place destroyed the photograph at it';
  end if;
  select location_id into v_place from public.photographs
   where id = 'de1e7e00-0000-4000-8000-00000000000f';
  if v_place is not null then
    raise exception 'DELETE GAP  the photograph still points at a place that is gone';
  end if;
  raise notice 'delete ok    the frame outlives the place and is simply placeless';
end $$;

-- ------------------------------------------------- 0037: fingerprints
-- Fixtures of this section's own, so it does not depend on which earlier
-- frames are still here: two members, four frames. Alpha's -01 and -02 get
-- hashes two bits apart (the same picture exported twice); Beta's -03 is four
-- bits from -01 (a cross-owner near miss); Alpha's -04 is far from everything;
-- and Alpha's draft -05 is bit-for-bit identical to -01 and must never come
-- back, because only published frames do.
reset "app.current_user_id";
insert into auth.users (id, email, raw_user_meta_data) values
  ('f1a70000-0000-4000-8000-00000000000a', 'fp.alpha@example.test', '{"username":"fp_alpha"}'),
  ('f1a70000-0000-4000-8000-00000000000b', 'fp.beta@example.test',  '{"username":"fp_beta"}')
on conflict (id) do nothing;
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('f1a70000-0000-4000-8000-000000000001', 'fp-alpha-one', 'f1a70000-0000-4000-8000-00000000000a',
   'Alpha one', 'A man with an umbrella crossing a wet street under neon signs.',
   'street', 'published', now() - interval '3 days', now(), 1800, 1200),
  ('f1a70000-0000-4000-8000-000000000002', 'fp-alpha-two', 'f1a70000-0000-4000-8000-00000000000a',
   'Alpha two', 'The same wet street, the same umbrella, exported a second time.',
   'street', 'published', now() - interval '2 days', now(), 1800, 1200),
  ('f1a70000-0000-4000-8000-000000000003', 'fp-beta-one', 'f1a70000-0000-4000-8000-00000000000b',
   'Beta one', 'A wet street under neon signs photographed by somebody else entirely.',
   'street', 'published', now() - interval '1 day', now(), 1800, 1200),
  ('f1a70000-0000-4000-8000-000000000004', 'fp-alpha-far', 'f1a70000-0000-4000-8000-00000000000a',
   'Alpha far', 'An empty beach at noon with nothing in the frame but sand and sky.',
   'street', 'published', now(), now(), 1800, 1200),
  ('f1a70000-0000-4000-8000-000000000005', 'fp-alpha-draft', 'f1a70000-0000-4000-8000-00000000000a',
   'Alpha draft', 'The umbrella frame again, this time still a draft nobody can see.',
   'street', 'draft', null, null, null, null)
on conflict (id) do nothing;
insert into public.photograph_fingerprints (photograph_id, dhash) values
  ('f1a70000-0000-4000-8000-000000000001', B'1010101010101010101010101010101010101010101010101010101010101010'),
  ('f1a70000-0000-4000-8000-000000000002', B'1010101010101010101010101010101010101010101010101010101010101001'),
  ('f1a70000-0000-4000-8000-000000000003', B'1010101010101010101010101010101010101010101010101010101010100101'),
  ('f1a70000-0000-4000-8000-000000000004', B'0101010101010101010101010101010101010101010101010101010101010101'),
  ('f1a70000-0000-4000-8000-000000000005', B'1010101010101010101010101010101010101010101010101010101010101010')
on conflict (photograph_id) do nothing;

select public.test_rejects('a fingerprint shorter than 64 bits',
  $$insert into public.photograph_fingerprints (photograph_id, dhash)
    values ('f1a70000-0000-4000-8000-000000000004', B'1010')$$, '22026');

-- No public role reads the table, directly or through the function.
begin;
set local role anon;
select public.test_rejects('a visitor reading fingerprints',
  $$select dhash from public.photograph_fingerprints limit 1$$, '42501');
commit;
begin;
set local role authenticated;
set local "app.current_user_id" = 'f1a70000-0000-4000-8000-00000000000a';
select public.test_rejects('a member reading fingerprints',
  $$select dhash from public.photograph_fingerprints limit 1$$, '42501');
select public.test_rejects('a member writing a fingerprint, even of their own frame',
  $$insert into public.photograph_fingerprints (photograph_id, dhash)
    values ('f1a70000-0000-4000-8000-000000000001',
            B'0000000000000000000000000000000000000000000000000000000000000000')
    on conflict (photograph_id) do update set dhash = excluded.dhash$$, '42501');
do $$
declare n integer;
begin
  select count(*) into n from public.similar_photographs(
    array['f1a70000-0000-4000-8000-000000000001']::uuid[], 10);
  if n <> 0 then
    raise exception 'FINGERPRINT GAP  a member got % similar-photograph rows; a non-moderator must get none', n;
  end if;
  raise notice 'fingerprint ok  a member asking for matches gets no rows';
end $$;
commit;

-- A moderator gets exactly the published neighbours, nearest first, and each
-- row says whether the two frames share an owner.
begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
do $$
declare v_rows text; n integer;
begin
  select string_agg(match_slug || ':' || distance || ':' || same_owner, ' ' order by distance)
    into v_rows
    from public.similar_photographs(array['f1a70000-0000-4000-8000-000000000001']::uuid[], 10);
  if v_rows is distinct from 'fp-alpha-two:2:true fp-beta-one:4:false' then
    raise exception 'FINGERPRINT GAP  expected the two near published frames, got: %', coalesce(v_rows, '(none)');
  end if;
  -- The ceiling is honoured: at 2 bits the other member''s frame drops out.
  select count(*) into n
    from public.similar_photographs(array['f1a70000-0000-4000-8000-000000000001']::uuid[], 2);
  if n <> 1 then
    raise exception 'FINGERPRINT GAP  at a ceiling of 2 expected one match, got %', n;
  end if;
  -- One call answers for several frames at once, keyed by the frame asked about.
  select count(distinct photograph_id) into n
    from public.similar_photographs(
      array['f1a70000-0000-4000-8000-000000000001', 'f1a70000-0000-4000-8000-000000000003']::uuid[], 10);
  if n <> 2 then
    raise exception 'FINGERPRINT GAP  asking about two frames answered for %', n;
  end if;
  -- A draft with an identical hash is invisible; so is an unrelated frame.
  if exists (select 1 from public.similar_photographs(array['f1a70000-0000-4000-8000-000000000001']::uuid[], 64)
              where match_slug = 'fp-alpha-draft') then
    raise exception 'FINGERPRINT GAP  an unpublished frame came back as a match';
  end if;
  raise notice 'fingerprint ok  a moderator sees the published neighbours, nearest first, owners compared';
end $$;
commit;

-- A fingerprint goes with its photograph.
delete from public.photographs where id = 'f1a70000-0000-4000-8000-000000000005';
do $$
begin
  if exists (select 1 from public.photograph_fingerprints where photograph_id = 'f1a70000-0000-4000-8000-000000000005') then
    raise exception 'FINGERPRINT GAP  a fingerprint outlived its photograph';
  end if;
  raise notice 'fingerprint ok  the fingerprint is deleted with the photograph';
end $$;
-- ------------------------------------------------------- 0038: film scans
-- Fixtures of this section's own: one member, one published frame.
reset "app.current_user_id";
insert into auth.users (id, email, raw_user_meta_data) values
  ('f11a0000-0000-4000-8000-00000000000a', 'film.member@example.test', '{"username":"film_member"}')
on conflict (id) do nothing;
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('f11a0000-0000-4000-8000-000000000001', 'film-one', 'f11a0000-0000-4000-8000-00000000000a',
   'Film one', 'A tram at dusk on a wet street, scanned from a colour negative.',
   'street', 'published', now(), now(), 1800, 1200)
on conflict (id) do nothing;

-- The three statements a film photographer makes are public like the camera
-- texts beside them, and bounded like them.
select public.test_accepts('a frame scanned from film, said in full',
  $$insert into public.photograph_metadata (photograph_id, film_stock, film_camera, film_scanner)
    values ('f11a0000-0000-4000-8000-000000000001', 'Kodak Portra 400', 'Leica M6', 'Epson V850')
    on conflict (photograph_id) do update
      set film_stock = excluded.film_stock, film_camera = excluded.film_camera,
          film_scanner = excluded.film_scanner$$);
select public.test_rejects('a film stock longer than a name',
  $$update public.photograph_metadata set film_stock = repeat('x', 81)
     where photograph_id = 'f11a0000-0000-4000-8000-000000000001'$$, '23514');

begin;
set local role anon;
do $$
declare v_stock text;
begin
  select film_stock into v_stock from public.photograph_metadata
   where photograph_id = 'f11a0000-0000-4000-8000-000000000001';
  if v_stock is distinct from 'Kodak Portra 400' then
    raise exception 'FILM GAP  a visitor cannot read the film statements (got %)', coalesce(v_stock, 'null');
  end if;
  raise notice 'film ok       the film statements are public, like the camera texts beside them';
end $$;
commit;

-- A scanner is a device class the verdict row may record; a made-up one is not.
select public.test_accepts('a verdict that names a scanner',
  $$insert into public.photograph_exif_checks (photograph_id, verdict, device_class, make, model, film_declared)
    values ('f11a0000-0000-4000-8000-000000000001', 'film', 'scanner', 'EPSON', 'Perfection V850', true)
    on conflict (photograph_id) do update
      set verdict = excluded.verdict, device_class = excluded.device_class,
          make = excluded.make, model = excluded.model, film_declared = excluded.film_declared$$);
select public.test_rejects('a device class the gate does not know',
  $$update public.photograph_exif_checks set device_class = 'typewriter'
     where photograph_id = 'f11a0000-0000-4000-8000-000000000001'$$, '23514');

-- "Not from film or a camera" is a reason a member may report under.
select public.test_accepts('reporting a declared scan as not from film',
  $$insert into public.reports (reported_by, subject_type, subject_id, reason, details)
    values ('22222222-2222-4222-8222-222222222222', 'photograph',
            'f11a0000-0000-4000-8000-000000000001', 'not-film-or-camera',
            'The grain is a filter and the border is pasted on.')$$);
select public.test_rejects('a reason the dialog does not offer',
  $$insert into public.reports (reported_by, subject_type, subject_id, reason)
    values ('22222222-2222-4222-8222-222222222222', 'photograph',
            'f11a0000-0000-4000-8000-000000000001', 'ugly')$$, '23514');
-- ------------------------------------------------- 0039: merging a place
-- Fixtures of this section's own: a member, two approved places 60 m apart,
-- a published frame and a draft at the loser, a frame at the survivor, a
-- collection holding both (one item each) and another holding only the loser,
-- a sourced restriction on the loser, and the proposal that produced it.
reset "app.current_user_id";
insert into auth.users (id, email, raw_user_meta_data) values
  ('3e49e000-0000-4000-8000-00000000000a', 'merge.member@example.test', '{"username":"merge_member"}')
on conflict (id) do nothing;
insert into public.locations
  (id, slug, name, city, country, country_code, latitude, longitude, status, approved_at)
values
  ('3e49e000-0000-4000-8000-000000000001', 'merge-keep', 'The staircase',
   'Bangkok', 'Thailand', 'TH', 13.7400, 100.5200, 'approved', now()),
  ('3e49e000-0000-4000-8000-000000000002', 'merge-away', 'Stairs by the canal',
   'Bangkok', 'Thailand', 'TH', 13.7405, 100.5203, 'approved', now()),
  ('3e49e000-0000-4000-8000-000000000003', 'merge-pending', 'Not yet a place',
   'Bangkok', 'Thailand', 'TH', 13.7500, 100.5300, 'pending', null)
on conflict (id) do nothing;
insert into public.photographs
  (id, slug, owner_id, title, alt_text, category, location_id, status,
   published_at, rights_confirmed_at, image_width, image_height)
values
  ('3e49e000-0000-4000-8000-000000000011', 'merge-frame-keep', '3e49e000-0000-4000-8000-00000000000a',
   'At the staircase', 'A woman in red descending a wide outdoor staircase at noon.',
   'street', '3e49e000-0000-4000-8000-000000000001', 'published', now(), now(), 1800, 1200),
  ('3e49e000-0000-4000-8000-000000000012', 'merge-frame-away', '3e49e000-0000-4000-8000-00000000000a',
   'By the canal stairs', 'The same staircase from the canal side, a man carrying a bicycle up.',
   'night', '3e49e000-0000-4000-8000-000000000002', 'published', now(), now(), 1800, 1200),
  ('3e49e000-0000-4000-8000-000000000013', 'merge-draft-away', '3e49e000-0000-4000-8000-00000000000a',
   'A draft by the canal', 'An unfinished upload of the staircase, still a draft.',
   'street', '3e49e000-0000-4000-8000-000000000002', 'draft', null, null, null, null)
on conflict (id) do nothing;
insert into public.collections (id, slug, owner_id, title, visibility) values
  ('3e49e000-0000-4000-8000-000000000021', 'merge-both', '3e49e000-0000-4000-8000-00000000000a', 'Both stairs', 'private'),
  ('3e49e000-0000-4000-8000-000000000022', 'merge-only-away', '3e49e000-0000-4000-8000-00000000000a', 'Only the canal', 'private')
on conflict (id) do nothing;
insert into public.collection_items (collection_id, location_id) values
  ('3e49e000-0000-4000-8000-000000000021', '3e49e000-0000-4000-8000-000000000001'),
  ('3e49e000-0000-4000-8000-000000000021', '3e49e000-0000-4000-8000-000000000002'),
  ('3e49e000-0000-4000-8000-000000000022', '3e49e000-0000-4000-8000-000000000002')
on conflict do nothing;
insert into public.location_restrictions (location_id, kind, note, source) values
  ('3e49e000-0000-4000-8000-000000000002', 'no-tripod', 'The steps are narrow.', 'FRAME moderator note, test fixture.');
insert into public.location_submissions
  (id, proposed_name, city, country, country_code, latitude, longitude, submitted_by, status, approved_location_id)
values
  ('3e49e000-0000-4000-8000-000000000031', 'Stairs by the canal', 'Bangkok', 'Thailand', 'TH',
   13.7405, 100.5203, '3e49e000-0000-4000-8000-00000000000a', 'approved', '3e49e000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- The fixture as inserted, before anything is merged: the diagnostic that
-- separates "the merge dropped an item" from "the item was never there".
do $$
declare n integer;
begin
  select count(*) into n from public.collection_items
   where collection_id = '3e49e000-0000-4000-8000-000000000021';
  if n <> 2 then
    raise exception 'FIXTURE GAP  the both-stairs collection holds % item(s) before the merge, not 2', n;
  end if;
end $$;

-- Who may not, and what must be said.
begin;
set local role authenticated;
set local "app.current_user_id" = '3e49e000-0000-4000-8000-00000000000a';
select public.test_rejects('a member merging two places',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000001',
                                 '3e49e000-0000-4000-8000-000000000002', 'same stairs')$$, '42501');
commit;
begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('a merge with no reason',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000001',
                                 '3e49e000-0000-4000-8000-000000000002', '  ')$$, '22023');
select public.test_rejects('a place merged into itself',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000001',
                                 '3e49e000-0000-4000-8000-000000000001', 'same')$$, '22023');
select public.test_rejects('merging a place that is not yet approved',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000001',
                                 '3e49e000-0000-4000-8000-000000000003', 'same')$$, '22023');
select public.test_rejects('merging into a place that is not approved',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000003',
                                 '3e49e000-0000-4000-8000-000000000002', 'same')$$, '22023');

-- The merge itself.
select public.test_accepts('a moderator merging the canal stairs into the staircase',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000001',
                                 '3e49e000-0000-4000-8000-000000000002',
                                 'One staircase, photographed from both sides.')$$);
commit;

-- Everything it has to leave behind — read as the superuser, because the
-- member's collections are private and row-level security would hide them
-- from the moderator who did the merge, which says nothing about the merge.
do $$
declare n integer; v_status text; v_into uuid; v_count integer; v_cats text[];
begin
  -- every photograph moved, the draft included
  select count(*) into n from public.photographs where location_id = '3e49e000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'MERGE GAP  % photograph(s) still at the merged place', n; end if;
  select count(*) into n from public.photographs where location_id = '3e49e000-0000-4000-8000-000000000001';
  if n <> 3 then raise exception 'MERGE GAP  expected 3 photographs at the survivor, found %', n; end if;
  -- the survivor recounted from its published frames, categories included
  select photograph_count, categories into v_count, v_cats from public.locations
   where id = '3e49e000-0000-4000-8000-000000000001';
  if v_count <> 2 then raise exception 'MERGE GAP  survivor photograph_count is %, not 2', v_count; end if;
  if not (v_cats @> array['street','night'] and array_length(v_cats, 1) = 2) then
    raise exception 'MERGE GAP  survivor categories are %, not {night,street}', v_cats;
  end if;
  -- the loser is a pointer, not a place
  select status, merged_into_id, photograph_count into v_status, v_into, v_count from public.locations
   where id = '3e49e000-0000-4000-8000-000000000002';
  if v_status <> 'merged' or v_into <> '3e49e000-0000-4000-8000-000000000001' or v_count <> 0 then
    raise exception 'MERGE GAP  loser is status=% into=% count=%', v_status, v_into, v_count;
  end if;
  -- collections: the one holding both now holds the survivor once; the other moved
  select count(*) into n from public.collection_items
   where collection_id = '3e49e000-0000-4000-8000-000000000021' and location_id is not null;
  if n <> 1 then raise exception 'MERGE GAP  the both-stairs collection has % place items, not 1', n; end if;
  select count(*) into n from public.collection_items
   where collection_id = '3e49e000-0000-4000-8000-000000000022'
     and location_id = '3e49e000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'MERGE GAP  the canal-only collection did not move to the survivor'; end if;
  -- the restriction and the proposal followed
  if not exists (select 1 from public.location_restrictions where location_id = '3e49e000-0000-4000-8000-000000000001') then
    raise exception 'MERGE GAP  the restriction did not move';
  end if;
  if not exists (select 1 from public.location_submissions
                  where id = '3e49e000-0000-4000-8000-000000000031'
                    and approved_location_id = '3e49e000-0000-4000-8000-000000000001') then
    raise exception 'MERGE GAP  the proposal does not point at the survivor';
  end if;
  -- the audit row names both
  if not exists (select 1 from public.moderation_actions
                  where decision = 'merge' and subject_id = '3e49e000-0000-4000-8000-000000000002'
                    and reason like '%merge-away%' and reason like '%merge-keep%' and reason like '%2 photograph%') then
    raise exception 'MERGE GAP  no audit row naming both places and the count';
  end if;
  raise notice 'merge ok      photographs, items, restriction and proposal moved; the loser points at the survivor; the trail names both';
end $$;

-- Twice is refused: the loser is no longer approved.
begin;
set local role authenticated;
set local "app.current_user_id" = '33333333-3333-4333-8333-333333333333';
select public.test_rejects('merging the same place a second time',
  $$select public.merge_location('3e49e000-0000-4000-8000-000000000001',
                                 '3e49e000-0000-4000-8000-000000000002', 'again')$$, '22023');
commit;

-- The row rule holds on its own: a live place cannot point anywhere, and a
-- merged one cannot point nowhere.
select public.test_rejects('an approved place pointing at another',
  $$update public.locations set merged_into_id = '3e49e000-0000-4000-8000-000000000002'
     where id = '3e49e000-0000-4000-8000-000000000001'$$, '23514');
select public.test_rejects('a merged place pointing at nothing',
  $$update public.locations set merged_into_id = null
     where id = '3e49e000-0000-4000-8000-000000000002'$$, '23514');

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
