-- =============================================================================
-- FRAME — 0035  The same words in the other language
-- =============================================================================
-- FRAME reads in two languages, but only its own interface was ever in two:
-- every word a member writes — a photograph's title and description, a comment,
-- a place's name and description, a biography — stayed in whichever language it
-- was typed in. A Thai reader met English titles, an English reader met Thai
-- ones, and neither could tell whether the sentence they could not read was
-- worth reading.
--
-- This table holds the other language's version of those words. One row per
-- (subject, field, language), written by the service role after the content
-- becomes public, read by anyone who can see the content itself.
--
-- WHAT IS AND IS NOT STORED HERE
--
--   * Only the OTHER language. `language <> source_language` is a constraint:
--     a row is a translation, never a copy of the original. The original stays
--     where it has always been, on its own table, and remains what is shown
--     when no translation exists.
--
--   * Only text that is already public. Nothing is translated before a
--     moderator has approved it, which is also the promise the privacy notice
--     makes: a draft is never sent to a translation provider.
--
--   * `source_hash` is the SHA-256 of the exact source text this row was made
--     from. It is what lets the writer skip text it has already translated,
--     and what lets a reader prove the translation still belongs to the words
--     above it.
--
-- STALE TRANSLATIONS CANNOT LINGER. When a member edits their title, the old
-- translation is deleted by trigger the moment the source changes. For the
-- stretch between that edit and the next translation run there is simply no
-- translation, and the reader sees the original — which is correct, where
-- showing yesterday's sentence under today's would not be.
--
-- NOBODY WRITES THIS TABLE FROM A SESSION. There is no insert, update or
-- delete policy: only the service role writes translations, from the server,
-- after it has called the provider. A member cannot put words in another
-- member's mouth in a language that member does not read.
-- =============================================================================

set search_path = public, extensions;

create table if not exists public.content_translations (
  subject_type    text not null,
  subject_id      uuid not null,
  field           text not null,
  language        text not null,
  value           text not null,
  source_language text not null,
  source_hash     text not null,
  provider        text not null default 'google',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (subject_type, subject_id, field, language),

  constraint content_translations_language_allowed
    check (language in ('en', 'th')),
  constraint content_translations_source_language_allowed
    check (source_language in ('en', 'th')),
  -- A translation, not a copy.
  constraint content_translations_not_the_source
    check (language <> source_language),
  constraint content_translations_value_present
    check (char_length(btrim(value)) > 0 and char_length(value) <= 5000),
  -- SHA-256, lower-case hex.
  constraint content_translations_source_hash_shape
    check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint content_translations_provider_allowed
    check (provider in ('google')),
  -- Which fields belong to which kind of subject. Without this the table would
  -- accept a photograph with a biography, and the reader would never find out.
  constraint content_translations_field_belongs_to_subject
    check (
      (subject_type = 'photograph' and field in ('title', 'description', 'alt_text'))
      or (subject_type = 'comment' and field = 'body')
      or (subject_type = 'location' and field in ('name', 'description'))
      or (subject_type = 'profile' and field = 'biography')
    )
);

comment on table public.content_translations is
  'The other language''s version of member-written text. Written only by the service role, only for content that is already public.';
comment on column public.content_translations.source_hash is
  'SHA-256 of the source text this row was translated from, so staleness is provable and unchanged text is not re-translated.';

-- Reading a subject's translations is the one access pattern: given a
-- photograph and a language, hand me every translated field.
create index if not exists content_translations_subject_idx
  on public.content_translations (subject_type, subject_id, language);


-- ---------------------------------------------------------------------------
-- Who may read a translation: exactly whoever may read what it translates
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the policy must look at the subject's own row, and
-- the reader may well not be able to. It answers one boolean and leaks nothing
-- else: a caller already knows the id it asked about.
create or replace function public.translation_subject_is_public(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'photograph' then exists (
      select 1 from public.photographs p
       where p.id = p_id and p.status = 'published')
    when 'comment' then exists (
      select 1 from public.photograph_comments c
       join public.photographs p on p.id = c.photograph_id
       where c.id = p_id
         and c.deleted_at is null
         and c.hidden_at is null
         and p.status = 'published')
    when 'location' then exists (
      select 1 from public.locations l
       where l.id = p_id and l.status = 'approved')
    when 'profile' then exists (
      select 1 from public.profiles pr
       where pr.id = p_id and not pr.is_suspended)
    else false
  end;
$$;

alter table public.content_translations enable row level security;

drop policy if exists content_translations_public_read on public.content_translations;
create policy content_translations_public_read
  on public.content_translations
  for select
  to anon, authenticated
  using (public.translation_subject_is_public(subject_type, subject_id));

-- No insert, update or delete policy exists, and none is coming: the service
-- role bypasses RLS and is the only writer.


-- ---------------------------------------------------------------------------
-- A translation does not outlive the words it translates
-- ---------------------------------------------------------------------------
create or replace function public.content_translations_clear_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
begin
  v_subject := case tg_table_name
    when 'photographs'         then 'photograph'
    when 'photograph_comments' then 'comment'
    when 'locations'           then 'location'
    when 'profiles'            then 'profile'
  end;

  if tg_op = 'DELETE' then
    delete from public.content_translations
     where subject_type = v_subject and subject_id = old.id;
    return old;
  end if;

  -- An edit: drop only the fields whose words actually changed, so editing a
  -- description does not throw away a perfectly good title translation.
  if tg_table_name = 'photographs' then
    if new.title is distinct from old.title then
      delete from public.content_translations
       where subject_type = 'photograph' and subject_id = old.id and field = 'title';
    end if;
    if new.description is distinct from old.description then
      delete from public.content_translations
       where subject_type = 'photograph' and subject_id = old.id and field = 'description';
    end if;
    if new.alt_text is distinct from old.alt_text then
      delete from public.content_translations
       where subject_type = 'photograph' and subject_id = old.id and field = 'alt_text';
    end if;

  elsif tg_table_name = 'photograph_comments' then
    if new.body is distinct from old.body then
      delete from public.content_translations
       where subject_type = 'comment' and subject_id = old.id and field = 'body';
    end if;

  elsif tg_table_name = 'locations' then
    if new.name is distinct from old.name then
      delete from public.content_translations
       where subject_type = 'location' and subject_id = old.id and field = 'name';
    end if;
    if new.description is distinct from old.description then
      delete from public.content_translations
       where subject_type = 'location' and subject_id = old.id and field = 'description';
    end if;

  elsif tg_table_name = 'profiles' then
    if new.biography is distinct from old.biography then
      delete from public.content_translations
       where subject_type = 'profile' and subject_id = old.id and field = 'biography';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists photographs_clear_stale_translations on public.photographs;
create trigger photographs_clear_stale_translations
  after update or delete on public.photographs
  for each row execute function public.content_translations_clear_stale();

drop trigger if exists photograph_comments_clear_stale_translations on public.photograph_comments;
create trigger photograph_comments_clear_stale_translations
  after update or delete on public.photograph_comments
  for each row execute function public.content_translations_clear_stale();

drop trigger if exists locations_clear_stale_translations on public.locations;
create trigger locations_clear_stale_translations
  after update or delete on public.locations
  for each row execute function public.content_translations_clear_stale();

drop trigger if exists profiles_clear_stale_translations on public.profiles;
create trigger profiles_clear_stale_translations
  after update or delete on public.profiles
  for each row execute function public.content_translations_clear_stale();


-- ---------------------------------------------------------------------------
-- Privileges. The schema's default is ALL to anon and authenticated, and
-- TRUNCATE is not governed by row-level security, so the grants are taken away
-- before any are given back — see 0025.
-- ---------------------------------------------------------------------------
revoke all on table public.content_translations from public, anon, authenticated, service_role;
grant select on table public.content_translations to anon, authenticated;
grant select, insert, update, delete on table public.content_translations to service_role;

-- The read policy calls this, and a policy's expression runs as the querying
-- role — so anon and authenticated must be able to execute it or every select
-- on the table fails with a permission error rather than an empty result. The
-- same reasoning, and the same grant, as is_moderator() in 0005. It answers one
-- boolean about an id the caller already holds, and discloses nothing further.
revoke all on function public.translation_subject_is_public(text, uuid) from public;
grant execute on function public.translation_subject_is_public(text, uuid) to anon, authenticated;

-- Nothing calls this but the triggers, which run as the definer.
revoke all on function public.content_translations_clear_stale() from public, anon, authenticated;
