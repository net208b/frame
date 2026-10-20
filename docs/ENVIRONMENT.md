# Environment variables

Every variable FRAME reads, where it is read, and what the application does
without it. The list is derived from the code rather than from habit. Two files
read `process.env`: `src/lib/config.ts`, for the whole application, and
`next.config.mjs`, for the image host allow-list. Nothing else under `src/`
touches the environment directly, apart from one `NODE_ENV` check that Next.js
sets for you. You can verify that for yourself:

```bash
grep -rn "process\.env" src middleware.ts next.config.mjs
```

Copy `.env.example` to `.env.local` and fill in what you need. `.env.local` is
git-ignored; `.env.example` is committed and holds placeholders only.

**You can set nothing at all.** With no `.env.local` FRAME runs in demo mode on
a bundled dataset, says so on every page, and refuses every write with an
explanation. That is a supported state, not a broken one.

**But a copied `.env.example` is not an empty environment.** Its two
`NEXT_PUBLIC_SUPABASE_*` lines are uncommented placeholders, so an unedited copy
satisfies `isDatabaseConfigured()` and leaves demo mode — and then every read
fails against a host that does not resolve. The check is presence, not
reachability. Replace both values or comment both lines out.

---

## Build time or runtime

This distinction causes more confusion than any individual variable.

| | Read where | When you must set it |
| --- | --- | --- |
| `NEXT_PUBLIC_*` | Server **and** browser | **At build time.** Next.js inlines these into the JavaScript bundle during `next build`. A value supplied only at runtime will be seen by the server and *not* by the browser, so client components will behave as though the capability is missing. |
| Everything else | Server only | At runtime. Changing one needs a restart, not a rebuild. |

`next.config.mjs` also reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_IMAGE_HOST` while the config is evaluated, to build
`images.remotePatterns`. Those two therefore have to be present in the build
environment even on a host where you would normally only think about runtime.

---

## Reference

Public means the name begins with `NEXT_PUBLIC_` and the value is visible to
anyone who opens the browser's developer tools. Treat it as published.

### Database and authentication

| Variable | Required | Scope | What it does | Example shape | Missing |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | For anything beyond demo mode | Public | The Supabase project's API URL. Also the source of the Supabase hostname in `images.remotePatterns`. | `https://abcdefghijklm.supabase.co`, or `http://127.0.0.1:54321` locally | Demo mode. Reads come from the bundled dataset, writes refuse, sign-in is unavailable, and stored images cannot be optimised. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | For anything beyond demo mode | Public | The browser-safe key. Row-level security is what constrains it, so publishing it is expected. | `sb_publishable_…` | Demo mode, exactly as above. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional alias | Public | The older name for the same key, accepted so a project of any vintage works unchanged. `PUBLISHABLE` wins when both are set. | `eyJhbGciOiJ…` (a JWT) | Nothing, provided the publishable name is set. |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | **Server only** | The service-role key, which **bypasses row-level security entirely**. Used where the server must write something a member may not: filing a report from a visitor with no session (`submitReport`), confirming storage deletions (`src/lib/storage/supabase.ts`), and on upload recording the automated content check and publishing a photograph that check cleared (`src/server/actions/upload.ts`). | `sb_secret_…` | `createAdminClient()` throws an error naming this variable. Uploads still work, but no content check can be recorded, so **every upload waits for a moderator** instead of publishing at once. A signed-out visitor cannot file a report. |
| `SUPABASE_SECRET_KEY` | Optional alias | **Server only** | The newer name for the service-role key. `SUPABASE_SERVICE_ROLE_KEY` wins when both are set. | `sb_secret_…` | Nothing, provided the other name is set. |

Two things worth knowing about that service-role key, because both are easy to
get wrong in opposite directions:

- It is **not** needed to create a profile for a new account. That is the
  `handle_new_user()` trigger in
  `supabase/migrations/0006_functions_and_triggers.sql`, which runs inside the
  database when a row lands in `auth.users`.
- It is **not** needed by the moderation dashboard either. Moderator writes run
  as the moderator through the cookie-bound client, and `is_moderator()` in the
  row-level security policies is what authorises them.

Never prefix either secret-key name with `NEXT_PUBLIC_`. See the troubleshooting
section if you think one has leaked.

### Site identity

| Variable | Required | Scope | What it does | Example shape | Missing |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Optional locally, effectively required in production | Public | The public origin used for canonical links, Open Graph URLs, JSON-LD, `metadataBase`, `robots.txt`, the sitemap, and the redirect targets in confirmation and password-reset email. A trailing slash is stripped. | `https://frame.example.com` | Falls back to `NEXT_PUBLIC_VERCEL_URL`, then to `http://localhost:3000`. A production deployment without it tells crawlers its canonical home is localhost, and emails members a link to their own machine. |
| `NEXT_PUBLIC_VERCEL_URL` | Never set by hand | Public | A fallback origin for preview deployments. Vercel can expose it automatically when *Automatically expose System Environment Variables* is enabled; confirm it is actually present rather than assuming. | `frame-git-branch-team.vercel.app` (no scheme — the code adds `https://`) | Falls through to localhost. |

### Image storage

| Variable | Required | Scope | What it does | Example shape | Missing |
| --- | --- | --- | --- | --- | --- |
| `STORAGE_PROVIDER` | Optional | Server only | Chooses the storage driver: `supabase` or `r2`. | `supabase` | Defaults to `supabase`. Any other value throws an error naming this variable when the driver is first used; it does not silently fall back. |
| `STORAGE_BUCKET` | Optional | Server only | The bucket name, for either provider. It is also the variable the upload capability notice names, so it is worth setting explicitly even when the default is right. | `photographs` | Defaults to `photographs`. |
| `NEXT_PUBLIC_IMAGE_HOST` | Required when `STORAGE_PROVIDER=r2` | Public | Adds a hostname to `images.remotePatterns` at build time, and with R2 is also the public base for every stored object. Hostname only, no scheme, no path. | `images.example.com` | With `supabase`: nothing, because the Supabase host is derived from `NEXT_PUBLIC_SUPABASE_URL`. With `r2`: the driver refuses to start and names this variable. |
| `R2_ACCOUNT_ID` | When `STORAGE_PROVIDER=r2` | **Server only** | The Cloudflare account the bucket belongs to. Forms the signing host `<id>.r2.cloudflarestorage.com`. | 32 hex characters | The driver throws, naming this variable. |
| `R2_ACCESS_KEY_ID` | When `STORAGE_PROVIDER=r2` | **Server only** | R2 API token id, for the SigV4 signature. | 32 hex characters | The driver throws, naming this variable. |
| `R2_SECRET_ACCESS_KEY` | When `STORAGE_PROVIDER=r2` | **Server only** | R2 API token secret. | 64 hex characters | The driver throws, naming this variable. |

R2 therefore needs four values in total: the three `R2_*` secrets and the public
`NEXT_PUBLIC_IMAGE_HOST`.

### Automated content check

| Variable | Required | Scope | What it does | Example shape | Missing |
| --- | --- | --- | --- | --- | --- |
| `GOOGLE_VISION_API_KEY` | Recommended | **Server only** | Google Cloud Vision API key. When an upload is processed, its display size (re-encoded, every tag stripped — never the original file) is sent to SafeSearch; a clear answer lets the photograph publish at once. Restrict the key to the Cloud Vision API in the Google Cloud console. | `AIza…` | The check reports "unavailable", and every upload waits in the moderation queue for a person. Nothing is published unchecked. |
| `CONTENT_CHECK_DAILY_LIMIT` | Optional | Server only | The most classifier calls made per UTC day. Google offers no daily quota for Cloud Vision, so this is the ceiling on the bill. | `2000` | Defaults to 2,000. Past it, uploads wait for a moderator instead of being checked. |

### Maps

| Variable | Required | Scope | What it does | Example shape | Missing |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional | Public | A MapLibre style JSON URL from a tile provider, including whatever key that provider issues. | `https://tiles.example.com/styles/basic/style.json?key=…` | `isMapConfigured()` is false. `/map` and every location map render a panel explaining that no style is configured, and no request is made to any tile server. Nothing else degrades. |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Optional in code, required by your provider's licence | Public | The attribution line handed to MapLibre's own attribution control. | `© Your Tile Provider © OpenStreetMap contributors` | No attribution is shown. Nothing breaks technically, and you are probably in breach of the tile licence. Read `docs/EXTERNAL-SERVICES.md`. |

### Set by the toolchain

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | Set by Next.js (`development` for `next dev`, `production` for `next build` and `next start`). The only place the application reads it is a development-only consistency check over the demo dataset in `src/lib/data/demo/photographs.ts`. Do not set it yourself. |

---

## Minimum sets, capability by capability

Each capability is derived from the environment by `capabilities()` in
`src/lib/config.ts`, so the UI can state what it cannot do instead of offering a
button that does nothing.

### Demo mode — nothing set

```bash
# .env.local is not even required.
npm run dev
```

What you get: the whole interface over 20 photographs, 15 places, 6
photographers and 5 collections held in memory. Filters, pagination, empty
states and the moderation queues are all exercised. A notice under the header
states that the content is a bundled sample, and `PlatformStats.isDemoData` is
`true` so no number is presented as describing a real community.

What refuses: every write. Sign-in, upload, appreciation, reports, collections
and moderation decisions all return the same sentence rather than pretending —
*"This action needs a database and none is configured, so nothing was saved."*

### Database and authentication

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Two variables turn on reads from Postgres, sessions, and every write path that
can run as the signed-in member. The schema has to be applied first — see
`supabase/README.md`.

Add the service-role key if you want signed-out visitors to be able to file
reports:

```bash
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
```

Two settings on the Supabase side have to agree with the code, or a member will
be told one thing by the form and another by the auth service:

- **Password length.** `@/lib/validation/auth` requires 10 characters;
  `supabase/config.toml` sets `minimum_password_length = 10` for the local
  stack. Set the same figure on a hosted project.
- **Redirect URLs.** Email confirmation and password reset links are built from
  `siteUrl()` and checked against the project's allow-list. The code uses
  exactly two targets — `/auth/confirm` and `/auth/callback` —
  and `docs/DEPLOYMENT.md` covers how to allow-list them on a hosted project.
  `supabase/config.toml` lists the local equivalents under `[auth]`.

### Image uploads

Uploads need a database **and** a bucket. With the default provider:

```bash
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
STORAGE_PROVIDER=supabase      # the default; may be omitted
STORAGE_BUCKET=photographs     # the default; may be omitted
```

The bucket must exist and must allow a member to write inside their own prefix.
`supabase/README.md` has the `insert into storage.buckets …` statement and the
four storage policies, including the prefix rule that stops one member
overwriting another's upload.

With Cloudflare R2 instead:

```bash
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
STORAGE_PROVIDER=r2
STORAGE_BUCKET=photographs
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
NEXT_PUBLIC_IMAGE_HOST=images.example.com
```

A caveat, because the UI cannot tell you this one: `capabilities().uploads` in
`src/lib/config.ts` is `database && Boolean(process.env.STORAGE_PROVIDER ??
'supabase')`, and the right-hand side is always true. With
`STORAGE_PROVIDER=r2` and the R2 credentials absent, the interface will report
uploads as available and the failure will arrive when a member presses Upload,
as a `StorageConfigurationError` naming the missing variable. The signing
endpoint turns that into a 503 with the message, so nothing is lost and nobody
is told an upload succeeded — but check the four R2 values yourself, because the
capability notice will not check them for you.

### Maps

```bash
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.example.com/styles/basic/style.json?key=…
NEXT_PUBLIC_MAP_ATTRIBUTION=© Your Tile Provider © OpenStreetMap contributors
```

Independent of the database: a map works in demo mode, and a configured
database does not imply a map. Read `docs/EXTERNAL-SERVICES.md` before picking a
provider — this is the one capability where the wrong choice is a licence
problem rather than a bill.

---

## Troubleshooting

### The site still says "demo content" after I set my keys

`isDatabaseConfigured()` needs **both** `NEXT_PUBLIC_SUPABASE_URL` and a
publishable key. One without the other is demo mode, with no separate warning.

Work through this in order:

1. Is the key under one of the two names the code reads —
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`?
   A third spelling is simply not read.
2. Is it in `.env.local` rather than `.env.example`? Editing the example file
   changes nothing.
3. Did you restart `next dev`? The dev server reads the environment at startup.
4. On a deployed build: were both variables present **during the build**? A
   `NEXT_PUBLIC_*` value added afterwards reaches the server and not the
   browser, which produces the confusing half-state below.

To tell a server-side problem from a build-time one: the demo band under the
header is server-rendered, so if the band is **gone** but a client component
still behaves as though nothing is configured, the server has the variables and
the browser bundle does not. Confirm by looking for the project reference in
what is actually served:

```bash
curl -s http://localhost:3000 | grep -c 'your-project-ref'
```

Zero on a page that should be live means the value never made it into the
bundle. Rebuild with both variables set in the build environment.

### The demo band is gone but every page errors

The opposite mistake, and almost always a copied `.env.example` that was never
edited. Both Supabase variables are *present*, so the app left demo mode; the
URL points at `your-project-ref.supabase.co`, which does not resolve, so each
repository call throws an error naming the operation it was attempting.

Check what the app actually has:

```bash
grep -E '^NEXT_PUBLIC_SUPABASE' .env.local
```

A `your-project-ref` host or an `sb_publishable_000…` key is the placeholder.
Replace both with your project's real values, or comment both lines out to go
back to the bundled dataset. There is no halfway state: the capability check is
presence, not reachability, and deliberately so — a deployment should not decide
it has no database because of one failed request.

### I think the service-role key is in a public variable

Treat it as compromised, in this order:

1. Rotate it immediately in the Supabase dashboard (Project Settings → API).
   Anyone who loaded a page while it was exposed has full read and write access
   to every table, because it bypasses row-level security by design.
2. Remove the `NEXT_PUBLIC_` name from every environment — local, preview and
   production — and rebuild. The old value is baked into any build made while
   the name was wrong, so the build artefacts have to go too.
3. Re-read `src/lib/supabase/admin.ts`. It throws if it is ever evaluated in a
   browser bundle, which turns the mistake into an obvious failure rather than a
   silent leak — but the import graph is the real defence, so check that nothing
   with `'use client'` imports it, directly or through a shared module.

To check for the mistake before it ships:

```bash
# Should return nothing. Scoped to the code and the env files on purpose —
# run against the whole tree it matches this document.
grep -rn "NEXT_PUBLIC_SUPABASE_SERVICE\|NEXT_PUBLIC_SUPABASE_SECRET\|NEXT_PUBLIC_R2_" \
  src middleware.ts next.config.mjs .env.example .env.local 2>/dev/null

# Should name only src/lib/supabase/admin.ts, src/lib/storage/supabase.ts,
# src/server/actions/reports.ts and src/server/actions/upload.ts.
grep -rl "createAdminClient" src/
```

### Uploads fail with "bucket not found" or a 404 from storage

The bucket named by `STORAGE_BUCKET` (default `photographs`) does not exist in
the project you are pointing at, or exists under a different name. The local
stack creates it from `supabase/config.toml`; a hosted project does not — you
create it once with the statement in `supabase/README.md`, along with the four
policies that let a member write inside `<their-id>/…` and nowhere else.

Three related failures that look the same from the outside:

- **The write is refused, not missing.** A signed URL was issued and the PUT
  came back 403. The bucket exists but its row-level security policies do not
  allow this member — check the prefix policy. Storage keys are
  `<owner_id>/<photograph_id>/<variant>`, and the owner segment is derived
  server-side from the session, never from the request.
- **The bucket's own ceiling is lower than the app's.** Set
  `file_size_limit` to `26214400` bytes and `allowed_mime_types` to the four
  types in `UPLOAD_POLICY`, so the bucket and `src/lib/config.ts` agree.
- **R2 is selected but unconfigured.** `POST /api/uploads/sign` answers 503 with
  `code: "not_configured"` and the message names the first missing variable. See
  the caveat under *Image uploads* above.

### Images do not render, or the image endpoint returns 400

`next/image` only optimises hosts listed in `images.remotePatterns`, and
`next.config.mjs` builds that list at build time from three sources:
`images.unsplash.com` (always, for the demo dataset), the hostname of
`NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_IMAGE_HOST`. A host outside that
list gives a 400 from `/_next/image`, not a broken `<img>`.

So: if you have put a CDN or a custom domain in front of storage, set
`NEXT_PUBLIC_IMAGE_HOST` to that hostname — without a scheme or a path — and
rebuild. Changing it at runtime has no effect, because the config is evaluated
during the build.

`next.config.mjs` is on the do-not-modify list for this project. If you need a
fourth host permanently, that is a change to discuss rather than a local edit.

### The map shows a panel saying no style URL is configured

That is the intended behaviour with `NEXT_PUBLIC_MAP_STYLE_URL` unset. FRAME
ships no default style on purpose: the demo tile endpoints in MapLibre's
examples are for evaluation only, and defaulting to one would put every
deployment in breach of someone's terms on day one.

Pick a provider, read its terms, paste its style URL, and set
`NEXT_PUBLIC_MAP_ATTRIBUTION` to the wording that provider requires. Then
rebuild — it is a `NEXT_PUBLIC_` variable, and the map is a client component.

If the panel persists with the variable set, the value almost certainly reached
the server only. See the first troubleshooting entry.

A different message — *"The map could not be loaded"* — means the opposite: the
variable arrived and the style did not. A wrong URL, a revoked or
referrer-blocked key, or a provider outage. The browser's network tab will show
the failing request to the style JSON.

---

## See also

- `.env.example` — the same list, as a file you can copy
- `docs/DEPLOYMENT.md` — which of these are needed at build time on a real host
- `docs/EXTERNAL-SERVICES.md` — choosing providers, and what they cost
- `docs/DATABASE.md` — the schema the two Supabase variables connect you to
- `supabase/README.md` — applying the schema, the bucket, and the first moderator
