#!/usr/bin/env bash
# Apply every migration to a throwaway PostgreSQL database and assert the
# guarantees in constraints.sql still hold.
#
#   supabase/tests/run.sh                      # throwaway local cluster
#   DATABASE_URL=postgres://... run.sh         # an existing empty database
#
# Nothing here touches a database that holds real data: without DATABASE_URL
# the script builds its own cluster under a temporary directory and removes it
# on exit. With DATABASE_URL it refuses to run unless the database is empty.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'cleanup' EXIT

own_cluster=0
cleanup() {
  if [ "$own_cluster" = 1 ]; then
    "$PGBIN/pg_ctl" -D "$work/pgdata" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}

# ----------------------------------------------- locate the PostgreSQL tools
# The two modes need different things, so they are checked separately. With
# DATABASE_URL the cluster already exists and only `psql` is required, which is
# all a CI runner or a container image usually ships. Without it the script
# builds its own cluster and also needs initdb, pg_ctl, pg_isready and createdb.
# Demanding the full toolchain in both cases is what stopped this running in CI.
PGBIN="${PGBIN:-}"
if [ -z "$PGBIN" ]; then
  if command -v pg_ctl >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v pg_ctl)")"
  else
    for candidate in /opt/homebrew/opt/postgresql@*/bin /usr/lib/postgresql/*/bin; do
      [ -x "$candidate/pg_ctl" ] && PGBIN="$candidate" && break
    done
  fi
fi

if [ -n "${DATABASE_URL:-}" ]; then
  if [ -n "$PGBIN" ] && [ -x "$PGBIN/psql" ]; then
    PSQL="$PGBIN/psql"
  elif command -v psql >/dev/null 2>&1; then
    PSQL="$(command -v psql)"
  else
    echo "Could not find psql. Install the PostgreSQL client, or set PGBIN to a" >&2
    echo "directory containing it." >&2
    exit 1
  fi
else
  if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/psql" ] || [ ! -x "$PGBIN/initdb" ]; then
    echo "Could not find a full PostgreSQL installation, which is what building a" >&2
    echo "throwaway cluster needs. Either set PGBIN to its bin directory, or point" >&2
    echo "DATABASE_URL at an empty database — that path needs only psql." >&2
    exit 1
  fi
  PSQL="$PGBIN/psql"
fi

# ------------------------------------------------------------ pick a database
if [ -n "${DATABASE_URL:-}" ]; then
  psql_args=("$DATABASE_URL")
  # Counts application tables only. An extension brings its own catalogue with
  # it — PostGIS alone adds spatial_ref_sys plus two views to `public` — and
  # counting those made this refuse the very PostGIS database CI provisions.
  # `relkind in ('r','p')` drops the views; the pg_depend check drops anything
  # an extension owns.
  existing="$("$PSQL" "${psql_args[@]}" -tAc "
    select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.oid not in (
         select objid from pg_depend
          where classid = 'pg_class'::regclass
            and deptype = 'e'
       )")"
  if [ "$existing" != "0" ]; then
    echo "Refusing to run: the target database already has $existing application" >&2
    echo "table(s) in public. Point DATABASE_URL at an empty database." >&2
    exit 1
  fi
  echo "target: the database in DATABASE_URL"
else
  own_cluster=1
  port="${PGPORT_TEST:-55432}"
  echo "target: a throwaway cluster on 127.0.0.1:$port"
  "$PGBIN/initdb" -D "$work/pgdata" -U frame_test --auth=trust -E UTF8 >"$work/initdb.log" 2>&1
  # A unix socket path can exceed the 103-byte limit under a temp directory,
  # so the cluster listens on loopback TCP instead.
  "$PGBIN/pg_ctl" -D "$work/pgdata" -l "$work/pg.log" \
    -o "-h 127.0.0.1 -p $port -c fsync=off -c unix_socket_directories=/tmp" \
    start >"$work/start.log" 2>&1
  for _ in $(seq 1 20); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$port" -q && break
    sleep 0.5
  done
  "$PGBIN/createdb" -h 127.0.0.1 -p "$port" -U frame_test frame_test
  psql_args=(-h 127.0.0.1 -p "$port" -U frame_test -d frame_test)
fi

# client_min_messages=warning hides the "does not exist, skipping" notices from
# the idempotent `drop ... if exists` guards; a real problem still surfaces.
run() { "$PSQL" "${psql_args[@]}" -v ON_ERROR_STOP=1 --no-psqlrc -q \
          -c "set client_min_messages = warning" "$@"; }

# ----------------------------------------------------------------- PostGIS?
has_postgis="$(run -tAc \
  "select count(*) from pg_available_extensions where name='postgis'" | tr -d '[:space:]')"

migrations="$work/migrations"
mkdir -p "$migrations"
if [ "$has_postgis" = "0" ]; then
  echo "postgis: not available — geography is shimmed to text, so distance"
  echo "         queries and the GiST index are NOT covered by this run."
  for f in "$root"/supabase/migrations/*.sql; do
    sed -e 's/geography(Point, *4326)/text/g' \
        -e 's/::geography//g' \
        -e 's/using gist (geog)/using btree (geog)/g' \
        -e 's/^create extension if not exists postgis/-- shimmed by run.sh: create extension if not exists postgis/' \
        "$f" > "$migrations/$(basename "$f")"
  done
else
  echo "postgis: available — running the migrations unmodified."
  cp "$root"/supabase/migrations/*.sql "$migrations/"
fi

# ---------------------------------------------------------------------- apply
echo
run -f "$here/local-shims.sql"
[ "$has_postgis" = "0" ] && run -f "$here/postgis-stubs.sql"

for f in "$migrations"/*.sql; do
  printf '  applied  %s\n' "$(basename "$f")"
  run -f "$f"
done
printf '  applied  seed.sql\n'
run -f "$root/supabase/seed.sql"

# ----------------------------------------------------------------------- test
echo
run -f "$here/helpers.sql"
# -tA suppresses the result table around each assertion; the sed strips the
# "psql:<file>:<line>: NOTICE:" prefix, whose path may contain spaces.
set +e
"$PSQL" "${psql_args[@]}" -tA -v ON_ERROR_STOP=1 --no-psqlrc \
  -f "$here/constraints.sql" 2>&1 \
  | sed -E 's/^psql:.*constraints\.sql:[0-9]+: //' \
  | grep -E 'ok |ERROR|FATAL|BUG|DRIFT|GAP|NOT REJECTED|WRONG|held\.' \
  | sed -E 's/^NOTICE:  //'
status=${PIPESTATUS[0]}
set -e

echo
if [ "$status" -eq 0 ]; then
  echo "PASS — every database guarantee held."
else
  echo "FAIL — a guarantee did not hold (see the error above)."
  exit 1
fi
