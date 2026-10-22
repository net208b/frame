-- -----------------------------------------------------------------------------
-- 0041 — the approach is member prose, so it is translated like the biography
-- -----------------------------------------------------------------------------
-- 0040 gave a profile an `approach`: how the member goes about the work, in
-- their own words. It shipped untranslated, because 0035 names exactly which
-- (subject, field) pairs may carry a translation and adding one is a migration,
-- not an assumption. This is that migration.
--
-- Two things change, and they are the two halves of the same guarantee:
--
--   1. the pair `('profile', 'approach')` becomes allowed, so a translation may
--      be stored for it at all;
--   2. the stale-translation trigger learns to drop an approach translation
--      when the approach itself changes.
--
-- Without the second, editing the approach would leave the OLD translation in
-- place, and a Thai reader would be shown a confident translation of a sentence
-- the photographer no longer stands behind. That is worse than no translation,
-- which is why it is in the same migration rather than a later one.
--
-- Nothing else moves. Who may write a translation (the service role alone), who
-- may read one (`translation_subject_is_public`), what is sent out (published
-- text only) and the 5,000-character ceiling are all 0035's and are untouched.

-- -----------------------------------------------------------------------------
-- Which fields belong to which kind of subject
-- -----------------------------------------------------------------------------
-- Re-runnable, like every constraint in this schema: dropped by name, then
-- added. The other three subjects are restated exactly as 0035 wrote them —
-- a CHECK is replaced whole, so a pair left out here would stop being
-- translatable, and the assertions in supabase/tests/constraints.sql check all
-- four subjects for that reason.
alter table public.content_translations
  drop constraint if exists content_translations_field_belongs_to_subject,
  add constraint content_translations_field_belongs_to_subject
    check (
      (subject_type = 'photograph' and field in ('title', 'description', 'alt_text'))
      or (subject_type = 'comment' and field = 'body')
      or (subject_type = 'location' and field in ('name', 'description'))
      or (subject_type = 'profile' and field in ('biography', 'approach'))
    );

-- -----------------------------------------------------------------------------
-- Dropping a translation whose source changed
-- -----------------------------------------------------------------------------
-- Rebuilt from 0035's definition, which is still the one in force — no later
-- migration redefines it. The only change is the `approach` branch under
-- `profiles`; every other branch is 0035's, word for word, because this
-- function is replaced whole and a branch left out here would silently stop
-- clearing that field.
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
    -- NEW in 0041. Without this an edited approach keeps its old translation,
    -- and a reader is shown a translation of a sentence that is no longer there.
    if new.approach is distinct from old.approach then
      delete from public.content_translations
       where subject_type = 'profile' and subject_id = old.id and field = 'approach';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.content_translations_clear_stale() is
  'Drops a stored translation whose source text changed, and every translation of a deleted subject. Covers each translatable field named by content_translations_field_belongs_to_subject, including the profile approach added in 0041.';
