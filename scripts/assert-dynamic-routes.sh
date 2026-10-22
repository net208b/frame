#!/usr/bin/env bash
# Every route below reads the request's cookies, so none of them may be
# prerendered. The comment at the top of each page says why.
#
# This list is hard-coded and nothing scans for new routes, so a dynamic route
# added without a line here is simply unguarded. Add it in the same pull
# request that creates it.
#
# `next build` prints one line per route, prefixed with its render mode:
#   ƒ  server-rendered on demand   — the correct mode for every route below
#   ●  prerendered, from generateStaticParams
#   ○  prerendered as static content
#
# A route that goes back to ● serves an address that was not in its static
# params by rendering it once and caching the result, and a cached render may
# not read cookies: Next.js raises DYNAMIC_SERVER_USAGE and the request becomes
# a 500. Nothing reads cookies in demo mode, which is the configuration CI
# builds in — so this reads the build's own summary rather than requesting a
# page, because requesting one would prove nothing without a database.
#
# Usage: npm run build | tee build.log && scripts/assert-dynamic-routes.sh build.log
set -euo pipefail

log="${1:?usage: assert-dynamic-routes.sh <build log>}"

routes=(
  '/[locale]/photographs/[slug]'
  '/[locale]/photographers/[username]'
  '/[locale]/locations/[slug]'
  '/[locale]/collections/[slug]'
  '/[locale]/books/[slug]'
  '/[locale]/series/[slug]'
  '/[locale]/discover/style/[style]'
)

status=0
for route in "${routes[@]}"; do
  # A trailing space is part of the match, so /[locale]/collections does not
  # match the line belonging to /[locale]/collections/[slug].
  line="$(grep -F -- " $route " "$log" | head -1 || true)"

  if [ -z "$line" ]; then
    echo "::error::$route is missing from the build output — either the route was removed, or next build changed its summary format and this check needs updating." >&2
    status=1
    continue
  fi

  if printf '%s' "$line" | grep -q 'ƒ'; then
    printf '  ok        %s is server-rendered on demand\n' "$route"
  else
    echo "::error::$route is prerendered. It reads cookies through the request-scoped Supabase client, so prerendering returns 500 (DYNAMIC_SERVER_USAGE) for any address published since the last deployment. Remove generateStaticParams and keep export const dynamic = 'force-dynamic'." >&2
    printf '  build output said: %s\n' "${line# }" >&2
    status=1
  fi
done

exit "$status"
