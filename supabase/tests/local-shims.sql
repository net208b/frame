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
-- and delete_own_account() (0011); auth.sessions exists so the latter can end a
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

-- ----------------------------------------------------------------- storage
-- Supabase Storage lives in its own schema, created by the storage service
-- rather than by any migration, so a bare PostgreSQL server has none of it and
-- 0008_storage.sql has nothing to insert into or attach a policy to.
--
-- These are the two tables and the one function 0008 touches, with only the
-- columns it names. Shimming rather than skipping is deliberate: the migration
-- is then applied for real by this suite, so a typo in a policy expression, a
-- missing role or a column that does not exist fails here instead of on a live
-- project. What it does not cover is the storage service itself — whether an
-- upload through the HTTP API lands under the key the app computed is a
-- question only a real project can answer, and the pull request that added
-- this file records that check against the hosted one.
--
-- The real storage.objects has more columns (version, path_tokens, metadata,
-- user_metadata, level) and its own indexes and triggers. None of them are
-- referenced by 0008, and inventing them here would assert a shape this
-- repository does not control.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text not null references storage.buckets (id),
  name             text not null,
  owner            uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  metadata         jsonb,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

-- Everything before the last segment, which is what the real one returns: for
-- `<owner_id>/<photograph_id>/grid.webp` that is {owner_id, photograph_id}, so
-- `[1]` is the owner prefix the policies compare against auth.uid().
create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end
$$;
