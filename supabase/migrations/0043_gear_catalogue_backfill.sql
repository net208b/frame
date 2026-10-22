-- -----------------------------------------------------------------------------
-- 0043 — connect the gear a member typed to the catalogue that was waiting for it
-- -----------------------------------------------------------------------------
-- 0002 created camera_brands, camera_models, lens_brands and lens_models; 0003
-- gave photograph_metadata a foreign key to each; 0005 indexed three of the
-- four; and seed.sql filled the tables. Nothing has ever written those four id
-- columns. Every one of them is null on every row.
--
-- The cost is visible in the Discover gear filter, which therefore counts the
-- raw text: "SONY" and "Sony" are two brands, "ILCE-7RM6" and "Sony A7R V" are
-- two cameras, and a member looking for work shot on their own camera has to
-- guess which spelling somebody else used. Guardrail §7.3 says metadata must be
-- accurate and useful, and a fragmented facet list is neither.
--
-- WHAT THIS DOES NOT DO. It does not touch the `*_text` columns, and it never
-- will: 0003 keeps them on purpose — "Exactly what the member typed, kept even
-- when it matched a lookup row" — so a photographer shooting something the
-- catalogue has never heard of is not asked to pretend otherwise. The id is an
-- addition, not a correction, and where no catalogue row matches the id simply
-- stays null and the typed text stands alone.

-- -----------------------------------------------------------------------------
-- The index 0005 left out
-- -----------------------------------------------------------------------------
-- 0005 indexed camera_brand_id, camera_model_id and lens_brand_id and stopped
-- there, because nothing filtered by lens model. The facet added alongside this
-- migration does, so the fourth index is no longer optional. Partial, like its
-- three siblings: the column is null for every row that matched nothing.
create index if not exists photograph_metadata_lens_model_idx
  on public.photograph_metadata (lens_model_id)
  where lens_model_id is not null;

-- -----------------------------------------------------------------------------
-- The backfill
-- -----------------------------------------------------------------------------
-- Idempotent and re-runnable: each statement only fills a null id, so running
-- this file twice changes nothing the second time, and a row whose text was
-- edited later is picked up by the next run rather than being left wrong.
--
-- Matched on `lower(btrim(...))` because the whole point is that the spelling
-- varies. `btrim` as well as `lower`: a trailing space is the single most
-- common way a pasted model name fails to match.
--
-- A model is matched within its brand where the brand resolved, and by name
-- alone where it did not — two manufacturers can ship a model with the same
-- bare name, which is why camera_models.slug is brand-prefixed, so the
-- brand-scoped match is the one that is certainly right and the other is a
-- best effort that only applies when there is nothing better.

update public.photograph_metadata m
   set camera_brand_id = b.id
  from public.camera_brands b
 where m.camera_brand_id is null
   and m.camera_brand_text is not null
   and lower(btrim(m.camera_brand_text)) = lower(btrim(b.name));

update public.photograph_metadata m
   set camera_model_id = mo.id
  from public.camera_models mo
 where m.camera_model_id is null
   and m.camera_model_text is not null
   and lower(btrim(m.camera_model_text)) = lower(btrim(mo.name))
   and (m.camera_brand_id is null or mo.brand_id = m.camera_brand_id);

update public.photograph_metadata m
   set lens_brand_id = b.id
  from public.lens_brands b
 where m.lens_brand_id is null
   and m.lens_brand_text is not null
   and lower(btrim(m.lens_brand_text)) = lower(btrim(b.name));

update public.photograph_metadata m
   set lens_model_id = mo.id
  from public.lens_models mo
 where m.lens_model_id is null
   and m.lens_model_text is not null
   and lower(btrim(m.lens_model_text)) = lower(btrim(mo.name))
   and (m.lens_brand_id is null or mo.brand_id = m.lens_brand_id);

-- -----------------------------------------------------------------------------
-- Keeping it true from here on
-- -----------------------------------------------------------------------------
-- The backfill is a one-off; this is what stops the columns going null again.
-- A trigger rather than application code, for the reason every rule in this
-- schema is a trigger: the upload form is not the only thing that can write a
-- metadata row, and a rule that lives only in the form is a rule that holds
-- only while that form is the one writing.
--
-- It resolves on insert, and on any update that changed one of the typed
-- values. It never clears an id that is already set unless the text it came
-- from changed — editing the aperture must not cost the camera its catalogue
-- row.
create or replace function public.photograph_metadata_resolve_gear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- On an update, a typed value that changed invalidates the id derived from
  -- it. Cleared first, then resolved again below from the new text.
  if tg_op = 'UPDATE' then
    if new.camera_brand_text is distinct from old.camera_brand_text then
      new.camera_brand_id := null;
    end if;
    if new.camera_model_text is distinct from old.camera_model_text then
      new.camera_model_id := null;
    end if;
    if new.lens_brand_text is distinct from old.lens_brand_text then
      new.lens_brand_id := null;
    end if;
    if new.lens_model_text is distinct from old.lens_model_text then
      new.lens_model_id := null;
    end if;
  end if;

  if new.camera_brand_id is null and new.camera_brand_text is not null then
    select b.id into new.camera_brand_id
      from public.camera_brands b
     where lower(btrim(b.name)) = lower(btrim(new.camera_brand_text))
     limit 1;
  end if;

  if new.camera_model_id is null and new.camera_model_text is not null then
    select mo.id into new.camera_model_id
      from public.camera_models mo
     where lower(btrim(mo.name)) = lower(btrim(new.camera_model_text))
       and (new.camera_brand_id is null or mo.brand_id = new.camera_brand_id)
     limit 1;
  end if;

  if new.lens_brand_id is null and new.lens_brand_text is not null then
    select b.id into new.lens_brand_id
      from public.lens_brands b
     where lower(btrim(b.name)) = lower(btrim(new.lens_brand_text))
     limit 1;
  end if;

  if new.lens_model_id is null and new.lens_model_text is not null then
    select mo.id into new.lens_model_id
      from public.lens_models mo
     where lower(btrim(mo.name)) = lower(btrim(new.lens_model_text))
       and (new.lens_brand_id is null or mo.brand_id = new.lens_brand_id)
     limit 1;
  end if;

  return new;
end;
$$;

comment on function public.photograph_metadata_resolve_gear() is
  'Fills the four gear id columns from the typed names, case- and space-insensitively, and clears an id whose text changed. The typed text is never altered: it is what the member wrote (0003).';

drop trigger if exists photograph_metadata_resolve_gear on public.photograph_metadata;
create trigger photograph_metadata_resolve_gear
  before insert or update of
    camera_brand_text, camera_model_text, lens_brand_text, lens_model_text
  on public.photograph_metadata
  for each row execute function public.photograph_metadata_resolve_gear();
