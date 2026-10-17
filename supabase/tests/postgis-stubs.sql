-- Loaded only when the local server has no PostGIS. See local-shims.sql for
-- what this costs: geography semantics are not exercised when these are used.
create or replace function extensions.st_makepoint(x double precision, y double precision)
returns text language sql immutable as $$ select format('POINT(%s %s)', x, y) $$;

create or replace function extensions.st_setsrid(geom text, srid integer)
returns text language sql immutable as $$ select format('SRID=%s;%s', srid, geom) $$;

create or replace function public.st_makepoint(x double precision, y double precision)
returns text language sql immutable as $$ select extensions.st_makepoint(x, y) $$;

create or replace function public.st_setsrid(geom text, srid integer)
returns text language sql immutable as $$ select extensions.st_setsrid(geom, srid) $$;
