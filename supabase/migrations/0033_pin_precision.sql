-- =============================================================================
-- FRAME — 0033  How precisely a place is pinned: one choice, changeable
-- =============================================================================
-- Until now every approved place was published rounded to about eleven metres,
-- a privacy-sensitive one to about a kilometre, and the two moderator flags
-- that chose between them (is_sensitive, withhold_coordinates) were set once
-- at approval and never revisited.
--
-- The site's owner has changed the policy: nobody posts in real time — a
-- photographer goes home, chooses, and uploads later — so the exact point is
-- the useful one, and only a place that is sensitive in itself (a home, a
-- shelter) needs coarsening. So:
--
--   pin_precision   exact        the point as submitted         (the default)
--                   approximate  about eleven metres            (the old default)
--                   area         about a kilometre              (was is_sensitive)
--                   none         listed, no pin                 (was withhold_coordinates)
--
-- One column, chosen at approval and changeable afterwards by staff. The two
-- old flags stay and are DERIVED from it by trigger, so every reader and
-- filter written against them keeps working unchanged; nothing may set them
-- directly any more — the precision is the one source of truth.
-- =============================================================================

set search_path = public, extensions;

alter table public.locations
  add column if not exists pin_precision text not null default 'exact'
    constraint locations_pin_precision_allowed
    check (pin_precision in ('exact', 'approximate', 'area', 'none'));

comment on column public.locations.pin_precision is
  'How precisely the place is pinned: exact, approximate (~11 m), area (~1 km) or none. is_sensitive and withhold_coordinates are derived from it.';

-- Existing places keep exactly what they had: the new default applies to new
-- approvals, not retroactively to places approved under the old promise.
update public.locations
   set pin_precision = case
     when withhold_coordinates then 'none'
     when is_sensitive then 'area'
     else 'approximate'
   end
 where pin_precision = 'exact';

create or replace function public.locations_sync_precision_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_sensitive := new.pin_precision = 'area';
  new.withhold_coordinates := new.pin_precision = 'none';
  return new;
end;
$$;

drop trigger if exists locations_sync_precision_flags on public.locations;
create trigger locations_sync_precision_flags
  before insert or update on public.locations
  for each row execute function public.locations_sync_precision_flags();

revoke all on function public.locations_sync_precision_flags() from public, anon, authenticated;
