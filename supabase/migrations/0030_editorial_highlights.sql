-- =============================================================================
-- FRAME — 0030  Editorial highlights: editor's picks, and features
-- =============================================================================
-- Two kinds of editorial voice.
--
-- 1. EDITOR'S PICK. `photographs.editors_pick` has existed since 0003 and is
--    shown in three places — the home page's curated band, Discover's
--    "Editors' picks" order, and the badge on a photograph's page — and the
--    database already lets only a moderator change it. Nothing in the
--    application ever set it. set_editors_pick() is that lever: staff only,
--    published photographs only, it stamps when the pick was made (so "latest
--    picks" means the latest picked, not the latest published) and tells the
--    photographer.
--
-- 2. FEATURES. A short piece by the editors: a title and an introduction in
--    both languages, and a sequence of published photographs, each with an
--    optional caption. Drafts are staff-only; a feature is public once
--    published, and its photographers are told the first time it is — taking
--    one down and putting it back does not tell them twice. A photograph
--    later taken down simply drops out of the piece.
--
-- Every new table is revoked first and granted back deliberately, and the new
-- photographs column joins 0029's explicit column grant.
-- =============================================================================

set search_path = public, extensions;

/* ------------------------------------------------------------------------ */
/* 1. Editor's pick                                                           */
/* ------------------------------------------------------------------------ */

alter table public.photographs
  add column if not exists editors_picked_at timestamptz;

comment on column public.photographs.editors_picked_at is
  'When an editor picked it, set by set_editors_pick(). Orders the picks; null when not picked.';

-- 0029 lists photographs columns explicitly; a new one is unreadable until
-- granted, which is the point of the list.
grant select (editors_picked_at) on table public.photographs to anon, authenticated;

-- The owner may not move the pick date: it orders the picks, and an owner
-- could otherwise float their own picked frame to the top of the band.
create or replace function public.photographs_guard_pick_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.editors_picked_at is distinct from old.editors_picked_at and not public.is_moderator() then
    raise exception 'Only a FRAME editor may set when a photograph was picked.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists photographs_guard_pick_time on public.photographs;
create trigger photographs_guard_pick_time
  before update of editors_picked_at on public.photographs
  for each row execute function public.photographs_guard_pick_time();

-- Notifications learn the two new things that can happen to a member's work.
alter table public.notifications
  drop constraint if exists notifications_kind_allowed,
  add constraint notifications_kind_allowed
    check (kind in ('comment', 'reply', 'appreciation', 'follow', 'photograph_published',
                    'challenge_award', 'editors_pick', 'featured'));
alter table public.notifications
  drop constraint if exists notifications_subject_type_allowed,
  add constraint notifications_subject_type_allowed
    check (subject_type in ('photograph', 'profile', 'comment', 'challenge', 'feature'));

create or replace function public.set_editors_pick(p_photograph_id uuid, p_pick boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.photographs;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only a FRAME editor picks photographs.' using errcode = '42501';
  end if;

  select * into v_photo from public.photographs p where p.id = p_photograph_id for update;
  if not found then
    raise exception 'No such photograph.' using errcode = 'P0002';
  end if;
  if p_pick and v_photo.status <> 'published' then
    raise exception 'Only a published photograph can be an editor''s pick.' using errcode = '42501';
  end if;
  if v_photo.editors_pick = p_pick then
    return;  -- already so; nothing changes and nobody is told twice
  end if;

  update public.photographs
     set editors_pick = p_pick,
         editors_picked_at = case when p_pick then now() else null end
   where id = p_photograph_id;

  if p_pick then
    perform public.record_notification(
      v_photo.owner_id, 'editors_pick', null, 'photograph', v_photo.id, v_photo.title, v_photo.slug);
  end if;
end;
$$;

/* ------------------------------------------------------------------------ */
/* 2. Features                                                                */
/* ------------------------------------------------------------------------ */

create table if not exists public.features (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique
                       constraint features_slug_shape
                       check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title_en           text not null constraint features_title_en_length check (char_length(btrim(title_en)) between 3 and 100),
  title_th           text not null constraint features_title_th_length check (char_length(btrim(title_th)) between 3 and 100),
  intro_en           text not null constraint features_intro_en_length check (char_length(btrim(intro_en)) between 20 and 3000),
  intro_th           text not null constraint features_intro_th_length check (char_length(btrim(intro_th)) between 20 and 3000),
  status             text not null default 'draft'
                       constraint features_status_allowed check (status in ('draft', 'published')),
  published_at       timestamptz,
  -- Set once, the first time it goes up: the photographers are told then and
  -- only then.
  first_published_at timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint features_published_has_date check (status = 'draft' or published_at is not null)
);

create table if not exists public.feature_items (
  feature_id    uuid not null references public.features (id) on delete cascade,
  photograph_id uuid not null references public.photographs (id) on delete cascade,
  position      smallint not null constraint feature_items_position_range check (position between 1 and 24),
  caption_en    text constraint feature_items_caption_en_length check (caption_en is null or char_length(caption_en) <= 400),
  caption_th    text constraint feature_items_caption_th_length check (caption_th is null or char_length(caption_th) <= 400),
  primary key (feature_id, photograph_id),
  -- Deferrable, so a whole sequence can be renumbered in one transaction.
  constraint feature_items_position_unique unique (feature_id, position) deferrable initially deferred
);

create index if not exists features_published_idx
  on public.features (published_at desc) where status = 'published';

drop trigger if exists features_set_updated_at on public.features;
create trigger features_set_updated_at
  before update on public.features
  for each row execute function public.set_updated_at();

-- Publication goes through publish_feature() and nothing else, so the
-- three-photograph minimum and the one-time notice cannot be skipped by
-- writing the columns directly.
create or replace function public.features_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_via_function boolean := coalesce(current_setting('frame.publishing_feature', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if (new.status <> 'draft' or new.published_at is not null or new.first_published_at is not null)
       and not v_via_function then
      raise exception 'A feature starts as a draft; publish it with publish_feature().' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.status is distinct from old.status
      or new.published_at is distinct from old.published_at
      or new.first_published_at is distinct from old.first_published_at)
     and not v_via_function then
    raise exception 'Features are published and taken down with publish_feature().' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists features_guard on public.features;
create trigger features_guard
  before insert or update on public.features
  for each row execute function public.features_guard();

-- Only a published photograph goes into a feature. Read under SECURITY
-- DEFINER because staff are composing with photographs they do not own.
create or replace function public.feature_items_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.photographs p
                  where p.id = new.photograph_id and p.status = 'published') then
    raise exception 'Only a published photograph can be featured.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists feature_items_rules on public.feature_items;
create trigger feature_items_rules
  before insert or update of photograph_id on public.feature_items
  for each row execute function public.feature_items_rules();

-- A feature's photographs are replaced as a whole, in one transaction: the
-- order of the list is the order of the piece, and a half-finished
-- replacement must never leave a published piece empty. A published feature
-- may not drop below the three photographs it needed to go up.
create or replace function public.set_feature_items(p_feature_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_count  integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only FRAME''s editors compose features.' using errcode = '42501';
  end if;

  select f.status into v_status from public.features f where f.id = p_feature_id for update;
  if not found then
    raise exception 'No such feature.' using errcode = 'P0002';
  end if;

  delete from public.feature_items i where i.feature_id = p_feature_id;

  insert into public.feature_items (feature_id, photograph_id, position, caption_en, caption_th)
  select p_feature_id,
         (item ->> 'photograph_id')::uuid,
         ordinal::smallint,
         nullif(btrim(item ->> 'caption_en'), ''),
         nullif(btrim(item ->> 'caption_th'), '')
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as list(item, ordinal);
  get diagnostics v_count = row_count;

  if v_status = 'published' and v_count < 3 then
    raise exception 'A published feature keeps at least three photographs; take it down first to cut it further.'
      using errcode = '23514';
  end if;

  return v_count;
end;
$$;

-- Publishing is a function so it can require enough photographs to be a
-- piece, and tell the photographers exactly once.
create or replace function public.publish_feature(p_feature_id uuid, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feature public.features;
  v_item    record;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only FRAME''s editors publish features.' using errcode = '42501';
  end if;

  select * into v_feature from public.features f where f.id = p_feature_id for update;
  if not found then
    raise exception 'No such feature.' using errcode = 'P0002';
  end if;

  perform set_config('frame.publishing_feature', 'on', true);

  if not p_publish then
    update public.features set status = 'draft', published_at = null where id = p_feature_id;
    perform set_config('frame.publishing_feature', '', true);
    return;
  end if;

  if (select pg_catalog.count(*) from public.feature_items i
        join public.photographs p on p.id = i.photograph_id and p.status = 'published'
       where i.feature_id = p_feature_id) < 3 then
    raise exception 'A feature needs at least three published photographs.' using errcode = '23514';
  end if;

  update public.features
     set status = 'published',
         published_at = now(),
         first_published_at = coalesce(first_published_at, now())
   where id = p_feature_id;
  perform set_config('frame.publishing_feature', '', true);

  if v_feature.first_published_at is null then
    -- One notice per photographer, however many of their frames are in it.
    for v_item in
      select distinct on (p.owner_id) p.owner_id, p.title
        from public.feature_items i
        join public.photographs p on p.id = i.photograph_id and p.status = 'published'
       where i.feature_id = p_feature_id
       order by p.owner_id, i.position
    loop
      perform public.record_notification(
        v_item.owner_id, 'featured', null, 'feature', p_feature_id, v_feature.title_en, v_feature.slug);
    end loop;
  end if;
end;
$$;

/* ------------------------------------------------------------------------ */
/* Privileges — revoked first, then granted back deliberately                 */
/* ------------------------------------------------------------------------ */

alter table public.features      enable row level security;
alter table public.feature_items enable row level security;

revoke all on table public.features, public.feature_items from anon, authenticated;
grant select on table public.features, public.feature_items to anon, authenticated;
grant insert, update, delete on table public.features, public.feature_items to authenticated;

revoke all on function public.photographs_guard_pick_time() from public, anon, authenticated;
revoke all on function public.feature_items_rules() from public, anon, authenticated;
revoke all on function public.features_guard() from public, anon, authenticated;
revoke all on function public.set_editors_pick(uuid, boolean) from public, anon;
revoke all on function public.publish_feature(uuid, boolean) from public, anon;
revoke all on function public.set_feature_items(uuid, jsonb) from public, anon;
grant execute on function public.set_feature_items(uuid, jsonb) to authenticated;
grant execute on function public.set_editors_pick(uuid, boolean) to authenticated;
grant execute on function public.publish_feature(uuid, boolean) to authenticated;

-- Published features are public; drafts are the editors'.
drop policy if exists features_select_visible on public.features;
create policy features_select_visible on public.features
  for select to anon, authenticated
  using (status = 'published' or public.is_moderator());

drop policy if exists features_write_staff on public.features;
create policy features_write_staff on public.features
  for all to authenticated
  using (public.is_moderator())
  with check (public.is_moderator() and (status = 'draft' or published_at is not null));

-- Items follow their feature, and a photograph taken down drops out.
drop policy if exists feature_items_select_visible on public.feature_items;
create policy feature_items_select_visible on public.feature_items
  for select to anon, authenticated
  using (
    public.is_moderator()
    or (
      exists (select 1 from public.features f where f.id = feature_id and f.status = 'published')
      and exists (select 1 from public.photographs p where p.id = photograph_id and p.status = 'published')
    )
  );

drop policy if exists feature_items_write_staff on public.feature_items;
create policy feature_items_write_staff on public.feature_items
  for all to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());
