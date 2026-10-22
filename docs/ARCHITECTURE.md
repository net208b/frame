# Architecture

How FRAME is put together, and why each seam is where it is. Written from the
code on disk: every claim below names the file that makes it true, so a
reviewer can disagree with the file rather than with this document.

Read [`README.md`](../README.md) first for what the product is and how to run
it. Read this for how it is built, and
[`docs/LIMITATIONS.md`](LIMITATIONS.md) for where it falls short.

---

## Contents

- [The one rule that shapes everything](#the-one-rule-that-shapes-everything)
- [Rendering model](#rendering-model)
- [The repository seam](#the-repository-seam)
- [The capability model](#the-capability-model)
- [Where authorisation lives](#where-authorisation-lives)
- [The server-action convention](#the-server-action-convention)
- [Storage abstraction](#storage-abstraction)
- [Map abstraction](#map-abstraction)
- [Directory layout, and where a new file goes](#directory-layout-and-where-a-new-file-goes)
- [Walkthrough: a gallery read](#walkthrough-a-gallery-read)
- [Walkthrough: an appreciation write](#walkthrough-an-appreciation-write)

---

## The one rule that shapes everything

Nothing in the interface may claim that something happened when it did not.

That rule is the reason for most of the structure in this document. It is why
reads go through a seam that can be answered by bundled data or by a database
([`src/lib/data/repository.ts`](../src/lib/data/repository.ts)), why every
capability is derived from the environment rather than assumed
([`src/lib/config.ts`](../src/lib/config.ts)), why every write returns a result
value instead of throwing ([`src/lib/action-result.ts`](../src/lib/action-result.ts)),
and why the two notice components exist at all
([`src/components/system/DemoNotice.tsx`](../src/components/system/DemoNotice.tsx)).

A capability that is absent is a normal state for this project, not an error.
The architecture's job is to make that state *visible* rather than to paper
over it.

---

## Rendering model

**Server Components read data. Client Components handle interaction.** There is
no data-fetching library, no client-side store and no API layer between the UI
and the database — a page calls the repository directly and awaits it.

Three reasons this is the right default here, in order of weight:

1. **The data is not the viewer's.** A gallery is a page of published
   photographs. Fetching it in the browser would mean shipping query logic,
   shipping the filter semantics, and trusting the client with the
   published-only predicate. On the server, that predicate sits in one place
   and cannot be edited by a reader.
2. **The photographs are the payload.** A street-photography site's bytes are
   images, not JavaScript. Keeping the gallery server-rendered means the only
   JavaScript on `/discover` is the toolbar and the appreciate control.
3. **Secrets stay put.** `serverEnv()` in `src/lib/config.ts` throws if it is
   ever evaluated in a browser bundle, and so do
   [`createAdminClient()`](../src/lib/supabase/admin.ts) and
   [`storageDriver()`](../src/lib/storage/index.ts). Those guards are a backstop;
   the real defence is that nothing in the client tree imports them.

### Client components are leaves

A `'use client'` directive appears only where state, an effect or an event
handler is unavoidable: the appreciate control
([`src/components/photo/AppreciateButton.tsx`](../src/components/photo/AppreciateButton.tsx)),
the toast region ([`src/components/system/Toast.tsx`](../src/components/system/Toast.tsx)),
the header's menu and mobile sheet, the discover toolbar's controls, the
dialogs, and the map canvas. Each is a leaf: it receives serialisable props
from a Server Component and nothing more. `SiteHeader` is an async Server
Component that resolves the viewer and hands its client children a plain
object plus a `canModerate` boolean, so no function and no client instance
crosses the boundary.

### What is static, what is dynamic

| Surface | Behaviour | Why |
| --- | --- | --- |
| `/photographs/[slug]`, `/locations/[slug]`, `/photographers/[username]`, `/collections/[slug]` | `generateStaticParams()` enumerates slugs through the repository | Shareable, crawlable pages with a known identifier set |
| `/photographs/[slug]` | `export const revalidate = 300` | Appreciation totals move on their own; the write path revalidates the path, so this is only a backstop |
| Any page that reads the live repository | Dynamic in practice | Public reads use the cookie-bound client so the viewer's own appreciation state can be resolved, and reading cookies opts a route into dynamic rendering |
| `generateStaticParams()` and anything outside a request | Session-less client | `cookies()` is unavailable there, so `publicClient()` in `src/lib/data/supabase-repository.ts` is used — still carrying the publishable key, still subject to row-level security |

The consequence is stated plainly in [`docs/LIMITATIONS.md`](LIMITATIONS.md):
with a database configured, almost every page is rendered per request. That is
a deliberate trade — a correct per-viewer control beats a cacheable page with a
wrong one — and it is the first thing to revisit if the site ever needs to be
cheap at scale.

### Per-request deduplication

React's `cache()` is used where two parts of one request would otherwise ask
the same question twice:

- [`src/lib/auth.ts`](../src/lib/auth.ts) wraps the session plus profile read,
  so a layout, a header and a repository call share one round trip.
- [`src/app/[locale]/photographs/[slug]/page.tsx`](../src/app/[locale]/photographs/[slug]/page.tsx)
  wraps the photograph read, so `generateMetadata` and the page body do not
  both fetch it.

### Streaming

Where a page has a cheap frame and an expensive body, the body sits behind
`<Suspense>` with a skeleton, keyed on the view so a filter change replaces the
results rather than leaving stale ones on screen — see `DiscoverPage`. The two
reads on that page start before either is awaited so they overlap.

---

## The repository seam

**One module is the read API the UI may use:**
[`src/lib/data/repository.ts`](../src/lib/data/repository.ts). No component
imports either implementation directly.

```
Pages and components
        │
        ▼
src/lib/data/repository.ts          ← the only read API the UI may call
        │
        ├── useLive() === false ──►  src/lib/data/demo-repository.ts
        │                             └── src/lib/data/demo/*.ts  (bundled dataset)
        │
        └── useLive() === true  ──►  src/lib/data/supabase-repository.ts
                                      └── PostgREST, as the signed-in viewer
```

### Selection is configuration, not a flag

```ts
function useLive(): boolean {
  return isDatabaseConfigured();
}
```

`isDatabaseConfigured()` asks one question: are `NEXT_PUBLIC_SUPABASE_URL` and
a publishable key both present? There is no `DEMO_MODE` variable to forget to
unset, no build-time constant and no developer override. A deployment with
credentials reads real data; a deployment without them reads the bundled
dataset and says so on every page.

This matters for more than tidiness. It means demo mode is a genuinely
reviewable state: filters, pagination, empty states, the moderation queues and
the duplicate-pair scan all work against the in-memory dataset, so the whole
interface can be reviewed before any external service exists.

### What holds the two implementations to the same shape

[`src/types/domain.ts`](../src/types/domain.ts) — hand-written, not generated.
Both implementations return those types and nothing else, and the UI depends on
them alone. The database's own generated row types live separately in
[`src/lib/supabase/types.ts`](../src/lib/supabase/types.ts) and are used only
inside the live repository, as `Pick<Tables<'photographs'>, …>` annotations
that keep the hand-written `select` strings honest against the schema.

Two interfaces that the UI needs but that are not domain concepts —
`MapPin` and `ModerationQueues` — are declared in `repository.ts` itself,
because they describe a query result rather than an entity.

### Rules the live implementation holds to

Stated in its own header comment, and worth checking when reviewing it:

- Public reads filter on `status = 'published'` and `status = 'approved'` in
  every query, not in a wrapper somebody can forget.
- Reads run through the cookie-bound client, so row-level security is the gate.
- A query error throws with the operation named. An empty gallery caused by a
  failed query must not look like an empty gallery caused by an empty table.
- Coordinates leave only through `publishableCoordinates()`.
- Images are built from stored derivatives; the original is never served.

### Bounded reads

Several figures are computed over a bounded sample rather than the whole table,
because PostgREST cannot express the aggregate: the trending pool is 300 rows,
gear facets and the profile aggregates sample 5,000, the duplicate scan reads
3,000 locations, map pins cap at 2,000. Each bound is a constant at the top of
`supabase-repository.ts` with a comment, and each is listed in
[`docs/LIMITATIONS.md`](LIMITATIONS.md). They are bounds, not estimates
presented as totals: where an exact count is unavailable, `Paginated.totalCount`
is `null` and the UI says what it actually knows.

---

## The capability model

[`src/lib/config.ts`](../src/lib/config.ts) is the only place that reads
`process.env` for a capability, and it exposes the answer as four booleans:

```ts
capabilities() // { database, auth, uploads, maps, demoMode }
```

| Capability | Derived from | When absent |
| --- | --- | --- |
| `database` | `NEXT_PUBLIC_SUPABASE_URL` + publishable key | The demo dataset answers reads; every write refuses with `NOT_CONFIGURED_MESSAGE` |
| `auth` | the same two variables | `getViewer()` returns `null`; the viewer is permanently signed out |
| `uploads` | `database` and `STORAGE_PROVIDER` | Refused, with the missing variable named |
| `maps` | nothing — FRAME serves its own basemap; `NEXT_PUBLIC_MAP_STYLE_URL=off` is the opt-out | Map surfaces render `MapUnavailable`; no tile request is made |

### Why the UI is required to admit a missing capability

Because the alternative is a lie with a spinner on it. A disabled button with
no explanation tells a reader that they did something wrong; a button that
appears to work and silently saves nothing is worse still. So two components
carry that admission:

- `DemoNotice` renders a single calm line under the header whenever
  `isDemoMode()`, naming the bundled dataset and saying that every count on the
  page describes the sample rather than a community.
- `CapabilityNotice` names the capability, the action, the exact environment
  variables and [`docs/ENVIRONMENT.md`](ENVIRONMENT.md). It returns `null` when
  the capability is configured, so it costs nothing in a working deployment.

`PlatformStats` carries the same honesty in the data itself: `isDemoData`
travels with the numbers, so a component cannot render demo figures as real
ones even by accident. The live implementation sets it to `false` and the demo
implementation to `true`.

### One sharp edge, on purpose documented

`capabilities().uploads` is `database && Boolean(process.env.STORAGE_PROVIDER ?? 'supabase')`,
which is true whenever a database is configured. It therefore cannot tell
whether the *selected* provider has its credentials: with
`STORAGE_PROVIDER=r2` and no R2 keys, that boolean says uploads work and
`storageDriver()` throws. The write path compensates —
`resolveDriver()` in [`src/server/actions/upload.ts`](../src/server/actions/upload.ts)
catches `StorageConfigurationError` and returns a refusal naming the missing
variable — but a `CapabilityNotice` for uploads is not trustworthy under `r2`.
`config.ts` is a fixed contract file, so this is recorded in
[`docs/LIMITATIONS.md`](LIMITATIONS.md) rather than patched.

---

## Where authorisation lives

**Three layers, and the bottom one is the real one.**

```
1. The UI hides a control the viewer cannot use.        ← a courtesy
2. The page or action checks the session on the server. ← a readable refusal
3. Row-level security decides per statement.            ← the actual control
```

A hidden button is one `fetch()` away from being pressed. The product's
promises about who may see and change what are only true if they are true at
layer 3, which is why
[`supabase/migrations/0007_row_level_security.sql`](../supabase/migrations/0007_row_level_security.sql)
enables RLS on all seventeen tables and writes 48 explicit policies —
including, for `rate_limit_hits`, deliberately none at all, which denies
everything. [`docs/DATABASE.md`](DATABASE.md) has the rule for every table in
one line.

Layer 2 exists so a refusal can be a sentence instead of an empty result:

| Helper | Answers with | Used by |
| --- | --- | --- |
| `getViewer()` | `Viewer \| null` | Anything that renders differently for a member |
| `getViewerSuspension()` | suspension state | Every write path: a suspended member is signed out for writes but must still be able to read the reason |
| `requireViewer(nextPath)` | redirect to `/login?next=…` | Members-only pages |
| `requireModerator()` | `notFound()` | Moderator pages — a probe cannot tell `/moderation` from a URL that does not exist |
| `isModerator(viewer)` | boolean | Server-side branching, including what a Server Component hands a client leaf |

All five are in [`src/lib/auth.ts`](../src/lib/auth.ts) and all read the
session from Supabase on the server. Identity never comes from a prop, a
cookie the client could write, or a value passed in from a component.

**Route protection is deliberately not in middleware.**
[`middleware.ts`](../middleware.ts) refreshes the session and settles the
locale, and nothing else. Middleware runs before a route is resolved and cannot
read the database cheaply, so a redirect decided there would be a guess; the
decision is made where the real role is known. Within an action, `authoriseModerator()` in
[`src/server/actions/moderation.ts`](../src/server/actions/moderation.ts)
repeats the three rules — signed in, not suspended, role `moderator` or
`admin` — because an action is a public HTTP endpoint whether or not a page
links to it.

---

## The server-action convention

Every write in FRAME is a server action in `src/server/actions/`, one module
per feature, and every one of them returns
[`ActionResult`](../src/lib/action-result.ts):

```ts
type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: ActionCode; fieldErrors?: Record<string, string> };
```

An expected failure is a value, not an exception. Signed out, rate limited, no
database configured, a validation error on one field: all of these are normal
outcomes that travel back as data a form can render next to the control that
caused them. `ok()` is only ever constructed after a write has actually been
made — there is no optimistic variant in the module, on purpose.

### The order, every time

```
1. Capability   isDemoMode() → fail(NOT_CONFIGURED_MESSAGE, 'not_configured')
2. Authenticate getViewer()  → fail(…, 'unauthenticated')
3. Authorise    suspension, ownership, role → fail(…, 'forbidden')
4. Rate limit   checkRateLimit(bucket, limit, window) → fail(…, 'rate_limited')
5. Validate     parseForm(input, schema) → fail(message, 'validation', fieldErrors)
6. Write        as the signed-in member, so RLS applies
7. Revalidate   revalidatePath() for each affected route
```

The order is not arbitrary. Capability first, because without a database the
rest is meaningless. Authentication before rate limiting, because a bucket must
key on an account — never on an IP address, which is shared by everyone behind
one carrier NAT. Validation after authorisation, because a stranger should not
be able to learn a schema by probing error messages. Writing last, and only
once.

Two deliberate exceptions, both commented where they occur:

- `signIn` and the other address-keyed auth actions validate before
  rate-limiting, because the bucket is derived from the submitted address and
  the address has to be parsed first. Nothing is read or written before the
  limit applies.
- `submitReport` does not refuse an absent viewer. An unattributed report is a
  supported outcome, since the people most likely to notice a stolen photograph
  are the ones who never joined.

### Validation

[`parseForm(input, schema)`](../src/lib/validation/index.ts) accepts either a
`FormData` from a progressively-enhanced form or a plain object from a client
component, so no action needs two code paths. It never throws, and it flattens
issues into dotted-path `fieldErrors` (`capture.iso`) with form-level issues
under `_form` — the same keys
[`failFromZod()`](../src/lib/action-result.ts) produces, so a form renders
errors identically whichever path validated them. The schemas themselves live
in `src/lib/validation/`, one module per feature over a shared `fields.ts` of
primitives, and the rules are in the schema rather than only in the UI.

### The one route handler

[`src/app/api/uploads/sign/route.ts`](../src/app/api/uploads/sign/route.ts)
is a POST route rather than an action, because the browser needs the grant in
order to make its own request to the storage provider. It follows the identical
order and returns the same codes inside a JSON body with matching HTTP statuses
(`503` not configured, `401`, `403`, `429` with `retry-after`, `422`, `409`,
`404`, `201`). See [`docs/IMAGE-PIPELINE.md`](IMAGE-PIPELINE.md).

---

## Storage abstraction

[`src/lib/storage/`](../src/lib/storage/) exposes three operations and no more:

```ts
interface StorageDriver {
  name: 'supabase' | 'r2';
  createSignedUpload(input: { key; contentType; maxBytes }): Promise<SignedUploadGrant>;
  publicUrl(key: string): string;
  remove(keys: string[]): Promise<void>;
}
```

The interface is narrow on purpose: the moment one driver depends on something
a provider offers beyond these three, the other is no longer a drop-in.
`storageDriver()` picks from `serverEnv().storageProvider`, and nothing above
that module knows which provider answered.

The invariants live in [`types.ts`](../src/lib/storage/types.ts) where both
drivers enforce them — `parseStorageKey()` accepts only the
`owner/photograph/leaf` layout that `storageKeys()` builds, and
`assertSignableUpload()` refuses a leaf-and-content-type mismatch or a ceiling
above `UPLOAD_POLICY.maxFileBytes`. A key that has not been through that
function never reaches a provider.

**What swapping costs.** For `supabase` → `r2`: set `STORAGE_PROVIDER=r2`, the
three `R2_*` variables and `NEXT_PUBLIC_IMAGE_HOST`; create the bucket and its
public custom domain; add the host to `remotePatterns` in
[`next.config.mjs`](../next.config.mjs). No application code changes. Existing
rows keep working only if the objects are copied across, because
`photograph_images.storage_key` is provider-independent but the public prefix
is not.

**What the abstraction does not hide**, and a reviewer should know:

- Signed-upload lifetimes differ and are reported honestly rather than
  normalised: Supabase fixes two hours, R2 uses the 600 seconds FRAME chose.
- Neither provider can pin a maximum size on a grant. R2 pins the content type
  as a signed header; Supabase can only pin it as a request header, and relies
  on the bucket's `file_size_limit` and `allowed_mime_types`. The real
  enforcement is `verifyImageBytes()` on the bytes that actually arrived.
- The live repository has its own `storagePublicUrl()` that duplicates
  `publicUrl()`, so a read path has no import-time dependency on the upload
  side. Two implementations of one string is a known duplication; see
  [`docs/LIMITATIONS.md`](LIMITATIONS.md).

---

## Map abstraction

[`src/components/map/map-style.ts`](../src/components/map/map-style.ts) holds
every assumption FRAME makes about a map provider: the style URL, the
attribution, the camera defaults, the cluster configuration and the paint of the
pins. [`src/lib/map/basemap.ts`](../src/lib/map/basemap.ts) holds the map under
them. Nothing outside those two modules names a tile host or a colour.

Three rules shape them:

1. **The default is a basemap of FRAME's own.** MapLibre's demo tiles are
   licensed for evaluation only, so shipping them as a fallback would put every
   deployment in breach on first load — but shipping no map at all meant every
   deployment without a tile subscription showed an apology where its map
   should be. `basemap.ts` builds a complete style instead: land, water,
   planting, buildings, the street grid, boundaries and labels, over
   OpenFreeMap's planet-wide tiles, which need no account and no key.
   `src/app/basemap/[variant]/route.ts` serves it, prerendered, at one URL per
   theme and language. `NEXT_PUBLIC_MAP_STYLE_URL` still replaces it with a
   provider's own style, and the value `off` draws no map at all — the case
   [`MapUnavailable`](../src/components/map/MapUnavailable.tsx) is now for.
2. **The map follows the interface.** The basemap exists in a light and a dark
   palette, mirrored from the `@theme` tokens in `globals.css`, and with labels
   in English or Thai. `useResolvedTheme()` and the active locale choose the
   variant, and a change to either rebuilds the map with its camera carried
   across — a style document cannot be recoloured in place.
3. **Attribution is a licence condition, not a courtesy.** The built-in
   basemap's credit arrives in its TileJSON and MapLibre prints it unprompted,
   so FRAME adds no second copy. For a configured provider, the configured
   attribution is handed to MapLibre's own control, and its absence is stated
   in the interface rather than ignored.

`MapCanvas` imports `maplibre-gl` inside an effect, keeping roughly a megabyte
of WebGL renderer off the server bundle and the critical path, and guards every
call on the style having finished loading. A WebGL canvas is not usable by a
screen reader at any price, so the page that renders a map also renders the
same places as a list.

**What swapping costs.** A different provider is a new `NEXT_PUBLIC_MAP_STYLE_URL`
and `NEXT_PUBLIC_MAP_ATTRIBUTION`. Glyphs and sprites come from the style
document, so they travel with it. What does not travel: a style whose layer ids
clash with FRAME's own (`MAP_LAYERS` in `map-style.ts`) would need those
constants changed, and a provider requiring a key in a header rather than in
the URL would need a proxy route, which this abstraction does not have.

---

## Directory layout, and where a new file goes

| Path | What lives there |
| --- | --- |
| `src/app/` | Routes, layouts, `globals.css`. Every page sits under `src/app/[locale]/`, one folder per route segment, with `loading.tsx`, `error.tsx` and `not-found.tsx` beside the page they belong to. What stays outside that segment is what is not a page: `sitemap.ts`, `robots.ts`, `manifest.ts`, `icon.svg`, `global-error.tsx`, `api/` and the `auth/` route handlers, plus the root `layout.tsx` that holds the stylesheet |
| `src/i18n/` | The locale set, the next-intl routing and navigation wrappers, and the per-request message configuration. Every internal link imports `Link` from `src/i18n/navigation` rather than `next/link` |
| `src/messages/` | One message catalogue per language, `en.json` and `th.json`, in the same key order — asserted in CI by `scripts/assert-message-parity.mjs`, because one catalogue is loaded per request and there is no fallback language |
| `src/components/ui/` | Primitives with no domain knowledge: `Button`, `Chip`, `Dialog`, `Field`, `states`, `SectionHead`, `Pagination` |
| `src/components/layout/` | The shell: header, footer, nav, brand |
| `src/components/system/` | Cross-cutting behaviour: notices, toasts, the report dialog |
| `src/components/<feature>/` | One folder per subject area: `photo/`, `photo-detail/`, `location/`, `photographer/`, `collections/`, `discover/`, `search/`, `home/`, `map/`, `moderation/` |
| `src/lib/` | Everything that is not a component. `config.ts`, `data/`, `supabase/`, `storage/`, `images/`, `validation/`, plus the single-purpose modules `auth.ts`, `rate-limit.ts`, `geo.ts`, `ranking.ts`, `seo.ts`, `safe-redirect.ts`, `discover-query.ts`, `utils.ts` |
| `src/server/actions/` | Server actions, one module per feature |
| `src/types/` | `domain.ts`, the hand-written contract |
| `supabase/` | Migrations, seed, local CLI config |
| `docs/` | This documentation, plus the static visual reference in `docs/prototype/` |

**The rule.** Ask what the file *is*, not what it is *for*:

- Renders markup → `src/components/`. In `ui/` if it has no domain knowledge,
  in a feature folder if it does. One component per file, named for what it is.
- Reads data → it goes through `src/lib/data/repository.ts`. If the read does
  not exist yet, add it to the repository and to both implementations.
- Writes data → `src/server/actions/<feature>.ts`, returning `ActionResult`.
- Validates input → `src/lib/validation/<feature>.ts`, with any shared
  primitive in `fields.ts`.
- Reads an environment variable → it belongs in `src/lib/config.ts` and
  nowhere else.
- Knows a provider's API → `src/lib/storage/` for object storage,
  `src/components/map/map-style.ts` for maps.
- Is a pure helper with no domain meaning → `src/lib/utils.ts`.
- Describes an entity → `src/types/domain.ts`, which is a contract: adding to
  it is a deliberate decision, and it is never replaced by generated output.

---

## Walkthrough: a gallery read

`GET /discover?category=night&sort=trending&page=2`

1. **[`middleware.ts`](../middleware.ts)** matches (the matcher excludes static
   assets, the image endpoint and the crawler files) and calls
   [`updateSession()`](../src/lib/supabase/middleware.ts), which refreshes the
   Supabase session and writes any rotated tokens onto the response. In demo
   mode the request passes through untouched. It then runs the next-intl
   middleware, which rewrites `/en/discover` into the `[locale]` segment or
   redirects a request that arrived without a language prefix, and the rotated
   cookies are carried onto that response. Nothing is authorised here.

2. **[`src/app/[locale]/discover/page.tsx`](../src/app/[locale]/discover/page.tsx)**
   runs as a Server Component. `params` carries the locale and `searchParams` is
   a Promise, so both are awaited, then the search params are passed
   through `parseDiscoverSearchParams()` in
   [`src/lib/discover-query.ts`](../src/lib/discover-query.ts) — the only
   translation between that URL and a `DiscoverQuery`. Parsing never throws: an
   unknown category or a hand-edited `?page=900000` falls back to the default
   view, and paging is capped at `MAX_DISCOVER_PAGE` because an offset is a
   database cost.

3. **`generateMetadata()`** builds the title and canonical URL through
   [`buildMetadata()`](../src/lib/seo.ts), and sets `noIndex` for any filtered
   view: filters, orderings and pages multiply into thousands of near-identical
   URLs, and indexing them would bury the pages worth finding.

4. **Two reads start before either is awaited.** `getGearFacets()` and
   `getDiscoverFeed(query)` both enter
   [`repository.ts`](../src/lib/data/repository.ts), which asks
   `isDatabaseConfigured()` and dispatches.

5. **Live path —** `discoverFeed()` in
   [`supabase-repository.ts`](../src/lib/data/supabase-repository.ts):
   - `createClient()` builds the cookie-bound client, so every statement runs
     as the viewer and RLS applies.
   - `fetchPhotographRows()` issues **one** embedded select — the photograph's
     own columns plus `profiles`, `locations`, `photograph_images` and
     `photograph_metadata` — filtered on `status = 'published'`. A place filter
     or a gear filter switches the matching embed to an inner join, because
     filtering an embedded resource without that empties the embed instead of
     removing the parent row.
   - A free-text place term goes through `sanitiseSearchTerm()`, which strips
     the characters that carry meaning in a PostgREST filter expression.
   - For `sort=trending`, the newest `TRENDING_POOL` (300) rows are read and
     ranked in process with `trendingScore()`, because the decay expression
     cannot be an ordering in PostgREST; `totalCount` is then `null`. For the
     other orderings, `pageSize + 1` rows are requested so "is there a next
     page" is answered without an exact count.
   - `appreciationLookup()` asks once, for the whole page, which of these
     photographs the viewer has appreciated. Signed out it returns `null` per
     photograph rather than `false`, so the control can send a visitor to sign
     in instead of showing a state it cannot know.
   - `buildImage()` assembles `thumbUrl`, `gridUrl` and `displayUrl` from the
     stored derivatives via `storagePublicUrl()`, degrading to the next largest
     derivative if one is missing, and never to the original.

   **Demo path —** `demoDiscover()` filters the bundled array in memory, sorts
   it with the same `sortPhotographs()` the live path's trending branch uses,
   and paginates. `DemoNotice`, mounted in the root layout, has already told
   the reader that this is sample data.

6. **Render.** The page frame is returned immediately; the results sit behind
   `<Suspense>` keyed on the view, with `GallerySkeleton` as the fallback.
   [`MasonryGallery`](../src/components/photo/MasonryGallery.tsx) lays the cards
   out with the `masonry-columns` utility and
   [`PhotoCard`](../src/components/photo/PhotoCard.tsx) — a Server Component —
   renders each one: `next/image` with `photo.image.gridUrl`,
   `IMAGE_SIZES.galleryCard`, the real ratio from `aspectRatio(photo.image)`
   and `photo.altText` as the alt text.

7. **One client leaf per card.**
   [`AppreciateButton`](../src/components/photo/AppreciateButton.tsx) receives
   `initialCount`, `initialHasAppreciated` and `signedIn` as plain values.
   Signed out it is a real link to `/login?next=…` and mutates nothing.

8. **Paging.** [`Pagination`](../src/components/ui/Pagination.tsx) is a Server
   Component rendering real anchors built by `buildDiscoverHref()`, so a page
   is shareable and the back button means something.

---

## Walkthrough: an appreciation write

A signed-in member presses the heart on a card.

1. **Client, optimistic.** `AppreciateButton` flips its own state, disables
   itself in flight, and calls the server action. The visible count under the
   image is server-rendered, so it moves when revalidation lands rather than
   immediately.

2. **[`toggleAppreciation(photographId)`](../src/server/actions/appreciation.ts)**
   runs on the server, in this order:
   - `isDemoMode()` → `fail(NOT_CONFIGURED_MESSAGE, 'not_configured')`. No
     database, no pretending.
   - `getViewer()` → `fail('Sign in to appreciate a photograph.', 'unauthenticated')`.
   - `checkRateLimit('appreciate:<viewer id>', 20, 60)` and then the same bucket
     at 200 an hour, from `APPRECIATION_POLICY`. The bucket keys on the account.
     `checkRateLimit` appends the window length to the storage key, so the two
     checks are two independent counters. Before it did, each check recorded a
     hit in the other's counter and both limits bit at half their stated value;
     `supabase/tests/constraints.sql` has the regression test.
   - The id is parsed as a UUID with zod. A malformed id is a validation
     failure, not a database error.

3. **[`checkRateLimit()`](../src/lib/rate-limit.ts)** calls the
   `check_rate_limit` RPC, which counts the bucket's hits inside the window,
   records this one when it is allowed, and returns `retry_after_seconds`.
   `rate_limit_hits` grants no privilege to any client role, so that
   `SECURITY DEFINER` function is the only way in — a client that could delete
   its own hits could reset its own limit. With no database, a bounded
   in-process map answers instead; it is per-instance and therefore not a
   security control on its own, which its own comment and
   [`docs/LIMITATIONS.md`](LIMITATIONS.md) both say.

4. **The write** is `supabase.rpc('toggle_appreciation', { p_photograph_id })`
   on the cookie-bound client. Inside
   [`0006_functions_and_triggers.sql`](../supabase/migrations/0006_functions_and_triggers.sql):
   - the actor is `auth.uid()`; the photograph id is a parameter and the actor
     never is;
   - a suspended account and a non-published photograph are both refused;
   - the `photographs` row is locked, so two simultaneous toggles cannot both
     recount a half-finished picture;
   - the member's appreciation row is deleted if present and inserted if not,
     with `on conflict do nothing`;
   - `appreciation_count` is then **recomputed** with `count(*)` over
     `photograph_appreciations` in the same statement that writes it. There is
     no `+ 1` anywhere in the schema.

   `UNIQUE (photograph_id, profile_id)` is what actually prevents a double
   vote. No amount of care in the action would stop two concurrent requests
   both passing a "have you already appreciated this?" check, which is why the
   action treats a `23505` unique violation as the idempotent success it is:
   the member asked for the state they are already in, and gets it with the
   true count.

5. **The reply is parsed, not trusted.** A row that cannot be read back is
   reported as exactly that — "recorded, but the result could not be read" —
   rather than guessed at, and the action never trusts a count the client sent.

6. **Revalidation.** `revalidatePath('/photographs/<slug>')`,
   `/photographers/<owner>` and `/discover`. A surface the action does not
   revalidate will show the heart revert when the authoritative response
   arrives, even though the write succeeded.

7. **Client, resolved.** On success the authoritative count replaces the
   optimistic one. On failure the state reverts and the real error is shown
   through [`useToast()`](../src/components/system/Toast.tsx), with specific
   copy for `rate_limited` and `not_configured`. Nothing is reported as saved
   that was not saved.

---

## See also

| Document | What it answers |
| --- | --- |
| [`docs/DATABASE.md`](DATABASE.md) | The schema, the constraints that carry product meaning, the RLS rule per table, indexing and migrations |
| [`docs/IMAGE-PIPELINE.md`](IMAGE-PIPELINE.md) | The lifecycle of an upload, from signed grant to served derivative |
| [`docs/SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) | Each control, where it is implemented, and how to verify it |
| [`docs/LIMITATIONS.md`](LIMITATIONS.md) | What this architecture does not do, and what the fix would look like |
| [`docs/ENVIRONMENT.md`](ENVIRONMENT.md) | Every variable, and the minimum set for each capability |
| [`docs/EXTERNAL-SERVICES.md`](EXTERNAL-SERVICES.md) | What each external service costs and which limit bites first |
