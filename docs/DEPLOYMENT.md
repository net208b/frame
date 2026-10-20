# Deployment

FRAME is a single Next.js application and a single Postgres database. That is
the whole production topology.

**There is no microservice, no container orchestrator and no queue in this
product, and adding one without a measured need would be a mistake.** Every
expensive piece of work is already placed where it belongs: image derivatives
are generated once per upload, uploads go from the browser straight to object
storage with a signed URL rather than through the application server, rate
limits are counted in Postgres, and the heaviest read path is a paginated
gallery of static derivatives behind a CDN. A queue would add a second place
for a job to be lost; a cluster would add a second place for configuration to
drift. If you later measure a real bottleneck, by all means move that one piece
— but measure first, and keep the rest as it is.

---

## Before you start

You need:

- A managed host that runs Node.js. Vercel is the worked example below; the
  changes for anything else are in [Another Node host](#another-node-host).
- A Supabase project, or another Postgres with the same extensions. The schema
  and the reasoning behind it live in `supabase/README.md`.
- A storage bucket, either in that Supabase project or in Cloudflare R2.
- A decision about map tiles. `docs/EXTERNAL-SERVICES.md` covers the options.
  You can ship without a map; `/map` will say so honestly.

### Node version

`package.json` declares no `engines` field, so nothing in the repository
enforces a version. The dependencies do, and the binding constraint is not the
framework:

| Package | Declared `engines.node` |
| --- | --- |
| `next` 15.5.28 | `^18.18.0 \|\| ^19.8.0 \|\| >= 20.0.0` |
| `sharp` 0.35.5 | `>= 20.9.0` |

So the real floor is **Node 20.9**, not 18.18 — `sharp` is what generates the
four derivatives on the server and what `next start` uses to optimise images.
The project was developed on **Node 20.19.0** with npm 10.8. Pin 20.x or 22.x in
your host's settings and use the same major version locally; a host that
silently picks a different one is a class of bug you do not want to debug
through a build log.

```bash
node -v   # expect v20.9.0 or newer
```

### Build and start

```bash
npm ci          # exact versions from package-lock.json
npm run build   # next build
npm run start   # next start, listens on $PORT (default 3000)
```

`npm run start` serves the output of a prior `npm run build`; it does not build.
`npm run dev` must never be used in production — it ships an unoptimised bundle
and recompiles on request.

Two things the build itself needs, both easy to miss on a locked-down runner:

- **Outbound network access to Google Fonts.** The root layout loads Inter and
  Instrument Serif through `next/font/google`, which fetches and self-hosts them
  at build time. A build with no egress fails here.
- **Platform-correct `sharp` binaries.** `sharp` is a native module with
  per-platform prebuilds. Run `npm ci` on the machine or image that will run the
  build, rather than copying a `node_modules` directory from a developer's
  laptop into a Linux container.

---

## Variables at build time and at runtime

The full reference is `docs/ENVIRONMENT.md`. What matters for a deployment is
which ones have to exist *while the build runs*:

| Needed during `next build` | Why |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Inlined into the client bundle, and read by `next.config.mjs` to allow the storage host in `images.remotePatterns`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Inlined into the client bundle. |
| `NEXT_PUBLIC_SITE_URL` | Inlined, and used for `metadataBase`, canonical links and Open Graph URLs. |
| `NEXT_PUBLIC_IMAGE_HOST` | Read by `next.config.mjs` for `images.remotePatterns`. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Inlined; the map is a client component. |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Inlined. |

| Runtime only | Why |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Read by `serverEnv()` on the server, per request. |
| `STORAGE_PROVIDER`, `STORAGE_BUCKET` | Read by `serverEnv()` when a driver is built. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Read by `serverEnv()`. |

A `NEXT_PUBLIC_*` value added after the build reaches the server and not the
browser. That half-state is the single most common deployment confusion in this
project, and the first entry in the troubleshooting section of
`docs/ENVIRONMENT.md` tells you how to recognise it.

One more build-time consideration: four dynamic routes export
`generateStaticParams` — `/photographs/[slug]`, `/locations/[slug]`,
`/photographers/[username]` and `/collections/[slug]` — and the sitemap reads
the same slug lists. With Supabase configured at build time, the build will
reach the database to enumerate them. With it unconfigured, those lists come
from the demo dataset and the build still succeeds, which is why a preview build
with no credentials is a valid thing to ship.

---

## Vercel, step by step

### 1. Import the repository

Vercel detects Next.js and sets the build command to `next build` and the
install command to `npm install`. Prefer `npm ci` as the install command so the
lockfile is honoured exactly. No output directory setting is needed.

### 2. Set the environment variables

Project Settings → Environment Variables. Add the ones you need from
`docs/ENVIRONMENT.md`, per environment:

- **Production** — your real project, your real domain.
- **Preview** — ideally a *separate* Supabase project. A preview deployment
  pointed at production data will let a reviewer delete a real photograph.
- **Development** — optional; `.env.local` covers local work.

Mark `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and the three `R2_*`
values as sensitive. They are server-only and must never acquire a
`NEXT_PUBLIC_` prefix.

Set `NEXT_PUBLIC_SITE_URL` to the production origin — `https://frame.example.com`
— for the Production environment. For Preview you can leave it unset and let
`NEXT_PUBLIC_VERCEL_URL` supply the per-branch URL, provided *Automatically
expose System Environment Variables* is enabled; check that it is, rather than
assuming.

### 3. Apply the database schema

The migrations are numbered and must run in order; later files reference earlier
tables. `supabase/README.md` is authoritative and explains what each file does.
The short version:

**First, enable PostGIS.** `0002_core_tables.sql` creates
`locations.geog geography(Point, 4326)` and fails without it. `0001` issues the
`create extension` itself, which works when migrations run as `postgres`; a
restricted migration role needs it enabled from the dashboard beforehand.

- Dashboard → Database → Extensions → search `postgis` → enable, or
- SQL editor: `create extension if not exists postgis with schema extensions;`

`0001` also enables `pgcrypto`, `citext`, `pg_trgm` and `unaccent`. Those four
are untroubled on a normal project; PostGIS is the one that needs the dashboard
toggle if your migration role is restricted.

Then push, in this order:

```bash
npm install -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                   # applies migrations/ 0001 … 0007 in order
```

Check `major_version` in `supabase/config.toml` against the hosted project's
Postgres version first. It is pinned to 17; if the project runs something older,
the shadow database used to verify the diff will disagree with the real one.

`db push` does **not** run `seed.sql`. The seed is camera and lens reference
data plus fifteen approved places — useful on a hosted project too, and safe to
run more than once. Load it from the SQL editor, or:

```bash
psql "<connection string from Project Settings -> Database>" -f supabase/seed.sql
```

While you are in the project's settings, raise the PostgREST row limit. It
defaults to 1000 on a hosted project, and `mapPins()` asks for every approved
location in one request, so past a thousand places the map would quietly show a
partial set. `supabase/config.toml` uses 2000 locally for the same reason.

Finally, promote the first moderator. No code path grants a role above `member`,
by design — `handle_new_user()` always inserts `'member'` and a guard trigger
refuses a self-promotion even for an admin. The statement is in
`supabase/README.md`; run it as `postgres` from the SQL editor.

### 4. Check the storage bucket and its policies

`supabase db push` in step 2 applied `0008_storage.sql`, which creates the
bucket and its policies; there is nothing to run by hand here. It is worth
knowing what that migration put there, because the upload path depends on all
of it. The bucket is created with:

- `public = true`, because every derivative is served straight to a browser from
  a public photograph page,
- `file_size_limit = 52428800` (50 MiB), matching `UPLOAD_POLICY.maxFileBytes`,
  **which has to be changed by hand when that constant changes.** It lives on the
  bucket, not in a migration, so raising the application's limit without raising
  this one gives a member a form that accepts a 40 MB photograph and a storage
  provider that refuses it,
- `allowed_mime_types` matching `UPLOAD_POLICY.acceptedMimeTypes`.

The same migration creates four policies on `storage.objects`: public read,
and insert, update and delete restricted to `(storage.foldername(name))[1] =
auth.uid()::text`. Storage keys are `<owner_id>/<photograph_id>/<variant>`, and
`/api/uploads/sign` derives the owner segment from the session rather than from
the request, so that prefix rule and the endpoint agree on who may write where.

Supabase Storage cannot pin a size or a type onto an individual signed upload,
and fixes the grant's lifetime at two hours. So the bucket's own limits are a
second line of defence only. The real check reads the file's magic bytes with
`sharp` in `verifyImageBytes`, because a declared content type is whatever the
client decided to claim.

For R2 instead: create the bucket in the Cloudflare dashboard, issue an API
token with object read and write scoped to it, put a public custom domain in
front of it, and set `NEXT_PUBLIC_IMAGE_HOST` to that domain. None of the
Supabase storage setup applies.

### 5. Configure the auth redirect and site URLs so confirmation links work

This is the step whose failure is most visible to members: a confirmation email
whose link points at `localhost:3000`, or at a preview URL that no longer
exists.

The application builds exactly two redirect targets, both from `siteUrl()`,
which is `NEXT_PUBLIC_SITE_URL`:

| Target | Built by | For |
| --- | --- | --- |
| `<site>/auth/confirm` | `signUp` and `resendVerification` | Email confirmation, verified server-side from a `token_hash` |
| `<site>/auth/callback?next=/reset-password` | `requestPasswordReset` | Password reset, exchanging a `code` for a session |

Both routes exist (`src/app/auth/confirm/route.ts` and
`src/app/auth/callback/route.ts`), and `/auth/confirm` hands a request carrying
a `code` rather than a `token_hash` over to `/auth/callback`, so Supabase's
default email templates and a customised `token_hash` template both work.

Supabase dashboard → Authentication → URL Configuration:

- **Site URL**: `https://frame.example.com` — the same value as
  `NEXT_PUBLIC_SITE_URL` in Production. This is the origin Supabase substitutes
  into its default email templates, so getting it wrong is what produces a
  localhost link in a real member's inbox.
- **Redirect URLs** (allow-list), at minimum:
  - `https://frame.example.com/auth/confirm`
  - `https://frame.example.com/auth/callback`
  - `https://frame.example.com/auth/callback?next=*` — add this if your project
    rejects the query string on the bare path; the password-reset target always
    carries one.
  - a pattern for previews, if you use them, such as
    `https://*-your-team.vercel.app/auth/**`

A redirect target that is not on the allow-list is rejected by Supabase and the
member lands on an error, not on your site. `supabase/config.toml` shows the
local equivalents under `[auth]`.

While you are there, set **minimum password length to 10** to match
`@/lib/validation/auth` and `supabase/config.toml`. If the two disagree, a form
will accept a password that the auth service then refuses, and the member is
told two different things.

Signing in with Google, Apple, Facebook or X needs no extra entry here: every
provider returns to the bare `/auth/callback`, which the list above already
covers. Each provider does need its own setup in that company's developer
console, and migration 0009 applied before any of them is switched on —
[`SOCIAL-SIGN-IN.md`](SOCIAL-SIGN-IN.md) has both.

### 6. Add the image host to the remote patterns

`next.config.mjs` builds `images.remotePatterns` at build time from
`images.unsplash.com`, the hostname of `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_IMAGE_HOST`. A host outside that list returns 400 from
`/_next/image`.

- Supabase Storage with no CDN in front: nothing to do.
- A custom domain or CDN in front of storage, or R2: set
  `NEXT_PUBLIC_IMAGE_HOST` to that hostname — no scheme, no path — and rebuild.

`next.config.mjs` is a do-not-modify file in this project. If a deployment
genuinely needs a host that the three sources cannot express, that is a change
to agree on rather than a local edit.

### 7. Point the domain and deploy

Add the domain in Vercel, let the TLS certificate issue, then deploy. Confirm
`NEXT_PUBLIC_SITE_URL` matches the final domain, including `www` or its absence
— a canonical URL that disagrees with the served one is a slow, quiet problem.

---

## Another Node host

Anything that runs Node and gives you a persistent process works: Fly, Render,
Railway, a VPS behind nginx, App Runner. What changes:

| Concern | On Vercel | Elsewhere |
| --- | --- | --- |
| Start command | Managed | `npm run start`, with `PORT` set by the platform. Keep the process under a supervisor. |
| Build | Managed | Run `npm ci && npm run build` in the image or on the host. Needs egress to Google Fonts. |
| Image optimisation | Vercel's image service | `next start` optimises images in-process using `sharp`. Give the process enough memory and a persistent disk or cache volume, or put a CDN in front; `minimumCacheTTL` is already 30 days. |
| Middleware | Runs at the edge | Runs in the Node server. `middleware.ts` only refreshes the Supabase session, so this is not a behaviour change. |
| `NEXT_PUBLIC_VERCEL_URL` | Supplied | Absent. Set `NEXT_PUBLIC_SITE_URL` explicitly — otherwise `siteUrl()` falls back to `http://localhost:3000`. |
| CDN and caching | Included | Put one in front. Static assets under `/_next/static` are immutable and content-hashed; `/_next/image` responses are cacheable. |
| Security headers | Set by `next.config.mjs` either way | Same. If a reverse proxy also sets `X-Frame-Options` or `Referrer-Policy`, make sure it does not duplicate or contradict them. |
| Secrets | Project settings | Use the platform's secret store. Do not bake them into an image layer. |

If you containerise, use Next.js's `standalone` output rather than copying
`node_modules`. That is a `next.config.mjs` change, which is a do-not-modify
file here — raise it rather than patching it locally.

Nothing about the application assumes Vercel. `siteUrl()` is the only
platform-aware code, and its Vercel branch is a fallback.

---

## Post-deploy smoke test

Run through this on the real domain, in order. Each line is something a user
would notice. A route that 404s because it has not been built yet is a different
answer from a route that is broken — check `find src/app -name 'page.tsx'`
before blaming the deployment.

- [ ] The home page renders and there is **no** demo band under the header. If
      the band is there, the database is not configured — see the first entry in
      the troubleshooting section of `docs/ENVIRONMENT.md`.
- [ ] `view-source` shows `<link rel="canonical">` pointing at your domain, not
      at localhost or a preview URL.
- [ ] `/robots.txt` and `/sitemap.xml` both resolve, and every URL in the
      sitemap is on your domain. Nothing under `/upload`, `/moderation`,
      `/search`, `/auth/` or the account pages appears in the sitemap.
- [ ] `/discover` returns either real photographs or an honest empty state, and
      paging to page 2 changes the URL and the contents.
- [ ] A photograph page loads at `/photographs/<slug>` and its image is served
      from `/_next/image`, with a 200 rather than a 400.
- [ ] `/locations` and a location page render; the coordinate shown is the
      rounded, publishable one, not an exact position.
- [ ] `/map` shows a map if you configured a style URL, or the panel explaining
      that none is configured. Either is a pass; a blank grey area is not. If a
      map draws, confirm the attribution line is visible.
- [ ] Sign up with a real address. The confirmation email arrives, and its link
      points at **your** domain and completes the sign-in.
- [ ] Request a password reset and confirm that link works too. It uses a
      different redirect target, so it fails separately.
- [ ] Upload one photograph of a few megabytes. Four derivatives appear in the
      bucket alongside the original, and the page shows the derivative rather
      than the original.
- [ ] Appreciate a photograph, reload, and appreciate again to remove it. The
      count is correct after each step and does not drift.
- [ ] Submit a report. It appears in the moderation queue. If you left
      `SUPABASE_SERVICE_ROLE_KEY` unset, also check that a signed-out report is
      *refused with a message* rather than silently dropped.
- [ ] Visit `/moderation` while signed in as an ordinary member: it must return
      404, not a dashboard with the buttons hidden.
- [ ] Visit `/upload` while signed out: it must send you to
      `/login?next=/upload`.
- [ ] Check the server logs for a thrown `StorageConfigurationError`, a
      repository error naming a query, or the line
      `public.check_rate_limit is unavailable`. All three are designed to be
      loud, and the last one means the migrations did not fully apply.

If any write silently appears to succeed while nothing changed in the database,
stop and investigate. Every action in this app returns a structured result and
is supposed to say what went wrong.

---

## Rollback

Application and database roll back differently, and conflating them is how an
incident gets longer.

**The application** is one artefact. On Vercel, promote the previous deployment
from the Deployments list; it is already built, so the rollback is immediate.
Elsewhere, redeploy the previous commit or image tag. If the fault came from a
changed environment variable, remember that `NEXT_PUBLIC_*` values are baked
into the bundle: reverting the variable alone does nothing, and you have to
rebuild or promote a build that was made with the old value.

**The database is forward-only.** `supabase db push` has no inverse, and this
project does not pretend otherwise. If a migration caused the problem, the fix
is a new numbered migration that corrects it, written and reviewed like any
other. Resist editing a migration that has already run: it will not re-apply,
and the file will no longer describe the database.

That asymmetry means the safe order of operations is: ship schema changes that
the current application tolerates, then ship the application. A column that is
added and left unread is harmless; a column that is dropped while the previous
build is still rollback-able is not.

**Storage is not rolled back by either.** Objects written by a bad deployment
stay written. `StorageDriver.remove()` refuses any key that is not in the layout
this app writes, so clean-up is deliberate rather than accidental.

---

## See also

- `docs/ENVIRONMENT.md` — every variable, and what breaks without it
- `docs/EXTERNAL-SERVICES.md` — free-tier limits, cost drivers, swapping provider
- `docs/ARCHITECTURE.md` — the seams, and why each one is where it is
- `docs/DATABASE.md` — the tables, constraints and policies the migrations build
- `supabase/README.md` — the schema, the bucket statement, the first moderator
- `README.md` — running it locally
