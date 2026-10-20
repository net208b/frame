-- Stand-ins for the parts of a hosted Supabase project that a bare PostgreSQL
-- server does not have. Loaded by run.sh only; never applied to a real project.
--
-- Two of these shims limit what the suite can prove, and the limits are stated
-- here rather than buried in a report:
--
--   * auth.uid() reads a session GUC instead of a JWT, so the suite exercises
--     the functions' own identity checks but not Supabase's JWT handling.
--   * PostGIS is optional on a developer machine. When it is absent, run.sh
--     rewrites locations.geog to text and loads the two constructor stubs
--     below, so geography semantics — real distance, ST_DWithin, the GiST
--     index — are NOT exercised. Anything depending on them must be verified
--     against a project that has PostGIS enabled.

create schema if not exists extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;

-- Only the columns the migrations actually read.
--
-- raw_app_meta_data and banned_until are read and written by change_username()
-- and delete_own_account() (0010); auth.sessions exists so the latter can end a
-- retained account's sessions. Each mirrors the hosted column's type and its
-- delete rule, since those are what the assertions depend on.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  banned_until       timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.current_role', true), ''), 'anon');
$$;

create or replace function auth.email()
returns text language sql stable as $$
  select email from auth.users where id = auth.uid();
$$;
