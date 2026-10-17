# External services

FRAME depends on four things it does not run itself: a Postgres database with
authentication, object storage for photographs, image transformation, and map
tiles. This document says what each one is for, what a free tier realistically
covers, which limit you will hit first, and what the bill is made of as the
community grows.

Two cautions before the detail.

**No free tier here is unlimited, and this document will not pretend otherwise.**
Every provider's free allowance is a quantity, usually of stored bytes or
transferred bytes, and a photography site consumes exactly those. The figures
below were accurate in outline when this was written and will drift; treat them
as the *shape* of each pricing model and check the provider's own page for the
numbers. What will not drift is which lever reduces which cost, and that is the
part worth reading.

**Map tiles are the one dependency where the wrong choice is a licence problem
rather than a bill.** Read that section before you set
`NEXT_PUBLIC_MAP_STYLE_URL`.

---

## Database and authentication — Supabase

**What it does.** Holds every row: profiles, photographs, places, collections,
reports and the moderation audit trail. It also issues and refreshes sessions,
sends confirmation and password-reset email, and enforces row-level security,
which is the actual authorisation boundary — not the application code, and
certainly not a hidden button.

Supabase is reached through three clients with different privileges, in
`src/lib/supabase/`: the cookie-bound server client that runs as the signed-in
member and is therefore subject to RLS, the browser client carrying the
publishable key, and the service-role client that bypasses RLS. The third is
used in exactly one place — filing a report from a visitor with no session —
which is worth knowing because it means the service-role key is genuinely
optional, and the deployment degrades honestly without it.

**What the free tier covers.** At the time of writing: around 500 MB of
database, a generous monthly active user count for auth, and a bounded amount of
egress shared with storage. A project with no traffic for a week is paused and
has to be resumed from the dashboard, which is fine for development and is not
how you run a public site.

**Which limit bites first.** Not disk. The rows in this schema are small —
text metadata, a few timestamps, an appreciation row of two UUIDs. Two things
grow faster than you would guess:

- `rate_limit_hits`. `check_rate_limit()` inserts one row per **allowed** call,
  including pre-authentication calls for sign-in, sign-up and password reset,
  and some actions check two windows and therefore insert twice per attempt —
  appreciation checks a per-minute and a per-hour limit, and the upload signing
  endpoint checks per-hour and per-day. Each call also has a 1-in-100 chance of
  deleting everything older than a day, which bounds the table without a cron
  job but makes it the busiest insert in the schema.
- Egress, which is shared with storage on the free plan and is discussed below.

One operational limit that is not about money: PostgREST caps rows per request.
`supabase/config.toml` sets `max_rows = 2000` for the local stack because
`mapPins()` asks for every approved location in one request. A **hosted project
defaults to 1000**, so past a thousand places the map will quietly show a
partial set. Raise the limit on the project, or page that query, before you get
there.

**Cost as usage grows.** The paid step is a flat monthly platform fee with much
larger included quotas, then per-unit overage on database size, storage and
egress. The jump from free to paid is a step, not a slope; after that the slope
is gentle until egress dominates, and egress is a storage problem rather than a
database one.

**Self-hosting.** The schema is plain Postgres with `pgcrypto`, `citext`,
`postgis`, `pg_trgm` and `unaccent`. It will run on any Postgres that has them.
Auth and Storage are the Supabase-specific pieces; replacing those is real work,
not a configuration change, and `supabase/README.md` is the honest starting
point for judging it.

---

## Image storage and egress

**What it does.** Holds the original of every upload plus four derivatives, and
serves the derivatives directly to browsers. Keys are
`<owner_id>/<photograph_id>/<variant>` and the bucket is public-read, because
every derivative is a published photograph on a public page. Only derivatives
are ever linked; the original stays under the same prefix for re-processing and
is never served.

Two providers are supported, chosen with `STORAGE_PROVIDER`:

| | Supabase Storage | Cloudflare R2 |
| --- | --- | --- |
| Free allowance | A small storage quota and a shared egress quota | Around 10 GB-month of storage, plus free operation allowances |
| Egress | Metered, and the figure that matters | **No egress fee at all** |
| Signed upload lifetime | Fixed at two hours by the API | 600 seconds, chosen by FRAME |
| Per-grant size limit | Not expressible; set `file_size_limit` on the bucket | Not expressible; SigV4 can sign an exact length but not a range |
| Extra setup | None beyond the bucket and its policies | A public custom domain, and `NEXT_PUBLIC_IMAGE_HOST` |

**Which limit bites first.** Egress, by a wide margin, and it is worth doing the
arithmetic rather than guessing.

A gallery page is `PAGE_SIZE.gallery = 24` cards, each served from the `grid`
derivative: 800 px wide, WebP at quality 76, which for a street photograph is
roughly 60–120 KB. So **one gallery page view is about 1.5–3 MB of egress.** A
5 GB monthly allowance is therefore in the region of two to three thousand
gallery page views — not two to three thousand visitors, since a visitor who
pages through Discover and opens four photographs costs several times that.

Stored bytes behave in the opposite way: the four derivatives together come to
roughly 0.7–1.5 MB, while the original can be up to the 25 MB that
`UPLOAD_POLICY.maxFileBytes` allows. **The original dominates what you store;
the derivatives dominate what you serve.** A 1 GB storage allowance is in the
region of fifty to a hundred uploads, almost all of it originals.

This asymmetry is the single most important fact about running FRAME, and it has
a clear consequence: **if the site gets any real traffic, put storage behind
Cloudflare R2, or put a CDN in front of whatever storage you use.** R2's absence
of egress fees removes the cost that actually scales with readers.

**Cost as usage grows.** Storage is a few cents per gigabyte-month with either
provider and will not surprise you. Egress is where a successful week becomes an
invoice: metered per gigabyte on Supabase, zero on R2, and zero again behind a
CDN that caches the derivatives — which is safe to do aggressively, because a
derivative never changes once written and the Supabase driver writes it with a
one-year `cache-control`.

---

## Image transformation

Two different things happen to an image, with two different cost models. Keeping
them straight is what stops a per-image fee turning into a per-*view* fee.

### Once per upload, in your own process

`buildVariants()` in `src/lib/images/process.ts` uses `sharp` to produce the four
sizes in `IMAGE_VARIANTS`:

| Variant | Width | Quality | Used for |
| --- | --- | --- | --- |
| `thumb` | 320 | 72 | Moderation rows, dense lists |
| `grid` | 800 | 76 | Gallery and masonry cards |
| `display` | 1800 | 82 | Photograph detail page |
| `full` | 2560 | 84 | Large-screen detail view |

All four are WebP, and none is ever upscaled past the source. This costs CPU and
memory on your own server, once, and nothing per view. It is also where metadata
is removed: every derivative is written with no EXIF, no XMP, no IPTC and no GPS.
That is a privacy requirement rather than a byte saving — an original routinely
carries the coordinates of where the photographer stood, their name and their
camera's serial number, and uploading a file is not consent to publish any of it.

`verifyImageBytes()` runs first and takes the media type from what `sharp`
actually decodes, never from the declared content type, and rejects anything
below `UPLOAD_POLICY.minPixelWidth`/`minPixelHeight` or with multiple frames.

### On every view, by `next/image`

The browser requests `/_next/image`, which resizes the derivative to the width
the layout asked for. On Vercel that is a metered image transformation. On any
other Node host it is `sharp` again, in your process, cached on disk for
`minimumCacheTTL` — currently 30 days.

Three things already bound how many distinct transformations exist:

- The `sizes` strings in `IMAGE_SIZES` describe the real layout, so a browser
  requests one correctly-sized candidate instead of the widest one.
- `deviceSizes` and `imageSizes` in `next.config.mjs` are explicit lists, so the
  set of possible widths is finite and small.
- `minimumCacheTTL` of 30 days means a popular photograph is transformed once a
  month per width, not once per view.

If you are on a plan that meters transformations, the number to watch is
distinct `(source, width, format)` combinations, not page views. Two output
formats are configured, AVIF and WebP, which doubles that count in exchange for
meaningfully smaller files — a trade worth making, and worth knowing about.

---

## Map tiles

Read this section in full before setting `NEXT_PUBLIC_MAP_STYLE_URL`. It is the
one place where a convenient default would make your deployment somebody else's
problem.

**FRAME ships no default style URL, deliberately.** `isMapConfigured()` in
`src/lib/config.ts` returns false when the variable is unset, and `/map` and
every location map render a panel saying that no style is configured. Nothing is
requested from any tile server. That is the designed behaviour of an
unconfigured deployment, not a bug to work around.

**The public demo tile servers are for evaluation only and must not be used in
production.** The `demotiles` endpoints that appear in MapLibre's examples, and
the raster tiles from OpenStreetMap's own servers, exist so you can try a
library. They are not production infrastructure, their operators say so, and
pointing a public site at them is a terms violation and a cost imposed on a
volunteer-funded project. There is no polite traffic level at which this becomes
acceptable. FRAME will not fall back to one silently, which is why the variable
has no default.

**You have to choose a provider and read its terms.** The shape of the market,
without an endorsement:

- **Hosted vector tiles with a key.** Several providers sell a MapLibre-ready
  style JSON with a free tier measured in map loads or tile requests per month.
  Convenient, and the free tier is usually enough for a small community. Check
  whether the free tier permits commercial use, and whether the limit is enforced
  by throttling or by a bill.
- **Openly funded hosted tiles.** Some projects serve a global basemap with no
  key at all, funded by donation. Genuinely free, genuinely usable, and genuinely
  dependent on you reading their acceptable-use page and honouring it.
- **Self-hosted.** A single `.pmtiles` or MBTiles extract behind your own CDN
  gives you a predictable cost and no third-party quota. It is more work to set
  up and the data has to be refreshed; for a site covering a fixed set of cities
  it is often the cheapest serious answer.

**Attribution is a licence condition, not a design decision.** Essentially every
usable basemap derives from OpenStreetMap, whose licence requires crediting
`© OpenStreetMap contributors`, and your provider will require its own line
alongside. `NEXT_PUBLIC_MAP_ATTRIBUTION` exists for exactly this, the value is
handed to MapLibre's own attribution control, and the exact wording comes from
your provider's documentation rather than from this file. An unattributed map is
a licence breach even when it works perfectly.

**Which limit bites first.** Map loads, not tiles — most providers count a map
initialisation. FRAME's map is a client component rendered on `/map` and in a
low-interaction, single-pin form on location and photograph pages, so a visitor
who browses several places initialises several maps. If you are close to a
free-tier ceiling, that is the number to model.

**Protect the key by referrer, not by secrecy.** The style URL is public by
necessity: the browser fetches the tiles, so the key is in the bundle and in the
network tab. That is not a leak, it is how client-side maps work. Restrict the
key to your domains in the provider's dashboard; that restriction, not
concealment, is what protects your quota.

---

## What drives the bill, and the levers already in the code

Four cost drivers, each with something concrete already in place against it.

| Driver | What increases it | The lever in the code |
| --- | --- | --- |
| **Stored bytes** | Originals, overwhelmingly | `UPLOAD_POLICY.maxFileBytes` caps one file at 25 MB; `maxUploadsPerDay` (20) and `maxUploadsPerHour` (6) cap one member's daily contribution; `maxPendingUploads` (30) stops drafts accumulating |
| **Egress per gallery view** | Number of cards times the weight of each | Four fixed derivatives, so a grid never serves an original; `grid` is 800 px at quality 76; `PAGE_SIZE.gallery` is 24 with real pagination rather than an infinite scroll; `IMAGE_SIZES` makes the browser pick one candidate; derivatives are immutable and written with a one-year `cache-control` |
| **Transformations** | Distinct source, width and format combinations | Explicit `deviceSizes` and `imageSizes` lists; `minimumCacheTTL` of 30 days; `sizes` values that match the real layout; `revalidate = 300` on the photograph page so a hot URL is rendered once every five minutes rather than per request |
| **Database rows and requests** | Appreciation, reports, rate-limit hits, and unbounded reads | Keyset-friendly indexes and real pagination on every list; bounded reads in the repository (trending ranks a recent window, facets and aggregates sample rather than scan, map pins are capped); recounted counters, so a replayed request cannot inflate a number; the 1-in-100 cleanup inside `check_rate_limit` |

Two deliberate non-levers, so you are not surprised:

- **Rate limits are per account, never per IP.** An address is shared by
  everyone behind a university NAT or a mobile carrier. The in-process fallback
  counter in `src/lib/rate-limit.ts` is per instance and is explicitly not a
  security control; the Postgres function is the real limiter, and the
  application logs loudly when it has to fall back.
- **The bucket's size limit is a second line of defence.** Neither provider can
  pin a maximum size onto a signed upload. The enforcement that matters is
  `verifyImageBytes()` reading the bytes that actually arrived, before anything
  is attached or published.

---

## Swapping a provider

Both swappable dependencies are behind one seam each, on purpose.

**Storage sits behind the `StorageDriver` interface.** `StorageDriver` in
`src/lib/storage/types.ts` is three methods — `createSignedUpload`, `publicUrl`,
`remove` — and `storageDriver()` in `src/lib/storage/index.ts` picks the
implementation from `STORAGE_PROVIDER`. Nothing above that module knows which
provider holds the photographs. The interface is deliberately narrow: the moment
one driver depends on a provider-specific feature, the other stops being a
drop-in.

Moving between the two supported providers is a configuration change plus a copy
of the objects. Adding a third is one new module implementing the same three
methods, a case in the `switch` in `src/lib/storage/index.ts`, and its hostname
in `NEXT_PUBLIC_IMAGE_HOST`. Two invariants live in `types.ts` rather than in
each driver, so a new driver inherits them: `parseStorageKey()` rejects any key
that is not `owner/photograph/variant`, and `assertSignableUpload()` refuses to
sign a derivative as the wrong media type or a grant above the policy ceiling.

**The map sits behind the map-style module.** Everything the application assumes
about a tile provider is in `src/components/map/map-style.ts`: the two variable
names, the `mapStyleUrl()` and `mapAttribution()` readers, the camera defaults,
the source and layer ids, and the paint. Nothing outside that module names a
tile host, a glyph set or a paint colour, and `isMapConfigured()` is the single
question the rest of the UI asks.

So changing provider is changing two environment variables —
`NEXT_PUBLIC_MAP_STYLE_URL` and `NEXT_PUBLIC_MAP_ATTRIBUTION` — and rebuilding
so the new values reach the browser bundle. Anything beyond that, such as a
different clustering strategy or pin rendering, is a change to that one module
and the components under `src/components/map/` that consume it.

**What is not swappable by configuration.** Supabase is the database, the auth
provider and the RLS enforcement point all at once, and the repository layer
speaks PostgREST. Replacing it is a project, not a variable. What makes that
project tractable is that the UI depends on `src/lib/data/repository.ts` rather
than on any query: the demo dataset and the live implementation already satisfy
the same interface, which is the proof that a third implementation could.

---

## See also

- `docs/ENVIRONMENT.md` — the variables each service needs
- `docs/DEPLOYMENT.md` — applying the schema, the bucket and its policies
- `docs/ARCHITECTURE.md` — the storage and map seams in their wider context
- `docs/DATABASE.md` — the tables and indexes behind the bounded reads above
- `supabase/README.md` — the schema itself, and what each migration does
