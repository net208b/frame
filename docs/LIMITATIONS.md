# Limitations

What FRAME does not do, cannot do, or does only partly — and what the fix would
look like in each case.

This is the most useful document in the set, and it is written from the code
rather than from the plan. If something here contradicts a claim made elsewhere
in the repository, this file is the one to trust: a document that describes an
intention the code does not implement is worse than no document.

Every entry follows the same four lines:

- **What** — the limitation, stated plainly.
- **Why** — the reason it is like this, which is usually a trade rather than an
  oversight.
- **What could go wrong** — the concrete failure, not a vague risk.
- **The fix** — what it would actually take, and which files it touches.

---

## Contents

- [Places and geography](#places-and-geography)
- [Provenance and copyright](#provenance-and-copyright)
- [Ranking, search and paging](#ranking-search-and-paging)
- [Abuse control](#abuse-control)
- [Privacy hardening](#privacy-hardening)
- [What depends on configuration](#what-depends-on-configuration)
- [Demo content and seeded data](#demo-content-and-seeded-data)
- [Performance and cost](#performance-and-cost)
- [Accessibility](#accessibility)
- [Engineering process](#engineering-process)
- [Documentation drift](#documentation-drift)
- [Next steps](#next-steps)

---

## Places and geography

### The country bounding boxes cover a fraction of the world

**What.** `COUNTRY_BOXES` in [`src/lib/geo.ts`](../src/lib/geo.ts) holds 46
rectangles. There are close to two hundred countries. A submission from anywhere
else gets an `info` signal reading "No bounding box on file for XX, so the
country could not be cross-checked" and no geographic check at all.

**Why.** The table was written for the countries the bundled dataset uses, plus
the obvious additions. A hand-maintained list of rectangles is the cheapest check
that catches the common mistake — a transposed latitude and longitude, or a
decimal point in the wrong place — without a geocoding provider, a licence, or a
network call on a write path.

**What could go wrong.** Two things, in opposite directions. A real submission
from Kenya or Peru's neighbour gets no cross-check, so a transposed coordinate
reaches a moderator with nothing flagged. And — more subtly — **a point inside
its box is merely not obviously wrong.** The box for the United States spans a
quarter of the planet's longitude; a point in the middle of Nebraska passes the
check for a photograph credited to Manhattan. A moderator who reads "no signals"
as "verified" has been misled by the absence of a signal rather than by a signal.
`evaluateLocationSubmission()` returns signals and never a verdict precisely
because of this, and the UI labels them as signals with a severity.

**The fix.** Either complete the table from a public ISO-3166 bounding-box
dataset — mechanical, and it would take the `info` branch from common to rare —
or replace rectangles with a real point-in-polygon test against country
geometries in PostGIS, which the extension is already installed for. The second
is strictly better and also strictly more work: it needs a geometry table, a
source for it, and a migration. Either way the output stays a signal.
*Touches:* `src/lib/geo.ts`, and for the PostGIS version a new migration plus a
read in `src/server/actions/locations.ts`.

### There is no reverse geocoding, and it would not help if there were

**What.** Nothing in FRAME asks a provider what is at a coordinate. The only
automated geographic checks are the bounding box, the `0,0`/whole-degree
placeholder test, and the duplicate radius.

**Why.** Because of what reverse geocoding can and cannot establish, written out
in the header of `src/lib/geo.ts`: a provider returning "Kyoto" for a pair of
coordinates says the point falls inside a polygon labelled Kyoto. **It does not
confirm that the place exists, that it is accessible, that anybody may
photograph it, or that the photograph was taken there.** Adding a provider would
add a dependency, a cost and a rate limit in exchange for a string that answers
none of the questions a moderator actually has.

**What could go wrong.** The failure mode is believing otherwise. If a future
version displays a geocoded place name next to a submission, a moderator will
read it as corroboration, and the one thing the approval step exists to prevent —
a map that points strangers at somewhere real on nobody's authority — becomes
easier rather than harder.

**The fix.** Not "add geocoding". If a provider is ever added, its answer must
arrive as a `SubmissionSignal` with its own `kind`, rendered through
`SignalBadge` like every other signal, and the moderator UI must keep saying that
approval is a human decision.
*Touches:* `src/types/domain.ts` (a new signal kind),
`src/components/moderation/SignalBadge.tsx`, `src/server/actions/locations.ts`.

### A duplicate place cannot be merged, only flagged

**What.** The moderation dashboard shows pairs of approved places within
`LOCATION_POLICY.duplicateRadiusMetres` (120 m) of each other, and
`recordDuplicateReview()` in
[`src/server/actions/moderation.ts`](../src/server/actions/moderation.ts) writes
**one audit row and nothing else**. Its own comment says so: "FRAME cannot merge
locations: there is no merge function, and no table that stores a merge
request." The success message is written to match — "Flagged for merging.
Nothing has been merged — the note is in the audit trail for a person to pick
up."

**Why.** A merge is not one statement. It has to move every photograph from one
place to the other, reassign collection items, recount both rows, decide which
name, description, restrictions and privacy flags survive, keep the losing slug
redirecting so existing links do not break, and leave an audit trail. Shipping a
button that did some of that would be worse than shipping one that is honest
about doing none of it.

**What could go wrong.** Duplicates accumulate. Two entries for the same
staircase split its photograph count, so neither ranks where the place deserves
to, and a reader browsing `/locations` sees the same place twice. The dashboard
will keep re-surfacing a pair that a moderator has already reviewed and
dismissed, because the only record of that review is an audit row nothing reads
back.

**The fix.** A `merge_locations(p_keep uuid, p_merge uuid, p_moderator uuid)`
function, `SECURITY DEFINER`, doing all of the above in one transaction, plus a
`locations.merged_into_id` column so the losing slug can 301 instead of 404.
Reading the existing audit rows to suppress already-reviewed pairs is a smaller,
independent improvement worth doing first.
*Touches:* a new migration, `src/server/actions/moderation.ts`,
`src/lib/data/supabase-repository.ts` (the duplicate scan),
`src/app/locations/[slug]/page.tsx` (the redirect).

### The duplicate scan is bounded and approximate

**What.** `moderationQueues()` reads at most `DUPLICATE_SCAN_LIMIT = 3,000`
locations ordered by latitude and compares neighbours, reporting at most 40
pairs. `submitLocation()` checks a *bounding box* around a proposed point, not a
circle, and reads at most 50 candidates.

**Why.** PostgREST cannot express a self-join on a distance expression, so the
comparison happens in process. The bounding box is what PostgREST *can* filter
on without reaching into PostGIS from the query path;
`evaluateLocationSubmission()` then applies the real circular radius, so the box
only has to be a superset.

**What could go wrong.** Past 3,000 approved places the scan misses pairs outside
its window. More than 50 approved places inside a 120 m box — plausible in a
dense city centre once the site has grown — and the duplicate signal is computed
from an arbitrary 50 of them.

**The fix.** Both have the same answer: push the comparison into SQL, where
`locations_geog_gist` already exists. A `possible_duplicate_locations()` function
using `ST_DWithin` would be exact and unbounded; a radius query in
`nearbyApprovedLocations()` would remove the box.
*Touches:* a new migration, `src/lib/data/supabase-repository.ts`,
`src/server/actions/locations.ts`.

---

## Provenance and copyright

### EXIF is not proof of ownership, and nothing treats it as such

**What.** FRAME reads EXIF to prefill a form and to show a moderator what a file
claimed. No permission anywhere is granted on the strength of it.

**Why.** EXIF is written by whatever software touched the file last and can be
rewritten in seconds with a free tool. A photograph with a complete EXIF block is
no more likely to belong to the uploader than one with none — and the reverse
inference is just as wrong, because exporting software strips EXIF as a matter of
routine. The `exif-missing` signal says this in the moderation queue in so many
words.

**What could go wrong.** A moderator treating a matching camera model as
corroboration in a copyright dispute. The queue is written to resist that — every
signal carries a severity, and the one case that reaches `high` is the camera's
own position sitting more than 2 km from the credited place — but the control is
ultimately the person reading it.

**What `0038` adds, and does not.** A film scan now carries three things a
phone picture with its record stripped does not: the scanner the file itself
names (`device_class = 'scanner'` — Epson, Noritsu, Plustek, a Coolscan),
the member's own statement of stock, camera and scanner, shown publicly, and a
report reason for the other film photographers who can tell. None of it is
proof; a scanner's make is as forgeable as a camera's. It changes what a
reviewer has to read and what a disguise has to invent.

**The fix.** There is no technical fix, because the limitation is in the format.
What *does* help is what the schema already does: `photographs.rights_confirmed_at`
records the moment a human confirmed in their own words that the work is theirs,
the `photographs_publishable` constraint makes that a precondition of
publication, and the copyright policy at `/legal/copyright` describes the
counter-notice process. Provenance standards such as C2PA would be a genuine
improvement and are a project of their own.

### Perceptual hashing is a near-duplicate hint, and no more

**What.** Since migration `0037` every stored photograph has a 64-bit difference
hash (`photograph_fingerprints`, computed by `src/lib/images/fingerprint.ts`
from the display derivative), and `similar_photographs()` returns the published
frames within a Hamming distance of a given one. The server calls it before
publishing and turns any match into a high-severity `perceptual-hash-match`
signal, so the upload waits for a moderator, who sees the match in the queue
with the two frames a click apart. Until `0037` this check was described on
`/legal/copyright` and did not exist; the copy there was already written for
what the check can and cannot do, and needed no change.

**Why it is only a hint.** A dHash records the broad distribution of light on a
9×8 grid. That survives a re-export, a resize and a recompress, which is what
makes it find a re-upload — and it is all it records. A crop changes the grid;
a mirrored frame reverses every comparison; a heavy edit moves the light. None
of those will match. Nor can the hash say which of two frames came first, or
tell a member re-uploading their own work (which it will flag, and say so) from
somebody taking it. And it only knows about FRAME: a photograph copied from
anywhere else is invisible to it by construction.

**What could go wrong.** A moderator reading a match as proof, or a near miss as
proof of originality. The queue's wording and the caveat under the signals are
written against that. The ceiling, `UPLOAD_POLICY.perceptualMatchMaxDistance`
(10 of 64 bits), is a judgement: lower misses re-uploads, higher sends honest
coincidences to a person. It has not been tuned on real traffic, because there
is not yet any.

**What would be more.** C2PA content credentials would carry provenance in the
file rather than inferring it from the pixels, and are a project of their own.
A second, rotation-tolerant hash would catch mirrored frames at the cost of
more coincidental matches.

*Touches:* `supabase/migrations/0037_perceptual_fingerprints.sql`,
`src/lib/images/fingerprint.ts`, `src/server/actions/upload.ts`,
`src/lib/data/supabase-repository.ts`, `scripts/backfill-fingerprints.mjs`.

### A similarity score would be a review signal, not evidence

**What.** A hash match
cannot tell which of two uploads was made first, cannot distinguish a crop from a
copy, and cannot distinguish a photographer re-uploading their own work from
somebody taking it.

**Why.** It compares pixels, and none of those questions is about pixels.

**What could go wrong.** Automatic removal on a hash match would take down a
photographer's own re-upload and would be exploitable: upload somebody's work
first and their original becomes the "match".

**The fix.** Keep the current design. Signals go in front of a person, labelled,
with a severity. Nothing in this codebase removes content automatically and
nothing should start.

### Derivative bytes are not verified

**What.** `signUploadSchema` accepts a `target` of `original`, `thumb`, `grid`,
`display` or `full`, so an owner can obtain a signed grant for one of their own
*derivative* keys and PUT arbitrary WebP over the file `buildVariants()`
generated. `verifyImageBytes()` runs on the original only. The upload wizard
sends `target: 'original'`, so this is reachable only by calling the endpoint
directly.

**Why.** The target parameter exists because `attachVariants()` needs grants for
the derivative keys in order to write them, and both paths share one endpoint and
one schema.

**What could go wrong.** A member publishes a photograph whose served `grid.webp`
is not derived from the verified original: smaller than the minimum dimensions,
or an animated WebP, or simply a different image from the one a moderator
reviewed. The key is still inside their own prefix and the grant still refuses a
non-WebP content type, so this is a content-integrity problem rather than a
cross-account one. The sign route refuses once a photograph is `published`, which
narrows the window to the pre-publication interval.

**The fix.** Restrict the signable target on the public route to `original`, and
let `attachVariants()` build its derivative grants through the driver directly —
which it already does, via `driver.createSignedUpload()`, without going through
the route at all. That makes the route's schema narrower than the driver's, which
is the correct direction.
*Touches:* `src/app/api/uploads/sign/route.ts`, `src/lib/validation/upload.ts`.

---

## Ranking, search and paging

### Trending is a fixed half-life, not a tuned model

**What.** `trendingScore()` in [`src/lib/ranking.ts`](../src/lib/ranking.ts) is
`(appreciations + 1) / 2^(ageHours / 36)`. The 36 hours is a constant in
`APPRECIATION_POLICY`, chosen rather than fitted, and duplicated in SQL as
`trending_score_at()`.

**Why.** It is explainable, which matters more than optimal on a platform whose
whole pitch is that the feed is not a black box: `SORT_EXPLANATIONS` tells readers
the rule in a sentence. It also has no inputs other than a count and a timestamp,
so it cannot be gamed by anything except appreciation, and that is
one-per-member.

**What could go wrong.** The window is wrong for the community's actual rhythm. A
36-hour half-life suits a site people check daily; if FRAME turns out to be a
weekly habit, good work will decay out of Trending before most members ever see
it. In the other direction, a quiet period lets a photograph with three
appreciations lead the feed, because the `+ 1` keeps new work visible and there
is no minimum-engagement floor.

**The fix.** Changing the constant is one line — but **in two files, in the same
commit**, or the SQL ordering and the TypeScript ordering will disagree about the
same two photographs. Anything smarter (per-category decay, a floor, a
personalised feed) is a product decision that has to be weighed against the
explainability the current design buys.
*Touches:* `src/lib/config.ts` and `supabase/migrations/0006_functions_and_triggers.sql`
(a new migration redefining the function).

### Trending reads a bounded pool

**What.** `TRENDING_POOL = 300`. The newest 300 matching rows are read and ranked
in process; `Paginated.totalCount` is `null` for that ordering.

**Why.** The score decays with wall-clock time, so the ordering of two rows
changes without either row being written and no index can hold it. PostgREST
cannot order by the expression.

**What could go wrong.** With heavy filtering — a category *and* a place *and* a
gear filter — the 300 newest matching photographs may not contain the one with
the highest score, so the feed is a correct ranking of a slightly wrong set. In
practice a 36-hour half-life divides a two-week-old photograph by roughly 630, so
it cannot realistically re-enter the top; the bound is honest, but it is a bound.

**The fix.** A `photograph_trending` view ordering on
`trending_score(appreciation_count, published_at)`, which PostgREST can select
from and order by, removing the pool entirely. The immutable
`trending_score_at()` form already exists so that a generated column or an
expression index is possible if the view is not enough.
*Touches:* a new migration, `src/lib/data/supabase-repository.ts`.

### Search matches places and people, and not photographs

**What.** `/search` matches place names, cities and countries (through
`getLocations({ search })` and the discover feed's `place` filter) and
photographer usernames and display names. **It does not match a photograph's
title or description**, and the page says so in its own copy: "a photograph's own
title is not searchable yet, because no repository function can match one." It
certainly does not match image content.

**Why.** The page is built entirely from the existing read API, deliberately: a
bespoke query here would also reach past the published-and-approved filters every
repository function applies. No repository function takes a free-text term for a
photograph.

**What could go wrong.** A reader searching for a photograph by its title gets
results about a place with a similar name, or nothing. As the library grows this
becomes the most obvious missing feature on the site.

**The fix.** A `title_search tsvector` generated column on `photographs` with a
GIN index, a `textSearch` filter threaded through `fetchPhotographRows()`, and a
`q` field on `DiscoverQuery`. The trigram index pattern already used for places
is the simpler alternative if ranking does not matter. Matching image *content*
is a different project and needs an external model.
*Touches:* a new migration, `src/types/domain.ts`,
`src/lib/data/supabase-repository.ts`, `src/lib/discover-query.ts`,
`src/app/search/page.tsx`.

### People search reads profiles one at a time

**What.** `findPhotographers()` in `src/app/search/page.tsx` matches usernames
against the full list from `getPhotographerUsernames()`, then calls
`getPhotographer(username)` for each remaining candidate — up to
`PEOPLE_POOL = 24` separate round trips — to match display names.

**Why.** There is no repository function that searches profiles, and the page is
built only from the read API.

**What could go wrong.** A search that matches many usernames issues two dozen
queries, each of which is itself a multi-table read. It is the slowest page in
the app, and the count it reports is explicitly inexact once the limit is
reached.

**The fix.** A `searchPhotographers(term, limit)` function on the repository, one
query with an `or` filter over `username` and `display_name`, implemented in both
the live and demo repositories.
*Touches:* `src/lib/data/repository.ts`, `src/lib/data/supabase-repository.ts`,
`src/lib/data/demo-repository.ts`, `src/app/search/page.tsx`.

### Paging is offset-based, while the indexes are shaped for keyset

**What.** [`0005_indexes.sql`](../supabase/migrations/0005_indexes.sql) opens by
saying "keyset pagination is the intended access pattern throughout" and ends
most indexes with `id desc` for exactly that. The repository pages with
`.range(offset, offset + limit - 1)`, and `Pagination` renders numbered anchors.

**Why.** Numbered pages are shareable, back-button friendly and easy to reason
about, and `?page=2` in a URL is something a reader can bookmark. A keyset cursor
is none of those things without extra work.

**What could go wrong.** Offset paging reads and discards every row before the
window, so page 400 of Discover reads 9,576 rows to return 24. Two bounds keep it
finite — `MAX_DISCOVER_PAGE = 500` and `MAX_PAGE_SIZE = 60` — so this is a
latency problem at depth rather than an unbounded one. A row inserted while a
reader pages can also shift the window, so an item can be seen twice or missed.

**The fix.** Keyset paging with a `(published_at, id)` cursor in the query
string, which the indexes already serve. `Pagination` would need a "next" href
built from the last row rather than a page number, which changes its contract —
and loses numbered pages, which is the trade to weigh.
*Touches:* `src/lib/data/supabase-repository.ts`,
`src/components/ui/Pagination.tsx`, `src/lib/discover-query.ts`.

### Several figures are computed over a bounded sample

**What.** Where PostgREST cannot express an aggregate, the repository samples:
gear facets and the profile aggregates read 5,000 rows, the country count 5,000,
slug lists 5,000, map pins 2,000, the duplicate scan 3,000, collection lists 60
and collection items 200. Each is a named constant with a comment.

**Why.** PostgREST has no `group by`. The alternatives were a SQL view per
aggregate (work, and a migration each) or a sample with an honest bound.

**What could go wrong.** Past the bound the numbers are quietly wrong — a gear
facet count that undercounts, a country count that stops rising. The project is
careful never to present an unavailable total as a figure (`totalCount` is `null`
and the UI says "Page N"), but a *sampled* number has no such marker in the
interface.

**One of these is a hard limit rather than a soft one:** a hosted Supabase
project defaults `max_rows` to **1,000**, which is below `MAP_PIN_LIMIT` (2,000)
and the 5,000 sample reads. `supabase/config.toml` raises it to 2,000 locally.
Past a thousand approved places the map silently truncates on a default hosted
project.

**The fix.** A SQL view or function per aggregate — `gear_facets()`,
`platform_stats()`, `map_pins()` — selected through PostgREST. That removes both
the sample and the `max_rows` ceiling, and for the facets it removes a 5,000-row
transfer per page load.
*Touches:* a new migration, `src/lib/data/supabase-repository.ts`.

### Gear facets depend on the free-text columns

**What.** The Discover gear filters and `GearFacets` read
`photograph_metadata.camera_brand_text` and its siblings, not the normalised
`*_id` columns, and `publishPhotograph()` writes only the `_text` columns.

**Why.** Nothing in the upload path resolves a typed brand to a catalogue row, so
the `_id` columns are never populated and an embed on them would return nothing.

**What could go wrong.** The curated catalogue tables exist, are seeded, and are
unused. Facets are therefore grouped by exactly what members typed, which is what
the four lookup tables were created to avoid: `Fujifilm`, `FUJIFILM` and `Fuji`
become three facets.

**The fix.** Resolve the text to a catalogue row in `publishPhotograph()` —
case-insensitive match on `name`, writing the id as well as the text — and
backfill existing rows. The facet query can then group by id and display the
catalogue's own spelling. The `_text` columns stay, because a member shooting
something unlisted must not be asked to pretend otherwise.
*Touches:* `src/server/actions/upload.ts`,
`src/lib/data/supabase-repository.ts`, a backfill migration.

### Four declared signal kinds are never produced

**What.** `SubmissionSignal` declares `sensitive-area` and `rate-limited`;
`UploadSignal` declares `embedded-credit-mismatch` and `perceptual-hash-match`.
All four have labels in `SignalBadge`. None is ever generated by live code; they
appear only in the demo dataset.

**Why.** The vocabulary was designed ahead of the checks.

**What could go wrong.** Nothing breaks — an unused union member is inert — but
the demo dataset shows a moderator a queue that is richer than the live one, and
a reviewer reading the types will overestimate what runs. `perceptual-hash-match`
is the serious case and has [its own entry](#perceptual-hashing-is-promised-in-the-ui-and-does-not-exist).

**The fix.** For `embedded-credit-mismatch`: compare an IPTC/XMP `by-line` in
`exif_source` against the uploader's display name — the readout does not
currently pick those tags, so `readExif` needs two more. For `sensitive-area`:
there is no data source, so either define one or remove the kind. For
`rate-limited`: `submitLocation()` already knows when a member is near their
daily limit and could record it.
*Touches:* `src/lib/images/exif.ts`, `src/server/actions/locations.ts`,
`src/server/actions/upload.ts`, or `src/types/domain.ts` to remove them.

---

## Abuse control

### The in-process rate-limit fallback is not a security control

**What.** When `check_rate_limit` is unavailable, `checkRateLimit()` falls back
to a bounded in-memory `Map` of at most 5,000 buckets. Its own comment says it
is "per-instance and therefore NOT a security control on its own".

**Why.** It exists so the limits are still exercised in local development and in
demo mode, where there is no shared store at all. A missing RPC means the
migrations have not been applied, which is a deployment problem rather than an
attack, so the fallback keeps the app usable while the error is logged.

**What could go wrong.** A serverless deployment runs many instances, and a
determined caller only has to be routed to a cold one, where the map is empty.
Every limit is then effectively multiplied by the number of warm instances. This
is reachable only in the window between deploying the app and applying the
migrations — any *other* RPC failure denies the attempt, because a limiter that
opens up when its store is unreachable is not a limiter.

**The fix.** Apply the migrations; that is the whole fix. If a database-free
limiter is ever genuinely needed, it needs a shared store (Redis, Upstash,
Vercel KV) and a second driver behind the existing `checkRateLimit` signature.
*Touches:* `src/lib/rate-limit.ts`.

### The anonymous report bucket cannot tell two visitors apart

**What.** Reports filed without a session share one bucket, `report:anonymous:hour`,
limited to 20 an hour across the whole deployment.

**Why.** There is no identity to key on, and an IP address is not one — it is
shared by everyone behind a carrier NAT, so treating it as identity both misses
real abuse and punishes innocent reporters.

**What could go wrong.** A script spends the hour's allowance in a second and
honest signed-out reporters are refused for the rest of it. The refusal message
says what to do — sign in to file now — which is the only private allowance
available.

**The fix.** There is no good one that keeps anonymous reporting open. A CAPTCHA
trades a bot-detection dependency and an accessibility cost for it. A proof-of-work
challenge trades a visitor's battery. Requiring an account closes the door on the
people most likely to notice a stolen photograph, which is the reason the path
exists. The current design — open, bounded, and labelled as weak — is a
deliberate choice rather than an unexamined one.

### Two rate-limit details are wrong in small, safe ways

**What.** `toggleAppreciation()` passes the identical bucket string
`appreciate:<viewer id>` to both the 20/60s and the 200/3600s checks. Since
`check_rate_limit` records one hit per allowed call against the name it is given,
each toggle records two hits in one bucket, so the effective limits are roughly
10 a minute and 100 an hour. Separately, the pending-upload ceiling is
`pending > maxPendingUploads` in `/api/uploads/sign` and
`pending >= maxPendingUploads` in `pendingUploadGuard()`, so the route allows 31
and the action allows 30.

**Why.** Both are oversights. Every other caller in the app names the window in
the bucket, with a comment explaining exactly why.

**What could go wrong.** Both fail safe — stricter than documented, not looser —
so the consequence is a member hitting a limit the UI quotes as higher than it
is.

**The fix.** Rename the appreciation buckets to `appreciate:minute:<id>` and
`appreciate:hour:<id>`; move the pending check into one shared helper that both
callers use.
*Touches:* `src/server/actions/appreciation.ts`,
`src/app/api/uploads/sign/route.ts`, `src/server/actions/upload.ts`.

### `/api/uploads/sign` does not check the request origin

**What.** `/auth/signout` refuses a cross-site POST on `sec-fetch-site`. The sign
route does not.

**Why.** Server actions get this check from the framework, and the sign route was
written as the one hand-rolled endpoint without it being added.

**What could go wrong.** A cross-origin `fetch` cannot *read* the grant — no CORS
headers are sent, so the response is opaque — but the request still runs, so a
page the member visits can burn their upload rate limit and create pending-upload
pressure. Nothing is written and nothing leaks.

**The fix.** Lift `isSameOrigin()` out of the signout route into a shared helper
and call it first.
*Touches:* `src/app/auth/signout/route.ts`, `src/app/api/uploads/sign/route.ts`,
probably a new `src/lib/same-origin.ts`.

### A suspended member can still file reports, and that is deliberate

**What.** Every write path treats a suspension as signed out — except
`submitReport()`, which lets a suspended account file.

**Why.** Suspension stops someone contributing content. A suspended account
reporting abuse is signal a moderator wants rather than noise to block.

**What could go wrong.** A suspended member uses the report queue to harass,
within their 10-an-hour allowance.

**The fix.** If it happens, the answer is a per-account report block rather than
inferring one from the suspension — they are different decisions and should be
recorded as such.

---

## Privacy hardening

### There is no Content-Security-Policy and no HSTS

**What.** `next.config.mjs` sets `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options` and `Permissions-Policy`. Neither a CSP nor
`Strict-Transport-Security` is set.

**Why.** For the CSP, an honest reason: MapLibre fetches tiles, glyphs and
sprites from whatever hosts the configured style document names, so a correct
`img-src` and `connect-src` has to be derived from `NEXT_PUBLIC_MAP_STYLE_URL` at
request time. Shipping a policy that silently breaks the map on a provider nobody
tested would be worse than shipping none. HSTS is a one-liner and is simply
absent.

**What could go wrong.** Without a CSP, any successful HTML injection executes as
script; with a nonce-based `script-src 'self'` it would be inert text. Without
HSTS, a first request over HTTP is strippable.

**The fix.** HSTS: one header, once every host on the domain is HTTPS-only. CSP:
a nonce from middleware, `script-src 'self' 'nonce-…'`, `frame-ancestors 'none'`,
`form-action 'self'`, and `img-src`/`connect-src` built from the configured
Supabase origin, image host and map style origin. The app renders no
user-supplied HTML, and the one inline script is the JSON-LD tag, so
`unsafe-inline` is avoidable. Start it in report-only mode.
*Touches:* `next.config.mjs`, `middleware.ts`,
`src/components/map/map-style.ts` (to expose the style origin).

### The EXIF GPS columns are protected by query discipline, not by a grant

**What.** `photograph_metadata` is readable by anyone for a published photograph,
and `exif_gps_latitude`/`exif_gps_longitude` live on that table. The repository's
`METADATA_FIELDS` constant deliberately omits them, and the one query that
selects them is scoped to `status = 'under_review'`. Migration `0007` says so
itself and calls a column-level revoke "the obvious hardening here".

**Why.** RLS is row-level. Splitting the GPS columns into a separate
moderator-only table would have been the structural answer and was not taken.

**What could go wrong.** A future `select('*')` on that table in a public read
path publishes the coordinates of where photographers were standing — the exact
harm the whole coordinate policy exists to prevent. Nothing in the type system
would catch it.

**The fix.** One statement in a new migration:
```sql
revoke select (exif_gps_latitude, exif_gps_longitude)
  on public.photograph_metadata from anon, authenticated;
```
A moderator then reads them through a `SECURITY DEFINER` function that checks
`is_moderator()` — which is also what makes the rule testable.
*Touches:* a new migration, `src/lib/data/supabase-repository.ts` (the
under-review query).

### There is no account deletion, and a moderator's profile cannot be deleted at all

**What.** Nothing in the UI deletes an account. Removing the `auth.users` row
cascades to the profile and its photographs, which is the only supported path —
and `moderation_actions.moderator_id` is `on delete restrict`, so an account with
moderation history cannot be deleted at all.

**Why.** The restrict is deliberate: an audit row with no author is not an audit
row. A departing moderator is demoted to `member` instead.

**What could go wrong.** A data-subject erasure request is a manual database
operation, and for a former moderator it cannot be satisfied by deletion at all
without discarding the audit trail. Any delete-account path that is added will
hit a foreign-key error for those accounts and must handle it rather than
reporting a success.

**The fix.** A `deleteAccount()` action that anonymises rather than deletes where
history must survive: null the profile's identifying columns, keep the
`moderation_actions` rows pointing at a retained shell row, and delete the
`auth.users` row. That is a product and legal decision as much as a technical
one, and it needs the privacy policy to describe it.
*Touches:* a new action module, a new migration, `src/app/legal/privacy/page.tsx`.

### No two-factor authentication, and sign-out is local only

**What.** Nothing enrols or enforces MFA, and `signOut()` uses
`scope: 'local'` — signing out on a laptop does not end the session on a phone.
There is no "sign out everywhere" and no session list.

**Why.** Local scope is the right default: a member signing out of a shared
computer should not be logged out of their own phone. Supabase supports MFA; the
app simply does not use it.

**What could go wrong.** A moderator account with a stolen password cannot be
locked out by the member themselves; it has to be suspended by another moderator
(which `requireModerator()` and `toggle_appreciation()` both honour immediately)
or have its password changed.

**The fix.** MFA enrolment through `supabase.auth.mfa`, enforced for any account
whose role is above `member`. A "sign out everywhere" control is a second action
calling `signOut({ scope: 'global' })`.
*Touches:* a new settings surface, `src/server/actions/auth.ts`, `src/lib/auth.ts`.

### Nobody is told what the service role read

**What.** `moderation_actions` records decisions, not reads. A service-role script
that opens a private collection leaves no trace.

**Why.** The service role bypasses RLS by definition, and the project's answer is
to use it almost nowhere — exactly one code path, the unattributed report insert.

**What could go wrong.** An operator with the key can read anything, including
the private collections that moderators are deliberately denied, and nothing
records it.

**The fix.** Postgres audit logging (`pgaudit`) on the service role, plus the
discipline of keeping the key out of anything but a deployment secret store. This
is an operational control rather than an application one.

---

## What depends on configuration

### Every write path needs a database, and says so

**What.** With no Supabase credentials, `isDemoMode()` is true: reads come from
the bundled dataset and **every** write refuses with `NOT_CONFIGURED_MESSAGE`.
Uploads additionally need a storage bucket; maps additionally need
`NEXT_PUBLIC_MAP_STYLE_URL`.

**Why.** This is the design, not a shortfall. The whole interface — filters,
pagination, empty states, the moderation queues — is reviewable before any
external service exists, and nothing fakes a result to achieve it.

**What could go wrong.** A reviewer mistakes demo mode for a broken deployment,
or a deployment for demo mode. `DemoNotice` renders on every page in demo mode
and `CapabilityNotice` names the missing variable and `docs/ENVIRONMENT.md`,
specifically so that neither mistake is available.

**The fix.** Nothing to fix. See [`docs/ENVIRONMENT.md`](ENVIRONMENT.md) for the
minimum variable set per capability.

### `capabilities().uploads` cannot see whether the chosen provider is configured

**What.** `capabilities().uploads` is
`database && Boolean(process.env.STORAGE_PROVIDER ?? 'supabase')`, which is
`true` whenever a database is configured — the `??` default makes the second term
constant. With `STORAGE_PROVIDER=r2` and no R2 keys, the UI reports uploads as
available and `storageDriver()` throws.

**Why.** `src/lib/config.ts` is a fixed contract file in this project and was not
to be edited.

**What could go wrong.** A member on an `r2`-configured deployment with missing
keys sees no `CapabilityNotice` and reaches the wizard. The write path
compensates: `resolveDriver()` catches `StorageConfigurationError` and returns a
refusal naming the exact missing variable, so nothing is reported as uploaded.
The failure arrives later and less gracefully than it should, but it is honest.

**The fix.** One line in `config.ts`:
```ts
uploads: database && (provider === 'r2' ? Boolean(R2 credentials) : true)
```
Until then, the `CapabilityNotice` for uploads is not trustworthy under `r2`.
*Touches:* `src/lib/config.ts`.

### The moderation dashboard is open to everyone in demo mode

**What.** `src/app/moderation/layout.tsx` skips `requireModerator()` when
`isDemoMode()` is true.

**Why.** There is no database, no accounts and no sessions, so there is nobody to
authorise and nothing private to protect — the queues are the bundled sample.
Skipping it is what makes the dashboard reviewable at all, which is the point of
demo mode.

**What could go wrong.** A demo deployment is mistaken for a real one, and
someone concludes the moderation dashboard is unprotected. It is not: with a
database configured the layout gates, and every moderation action re-checks the
role for itself regardless of the layout.

**The fix.** Nothing. Worth knowing when reading the file.

### The RLS comments and the report code disagree about signed-out reports

**What.** `0007_row_level_security.sql` states that "a signed-out report form is
not shipped, because an anonymous write endpoint on a moderation queue is a
denial-of-service waiting to be found". `ReportDialog` is rendered for every
viewer on the photograph, location, profile and collection pages, and
`submitReport()` supports the unattributed path through the service role.

**Why.** Two agents resolved the same trade differently. The implemented
behaviour is bounded (one shared hourly bucket) and honest (if no service-role
key is configured, the member is told to sign in instead), so it is a defensible
answer — but the schema comment describes a different product.

**What could go wrong.** A reviewer reading only the migration concludes
anonymous reporting is impossible, and does not look for the bucket that bounds
it.

**The fix.** Correct the comment in a new migration, or decide that reporting
requires an account and remove the anonymous branch. Either way the two should
agree.
*Touches:* a new migration, or `src/server/actions/reports.ts` and
`src/components/system/ReportDialog.tsx`.

---

## Demo content and seeded data

### The bundled images are development material, not a licence

**What.** The 20 demo photographs and 6 demo avatars are hot-linked from
`images.unsplash.com` by photo id, through `unsplashImage()` in
`src/lib/images/variants.ts`. `images.unsplash.com` is in `remotePatterns` in
`next.config.mjs` so `next/image` will serve them.

**Why.** Reviewing a photography platform needs photographs, and a repository
should not carry tens of megabytes of binaries.

**What could go wrong.** Three things, and the first is the one that matters.
**These are other people's photographs.** They are bundled so that the interface
can be reviewed; that is not permission to run a public site on them, and the
captions, titles, credits and appreciation counts attached to them are invented.
Second, the images are hot-linked, so the demo depends on a third party's
availability and terms. Third, nothing in the repository currently states any of
this next to the data — `src/lib/data/demo/photographs.ts` describes how the
captions were matched to the images but says nothing about their licence.

**The fix.** Add the provenance and the licence position to
`src/lib/data/demo/photographs.ts` and to the README's demo-mode section; remove
`images.unsplash.com` from `remotePatterns` on any production deployment, where
nothing should reference it. Replacing the dataset with images FRAME holds rights
to would be better still.
*Touches:* `src/lib/data/demo/photographs.ts`,
`src/lib/data/demo/photographers.ts`, `next.config.mjs`, `README.md`.

### Demo statistics are marked, and must stay marked

**What.** `PlatformStats.isDemoData` is `true` from the demo repository and
`false` from the live one. `PlatformStatsRow` uses it to change the copy — "No
database is configured, so these four counts describe the demo dataset bundled
with this build. They are not a measure of any community" — and the screen-reader
heading with it.

**Why.** A mock statistic presented as a real one is the most misleading thing
the home page could do.

**What could go wrong.** A new surface renders the numbers without consulting the
flag. `seed.sql` protects the other half of this: it seeds no profiles, no
photographs and no appreciations, because a seeded community statistic would
arrive with `isDemoData: false` from a real database and there would be nothing
left to warn anybody with.

**The fix.** Nothing to fix; a rule to keep. Any component that renders a
`PlatformStats` must branch on `isDemoData`.

### A freshly seeded database looks empty, deliberately

**What.** After `seed.sql` there are camera and lens catalogues and 15 approved
places, and nothing else: no profiles, no photographs, no appreciations, no
restrictions, no shooting notes, no location categories.

**Why.** Each absence is a product rule written out at the top of the file. A
profile implies a person who agreed to be here. A seeded appreciation is a
fabricated endorsement by a member who does not exist. An unsourced restriction
is a rumour the platform would be putting its name to.

**What could go wrong.** Someone sees the empty state and assumes the seed
failed. The counts on `/` really are zero, and that is the honest figure.

**The fix.** Nothing. The empty states are built for this.

---

## Performance and cost

### Almost every page is rendered per request

**What.** Public reads use the cookie-bound Supabase client so the viewer's own
appreciation state can be resolved, and reading cookies opts a route into dynamic
rendering. `generateStaticParams()` enumerates slugs for the detail routes, and
`/photographs/[slug]` sets `revalidate = 300`, but with a database configured
there is little static output.

**Why.** A correct per-viewer control beats a cacheable page with a wrong one. An
appreciate button that shows the wrong state, or shows a state at all when the
viewer is signed out, is exactly the kind of small lie this project is built to
avoid — `viewerHasAppreciated` is `null` rather than `false` for a visitor, so the
control can send them to sign in instead of pretending.

**What could go wrong.** Every gallery page view is a database round trip, so
cost and latency scale with readers rather than with content. This is the first
thing to revisit if the site needs to be cheap at scale.

**The fix.** Split each surface: render the page statically from a session-less
read, and resolve the viewer's appreciation state in a small client fetch or a
separate dynamic segment. That is a real architectural change, and it trades the
current simplicity for cacheability.
*Touches:* `src/lib/data/supabase-repository.ts`,
`src/components/photo/PhotoCard.tsx`,
`src/components/photo/AppreciateButton.tsx`, every page that reads a feed.

### A card's visible appreciation count lags its own heart

**What.** `AppreciateButton` updates its own state and its accessible label
immediately; the count printed under the image in `PhotoCard` is server-rendered
and moves only when revalidation lands.

**Why.** The card is a Server Component, which is what keeps the gallery's
JavaScript to a toolbar and a heart.

**What could go wrong.** On a surface `toggleAppreciation()` does not revalidate
— it revalidates `/photographs/<slug>`, the owner's profile and `/discover` — the
heart will visibly revert when the authoritative response arrives even though the
write succeeded. A member could reasonably read that as a failure.

**The fix.** Either lift the count into the client leaf so both move together, or
add the missing paths to the revalidation list. The first is better; the second is
a line.
*Touches:* `src/components/photo/PhotoCard.tsx`,
`src/components/photo/AppreciateButton.tsx`,
`src/server/actions/appreciation.ts`.

### The map asks for every pin at once

**What.** `getMapPins()` returns up to `MAP_PIN_LIMIT = 2,000` pins in one
request, each with a resolved preview thumbnail, and `MapCanvas` clusters them
client-side.

**Why.** Clustering in MapLibre is cheap and needs the whole set, and it avoids a
request per pan.

**What could go wrong.** Past 2,000 approved places the map is silently
incomplete — and on a default hosted project `max_rows` cuts it at 1,000 first.
The payload also grows linearly: 2,000 pins with thumbnails is a large JSON
document on a phone.

**The fix.** A viewport-scoped query using `locations_geog_gist` and
`ST_MakeEnvelope`, refetching as the map moves, with server-side clustering at
low zoom. Raising `max_rows` is the stopgap.
*Touches:* a new migration, `src/lib/data/supabase-repository.ts`,
`src/components/map/MapExplorer.tsx`.

### Egress, not storage, is what a successful week costs

**What.** One gallery page is 24 `grid` derivatives at roughly 60–120 KB each:
about 1.5–3 MB per page view. Four derivatives together are 0.7–1.5 MB stored;
the original can be 50 MB.

**Why.** The original is kept as the source for re-processing and never served —
which is what makes the asymmetry a feature rather than a problem.

**What could go wrong.** A 5 GB monthly egress allowance is in the region of two
to three thousand gallery page views, not two to three thousand visitors.

**The fix.** R2 (no egress fee) or a CDN in front of whatever storage is in use.
A derivative never changes once written, so it can be cached for a year, and the
Supabase driver already writes that header. See
[`docs/EXTERNAL-SERVICES.md`](EXTERNAL-SERVICES.md).

### One string is implemented twice

**What.** `storagePublicUrl()` in the repository duplicates `publicUrl()` on the
storage driver.

**Why.** It keeps the read path free of an import-time dependency on the upload
side, where `serverEnv()` and the provider credentials live.

**What could go wrong.** They drift. A change to the key layout or to the public
prefix has to be made twice, and the one that is missed fails only at read time,
on a page, with a broken image.

**The fix.** Export a pure `publicUrlFor(provider, prefix, key)` from
`src/lib/storage/types.ts` — no credentials, no driver construction — and have
both call it.
*Touches:* `src/lib/storage/types.ts`, `src/lib/storage/{supabase,r2}.ts`,
`src/lib/data/supabase-repository.ts`.

---

## Accessibility

### A map is not usable by a screen reader at any price

**What.** `MapCanvas` renders a WebGL canvas. No amount of ARIA makes a canvas of
clustered pins navigable.

**Why.** It is a limitation of the medium.

**What could go wrong.** A reader who cannot use the map loses access to the
places behind the photographs.

**The fix.** Already applied, and the pattern to keep: every page that renders a
map also renders the same places as a list, and `MapUnavailable` — the state a
deployment with maps switched off shows — offers the location index, which does
the same job without a map. Any new map surface must do the same.

### `lucide-react` pulls a client boundary into Server Components

**What.** Version 1.58's internal `Icon` module carries `'use client'`, so every
icon rendered from a Server Component becomes a tiny client boundary.

**Why.** It is the library's own build.

**What could go wrong.** Nothing functional — only serialisable props cross the
boundary — but a client-bundle audit will show more boundaries than the code
suggests.

**The fix.** Inline the handful of icons used as plain SVG, if the bundle ever
matters enough.

---

## Engineering process

### There are no tests

**What.** No test files, no test runner, no `test` script. The scripts are `dev`,
`build`, `start`, `lint`, `typecheck`.

**Why.** The project was built as a sequence of features under a fixed contract,
and verification was done by reading and by exercising modules ad hoc.

**What could go wrong.** Everything this document asserts about behaviour is
asserted by a person reading code. The specific places where that is thinnest are
the ones with arithmetic or parsing: `safeNextPath()`, `publishableCoordinates()`,
`trendingScore()` against `trending_score_at()`, `normaliseShutterSpeed()`,
`parseStorageKey()`, `presignR2Request()`, and every zod schema's boundary
values.

**The fix.** A unit runner (`node:test` needs no new dependency) covering the pure
functions above, which are pure precisely so they can be tested; then a handful
of RLS tests run as a real `set role authenticated` session with JWT claims,
because RLS bugs do not show up as the `postgres` role. The `.env`-free demo mode
makes a smoke test of every route cheap.

### CI runs the checks but does not audit dependencies

**What.** `.github/workflows/ci.yml` runs on every pull request and every push to
`main`. One job installs with `npm ci` and runs the lint, typecheck and build; a
second applies all seven migrations to a `postgis/postgis:17-3.5` service
container and runs the 38 assertions in `supabase/tests`, then asserts that
`locations.geog` really is `geography(Point,4326)` so a run can never pass
against the local PostGIS shim and look equivalent.

What is still absent: `npm audit` in the pipeline, Dependabot, and secret
scanning. Nothing stops a vulnerable dependency reaching `main`.

**What could go wrong.** Exactly that, and it already has: `maplibre-gl` 5.24.0
carries GHSA-jrc7-96c5-q579, a critical XSS sanitizer bypass, and nothing in the
repository reports it. Member-submitted location names are rendered into map
popups, so that is a live path rather than a theoretical one.

**The fix.** Add `npm audit --audit-level=high --omit=dev` as a job. Scoped to
production dependencies on purpose: the dev-only advisories npm currently reports
come from `eslint-config-next`, and npm's suggested remedy for them is a
*downgrade* to 14.2.35, which is worse than the current state. Note that adding
the step will fail the build until `maplibre-gl` is upgraded — which is the point
of the step, but means the upgrade has to land first or at the same time. Then
Dependabot for the version bumps and a secret scanner for the keys.

### `console.error` is the whole of the logging story

**What.** Every action logs provider failures through `console.error` with a
`FRAME <area>:` prefix. There is no structured logger, no error reporter and no
alerting.

**Why.** It is honest and dependency-free, and the prefixes make the lines
greppable.

**What could go wrong.** A repeated failure — `check_rate_limit` missing and
every limit falling back, a storage provider refusing writes — is visible only to
whoever reads the host's logs, and nobody is paged.

**The fix.** A reporter behind one module so the call sites do not change, and an
alert on the handful of lines that mean a control has stopped working.

### PostGIS was validated against a stub

**What.** The schema was exercised on PostgreSQL 14 with PostGIS **stubbed**,
because the extension was not available on the machine it was developed on. Four
lines were substituted and therefore never executed as real PostGIS: the
`create extension postgis`, the `geography(Point, 4326)` column, the
`using gist (geog)` index, and the `st_setsrid(st_makepoint(...), 4326)::geography`
expression in the trigger.

**Why.** Everything else — all tables, constraints, indexes, functions,
triggers, policies, grants and the seed — ran for real, twice, plus a 45-case
behaviour suite under real `authenticated` sessions. The PostGIS usage is
standard and the argument order (longitude first) was checked against the stub's
output.

**What could go wrong.** A real PostGIS run differs in some way nobody has seen
yet, on the first deployment rather than in development.

**The fix.** Run `0001`–`0007` plus `seed.sql` against a database with real
PostGIS before the first deployment — `supabase start` provides one — and confirm
`locations.geog` is populated and `locations_geog_gist` is used by a
`ST_DWithin` query plan.

### `supabase/config.toml` pins Postgres 17

**What.** `major_version = 17`.

**What could go wrong.** If the hosted project runs an older Postgres,
`supabase db push` will disagree with its shadow database.

**The fix.** Match the two.

---

## Documentation drift

### Two statements elsewhere in the repository are now out of date

**What.** `README.md` says: "Two documents are referenced from code comments but
do not exist yet: `docs/LIMITATIONS.md` … and `docs/IMAGE-PIPELINE.md`." Both now
exist. And `supabase/README.md` tells you to regenerate the database types to
`src/types/supabase.ts`; the file the live repository imports is
`src/lib/supabase/types.ts`.

**Why.** Both files were written before these documents and before that module
landed.

**What could go wrong.** The second one matters: following the instruction writes
a file nothing imports and leaves the real types stale, so the hand-written
`select` strings in the repository stop being checked against the schema.

**The fix.** Two edits, in files this document does not own:
`README.md`'s documentation table, and the `gen types` path in
`supabase/README.md`.

### `attachVariantsSchema` is unused

**What.** `src/lib/validation/upload.ts` exports `attachVariantsSchema`,
describing a payload of derivative names, keys, dimensions and a blur URL.
`attachVariants()` validates only `{ photographId }`, because the server builds
the derivatives itself and never accepts them from a client.

**Why.** The schema was written for a design in which the browser produced the
derivatives. The server-side design is the better one — it is the only way the
bytes can be verified — and the schema was left behind.

**What could go wrong.** Nothing at runtime. A reader assumes a client-supplied
derivative path exists, and a future author wires one up because the schema
implies it is expected.

**The fix.** Delete it.
*Touches:* `src/lib/validation/upload.ts`.

### There is no licence

**What.** No `LICENSE` file, so no licence is granted by default.

**What could go wrong.** Nobody may legally reuse, deploy or contribute to this
with any certainty.

**The fix.** Choose one and commit it.

---

## Next steps

Ordered by whether they block a first real member account.

### Before launch

| # | Change | Files |
| --- | --- | --- |
| 1 | **Resolve the perceptual-hashing claim** — implement it, or change the copy. A legal page currently describes a control that does not run | `src/app/legal/copyright/page.tsx`, or `src/lib/images/process.ts` + a migration + `src/server/actions/upload.ts` |
| 2 | **Run the migrations against real PostGIS** and confirm `geog` and the GiST index behave | `supabase/migrations/*` |
| 3 | **Restrict the signable upload target to `original`**, so no published derivative can be unverified bytes | `src/app/api/uploads/sign/route.ts`, `src/lib/validation/upload.ts` |
| 4 | **Revoke `select` on the two EXIF GPS columns** from `anon` and `authenticated` | a new migration, `src/lib/data/supabase-repository.ts` |
| 5 | **Add HSTS**, and a report-only CSP | `next.config.mjs`, `middleware.ts` |
| 6 | **Add the origin check to `/api/uploads/sign`** | `src/app/api/uploads/sign/route.ts` |
| 7 | **Fix the two rate-limit details** — the shared appreciation bucket and the pending off-by-one | `src/server/actions/appreciation.ts`, `src/app/api/uploads/sign/route.ts`, `src/server/actions/upload.ts` |
| 8 | **State the demo images' provenance**, and drop `images.unsplash.com` from production `remotePatterns` | `src/lib/data/demo/photographs.ts`, `next.config.mjs`, `README.md` |
| 9 | **Raise the project's `max_rows`** above 2,000, or page `mapPins()` | Supabase project settings |
| 10 | **Fix `capabilities().uploads` for the `r2` case**, so the capability notice is trustworthy | `src/lib/config.ts` |
| 11 | **Choose a licence** | a new `LICENSE` |
| 12 | **Tests for the pure functions, and a handful of RLS tests** under a real `authenticated` session | a new test directory |
| 13 | **`npm audit`, Dependabot and secret scanning in CI** (lint, typecheck, build and the database suite already run) | `.github/workflows/ci.yml` |
| 14 | **Correct the two stale doc statements** | `README.md`, `supabase/README.md` |

### Can wait

| # | Change | Files |
| --- | --- | --- |
| 15 | **Photograph title search** — the most visible missing feature once there is a library | a migration, `src/lib/data/supabase-repository.ts`, `src/lib/discover-query.ts`, `src/app/search/page.tsx` |
| 16 | **A `searchPhotographers()` repository function**, replacing 24 round trips with one | `src/lib/data/*`, `src/app/search/page.tsx` |
| 17 | **SQL views for the sampled aggregates** — gear facets, platform stats, map pins | a migration, `src/lib/data/supabase-repository.ts` |
| 18 | **A `photograph_trending` view**, removing the 300-row pool | a migration, `src/lib/data/supabase-repository.ts` |
| 19 | **`merge_locations()`**, plus `merged_into_id` and a redirect | a migration, `src/server/actions/moderation.ts`, `src/app/locations/[slug]/page.tsx` |
| 20 | **PostGIS duplicate detection** with `ST_DWithin`, replacing the bounded scan and the bounding box | a migration, `src/lib/data/supabase-repository.ts`, `src/server/actions/locations.ts` |
| 21 | **Complete the country boxes**, or replace them with point-in-polygon | `src/lib/geo.ts`, or a geometry migration |
| 22 | **Resolve gear text to the catalogue** on publish, and backfill | `src/server/actions/upload.ts`, a backfill migration |
| 23 | **Viewport-scoped map pins** | a migration, `src/lib/data/supabase-repository.ts`, `src/components/map/MapExplorer.tsx` |
| 24 | **Keyset paging**, if depth ever becomes a latency problem | `src/lib/data/supabase-repository.ts`, `src/components/ui/Pagination.tsx` |
| 25 | **Account deletion with anonymisation**, and the privacy policy to describe it | a new action, a migration, `src/app/legal/privacy/page.tsx` |
| 26 | **MFA for moderators, and sign-out everywhere** | `src/server/actions/auth.ts`, a settings surface |
| 27 | **One shared `publicUrlFor()`**, removing the duplicated URL string | `src/lib/storage/types.ts`, `src/lib/data/supabase-repository.ts` |
| 28 | **Produce or remove the four unused signal kinds** | `src/lib/images/exif.ts`, `src/server/actions/*`, or `src/types/domain.ts` |
| 29 | **Delete `attachVariantsSchema`** | `src/lib/validation/upload.ts` |
| 30 | **Align the RLS comment with the anonymous-report code** | a migration, or `src/server/actions/reports.ts` |
| 31 | **A structured logger and alerting** on the lines that mean a control stopped working | a new module |

---

## See also

| Document | What it answers |
| --- | --- |
| [`docs/SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) | Each control, where it is implemented, and how to verify it |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Why the seams are where they are |
| [`docs/DATABASE.md`](DATABASE.md) | The schema, the constraints and the RLS rules these entries refer to |
| [`docs/IMAGE-PIPELINE.md`](IMAGE-PIPELINE.md) | The upload lifecycle in full |
| [`docs/EXTERNAL-SERVICES.md`](EXTERNAL-SERVICES.md) | Which provider limit bites first, and what the bill is made of |
