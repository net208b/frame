# Image pipeline

The life of an uploaded photograph: how the bytes get to storage, what is
checked when they arrive, what is generated from them, and what is served back.

The photographs are the product, and they are also the largest cost and the
largest privacy surface in it. Every decision below is one of those three
things, and this document says which.

---

## Contents

- [The shape of it](#the-shape-of-it)
- [Why bytes do not pass through the application server](#why-bytes-do-not-pass-through-the-application-server)
- [The signed grant](#the-signed-grant)
- [Server-side verification](#server-side-verification)
- [The four derivatives](#the-four-derivatives)
- [Responsive delivery](#responsive-delivery)
- [The blur placeholder](#the-blur-placeholder)
- [Metadata and EXIF](#metadata-and-exif)
- [Storage key layout](#storage-key-layout)
- [What all of this costs](#what-all-of-this-costs)
- [Adding a variant without reprocessing everything](#adding-a-variant-without-reprocessing-everything)
- [Discarding an upload](#discarding-an-upload)

---

## The shape of it

```
 browser                      FRAME server                  object storage
    │                              │                              │
    │ 1. createDraft(…)            │                              │
    ├─────────────────────────────►│ insert photographs (draft)   │
    │                              │ returns id + storagePrefix   │
    │                              │                              │
    │ 2. POST /api/uploads/sign    │                              │
    ├─────────────────────────────►│ derive key from session      │
    │◄─────────────────────────────┤ signed grant, no secret      │
    │                              │                              │
    │ 3. PUT the original ─────────┼─────────────────────────────►│
    │                              │                              │
    │ 4. attachVariants(id)        │                              │
    ├─────────────────────────────►│ fetch the stored original ◄──┤
    │                              │ verifyImageBytes (sharp)     │
    │                              │ buildVariants → 4 files ────►│
    │                              │ upsert photograph_images     │
    │                              │                              │
    │ 5. publishPhotograph(…)      │                              │
    ├─────────────────────────────►│ rights_confirmed_at, status  │
    │                              │                              │
    │ 6. a reader loads a page     │                              │
    │◄──────────── /_next/image ───┤◄──── grid.webp ──────────────┤
```

Steps 1, 4, 5 are server actions in
[`src/server/actions/upload.ts`](../src/server/actions/upload.ts). Step 2 is the
one route handler in the app,
[`src/app/api/uploads/sign/route.ts`](../src/app/api/uploads/sign/route.ts).
Step 3 is the browser talking to the provider directly. Step 6 is
`next/image`.

A draft row exists from step 1 so that every storage key can be **derived** on
the server from the signed-in account and a photograph it owns. Nothing after
that point takes a key from a client.

---

## Why bytes do not pass through the application server

`UPLOAD_POLICY.maxFileBytes` is 50 MB. Routing that through a Next.js server
costs memory and wall-clock time for no benefit: the server would receive the
whole file, hold it, and write it out again to the same provider the browser
could have reached directly. On a serverless host it is worse — a 50 MB request
body is close to or past the request limits of several platforms, and
[`next.config.mjs`](../next.config.mjs) deliberately caps server-action bodies
at 1 MB precisely because no upload is meant to travel that way:

```js
experimental: {
  // Keeps server-action payloads small; uploads go straight to object storage
  // with a signed URL instead of passing through the Next.js server.
  serverActions: { bodySizeLimit: '1mb' },
}
```

So the server issues a credential instead of carrying data. That moves the
security question from "did we stream this safely" to "what exactly does this
grant allow", which is a question with a checkable answer.

---

## The signed grant

`POST /api/uploads/sign` is a route handler rather than a server action because
the browser needs the grant as data in order to make its own request. It follows
the same order as every write path in the app — capability, identity,
authorisation, rate limit, validation, write — and returns the same codes inside
a JSON body with matching HTTP statuses.

```
503 not_configured   demo mode: no storage, no session, nothing honest to sign
401 unauthenticated  no viewer
403 forbidden        the account is suspended
429 rate_limited     6/hour or 20/day per account, with a retry-after header
422 validation       the body failed signUploadSchema, or byteSize is over policy
404 not_found        the photograph is not in this account (same answer as "does not exist")
409 conflict         already published or removed; or too many uploads pending
201 created          the grant
```

**What the grant is scoped to.** Four things, and the first is the one that
matters:

1. **The key is derived here, never sent.**
   ```ts
   const key = storageKeys(photograph.id, viewer.id)[grantRequest.target];
   ```
   The owner segment is the session's account id and the photograph segment is a
   row that account owns — checked with `.eq('owner_id', viewer.id)` *and*
   re-asserted on the returned row. A client cannot choose where its bytes land
   and cannot write over another member's object.
2. **One media type.** `assertSignableUpload()` in
   [`src/lib/storage/types.ts`](../src/lib/storage/types.ts) refuses a leaf and
   content-type that disagree: `original` may be any of the four accepted upload
   types, and a derivative leaf such as `grid.webp` may only be signed as
   `image/webp`.
3. **The size the client declared**, not the policy ceiling, so a grant is only
   ever as large as the file it was asked for — and never larger than
   `UPLOAD_POLICY.maxFileBytes`.
4. **A short life, and no caching.** The response carries
   `cache-control: no-store, no-cache, must-revalidate`, because a grant is a
   credential for one object.

**The response carries a signature and never a secret.** Both drivers return
`{ url, method, headers, fields?, expiresInSeconds }`, and the provider
credentials stay in `serverEnv()`, which throws if it is evaluated in a browser
bundle.

### What a presigned upload cannot promise

Stated plainly here because the UI must not imply more:

| | Supabase Storage | Cloudflare R2 |
| --- | --- | --- |
| Lifetime | **Fixed at two hours** by the Storage API; the driver reports the real 7200s rather than a shorter figure it cannot enforce | 600s (`SIGNED_UPLOAD_TTL_SECONDS`) |
| Content type | Pinned as a request header only | **Pinned as a signed header** — a different type fails the signature |
| Maximum size | Not expressible on a grant. Set `file_size_limit` on the bucket | Not expressible. SigV4 can sign an exact `content-length` but has no way to express a range, and R2 does not support the POST-policy form that carries `content-length-range` |

The honest consequence: **the grant is not the size control.** The controls that
actually hold are the bucket's own limits, the short expiry, and
`verifyImageBytes()` reading the bytes that arrived. The
[bucket policies in `supabase/README.md`](../supabase/README.md#creating-the-storage-bucket)
set `file_size_limit` to 52428800 — the same 50 MiB — and restrict a member to
writing inside their own `auth.uid()` prefix, which is a second, independent
statement of the rule the route derives.

The R2 driver signs SigV4 by hand with `node:crypto`
([`src/lib/storage/r2.ts`](../src/lib/storage/r2.ts)) rather than adding the AWS
SDK for four HMACs. `presignR2Request()` is exported so the procedure can be
exercised against AWS's own published test vector instead of only against a
live bucket.

---

## Server-side verification

Everything the browser said about the file is a claim. The declared type and
size let the wizard fail fast and explain the limits; they prove nothing. So
`attachVariants()` reads the stored object back and decodes it before anything
is generated or published.

**Reading it back.** The driver interface exposes signing, a public URL and
deletion, so reading an object means fetching its URL. A freshly written object
can take a moment to become readable through a CDN, hence three attempts with a
500 ms wait and a cache-busting query parameter so a negative cache entry is not
served straight back. The size is refused from `content-length` before the body
is read where the provider states it, and again from the actual byte length.

**Decoding it.** [`verifyImageBytes()`](../src/lib/images/process.ts) is the
gate, and it answers with a reason rather than throwing, because every one of
these outcomes is something a member can act on and the wizard shows the
sentence verbatim:

| Check | Why |
| --- | --- |
| Not empty, not over `maxFileBytes` | Cheapest refusals first |
| `sharp(...).metadata()` succeeds | A file that cannot be decoded cannot be published |
| **Media type from the decode**, never the declared type | A `.jpg` named file declaring `image/jpeg` can hold anything. AVIF is reported by libvips as HEIF compressed with AV1, so that pair is what identifies it — and HEIC, the same container with a different codec, stays unaccepted |
| `pages <= 1` | FRAME publishes single photographs, not animations |
| Dimensions from `metadata.autoOrient` | The size a viewer sees. A portrait phone photograph is 3024×4032 on screen and 4032×3024 in the file; reporting the stored pair would tell a member their portrait photograph is landscape |
| At least 800×800 (`minPixelWidth`/`minPixelHeight`) | Below that there is nothing to look at on a detail page |

Two sharp settings are shared by verification and processing, so that what is
accepted is what can be read: `limitInputPixels: 120_000_000` (well above a
100 MP medium-format file, far below what a crafted file can claim — without it
a 40 KB upload can ask for tens of gigabytes of memory) and `failOn: 'error'`,
which tolerates a warning. A JPEG with trailing rubbish from a card reader
decodes to exactly the right image, and refusing it would be the worse answer.

The media type that reaches the database is the one sharp read:
`photograph_images.content_type` has a check constraint listing the four
acceptable values, and the row is written from `buildVariants()`'s own output.

---

## The four derivatives

`IMAGE_VARIANTS` in [`src/lib/images/variants.ts`](../src/lib/images/variants.ts)
is the whole set, and it is a `Record` keyed by the full `ImageVariantName`
union, so the type system requires every variant to be declared:

| Variant | Width | Quality | Format | Purpose |
| --- | --- | --- | --- | --- |
| `thumb` | 320 | 80 | WebP | Moderation rows, dense lists |
| `grid` | 800 | 84 | WebP | Gallery and masonry cards |
| `display` | 1800 | 90 | WebP | Photograph detail page, mid-size |
| `full` | 2560 | 92 | WebP | Photograph detail page, large screens |
| avatar | up to 1024 (square) | 90 | WebP | A member's profile picture — one file, not a set |

The avatar's size is a **ceiling, not a target**: `buildAvatar` passes
`withoutEnlargement`, so a picture whose short side is under 1024 is stored at
the size it really is. Enlarging would produce the right dimensions and no more
detail, and the Settings form says which of the two happened. It is also
deliberately larger than any layout asks for — the masthead draws 128 CSS pixels
— because it is the file a member sees when they pinch into their own picture,
and because `next/image` does not re-fetch at a higher resolution when a page is
zoomed.

These numbers were raised from 72–84 in October 2026, and `full` was wired up at
the same time. Three things were wrong at once, and all three showed as "the
pictures look soft":

1. **`full` was generated on every upload and served to nobody.** `buildImage()`
   preferred `display`, so the largest derivative in the bucket never reached a
   page. It is now first in that chain; `sizes` is what keeps a phone from
   downloading it.
2. **`next/image` re-encoded every derivative at its default quality of 75.**
   A file built at 92 and served at 75 is a file built at 75. The photograph and
   the avatar now pass an explicit `quality`, which `images.qualities` in
   `next.config.mjs` has to allow.
3. **Every avatar on the site declared `sizes="48px"`** while the profile
   masthead drew it at 128, so the browser fetched a 48-pixel file and scaled it
   up. `Avatar` now declares the size it is actually rendering.

What is deliberately *not* done is serving the original. It is kept untouched
and unserved: a 20–50 MB file per frame is a gallery nobody on a phone can open,
and an egress bill that grows with every view. The quality claim this project
makes is that the largest *derivative* is genuinely large and genuinely high
quality — and that the original is still there if a photograph ever has to be
rebuilt.

**The rule: a gallery request must never download an original.** An original
routinely runs 8–40 MB from a full-frame body. A 24-card gallery of originals is
twenty minutes of a phone's data allowance and an egress bill nobody budgeted
for. The original is kept only as the source for re-processing, and nothing in
the UI links to it.

That rule is enforced on the read side as well as the write side.
`buildImage()` in
[`supabase-repository.ts`](../src/lib/data/supabase-repository.ts) assembles
`thumbUrl`, `gridUrl` and `displayUrl` from the stored derivative rows with a
fallback chain — `display` → `full` → `grid` → `thumb` — and returns `null`
rather than falling back to the original if none of them exists. A photograph
mid-reprocessing degrades to a smaller derivative; it never degrades to the
50 MB file.

How `buildVariants()` behaves, and why:

- **Never upscales.** The target width is `min(variant.width, sourceWidth)` with
  `fit: 'inside', withoutEnlargement: true`, so a small original stays honest
  about its size instead of being stretched into a soft imitation of a large
  one.
- **Applies the EXIF rotation and drops the tag** (`.rotate()`), so the
  derivative is upright for every viewer rather than only the ones that read
  EXIF.
- **Converts to sRGB** with `withIccProfile('srgb')`, so a wide-gamut original
  is converted rather than left to be misread as sRGB. A colour profile
  describes pixels; it identifies no person, place or device.
- **Encodes one at a time.** Four simultaneous decodes of a 50 MB original is a
  lot of memory for a serverless function, and the wall-clock saving is small.

Each derivative is written with its own grant — signed for that one key and that
one content type — and then one `upsert` on `(photograph_id, variant)` records
all four. Re-processing replaces a row rather than accumulating duplicates the
UI would have to choose between.

If anything fails, the draft is returned to `status = 'draft'` rather than
stranded in `processing`, and the action returns a sentence saying nothing was
published.

### Publication requires the servable sizes

`publishPhotograph()` reads `photograph_images` and refuses with `conflict` if
`grid` or `display` is missing, naming which. Without them a card has nothing to
render but the original — the one file a reader must never be sent. The database
agrees from the other direction: `photographs_publishable` requires
`image_width` and `image_height`, which only `attachVariants()` writes.

---

## Responsive delivery

Two layers, and keeping them straight is what stops a per-image cost becoming a
per-*view* cost.

**Layer one: the derivative.** Chosen by role in the component —
`photo.image.gridUrl` on a card, `displayUrl` on a detail page, `thumbUrl` in a
moderation row.

**Layer two: `next/image`.** The browser requests `/_next/image`, which resizes
that derivative to the width the layout actually asked for. The `sizes` value is
what tells it which width to ask for, so `IMAGE_SIZES` describes the real
layouts rather than a guess:

| `IMAGE_SIZES` key | Value | The layout it describes |
| --- | --- | --- |
| `galleryCard` | `(max-width: 420px) 92vw, (max-width: 820px) 46vw, (max-width: 1100px) 31vw, 23vw` | The `masonry-columns` grid: 1-up phone, 2-up tablet, 3-up, 4-up desktop |
| `detail` | `(max-width: 900px) 100vw, 62vw` | The photograph page, whose image column is ~62% of the container |
| `hero` | `(max-width: 650px) 100vw, (max-width: 950px) 44vw, 40vw` | The home page's right-hand column |
| `strip` | `(max-width: 650px) 60vw, 22vw` | Related rows and editorial strips |
| `avatar` | `48px` | A fixed-size avatar |

Without a correct `sizes`, a browser assumes `100vw` and downloads the widest
candidate for a card that is a quarter of the viewport. That single attribute is
the difference between a 1.5 MB gallery page and a 6 MB one.

`next.config.mjs` bounds the rest:

- `deviceSizes` and `imageSizes` are explicit lists, so the set of possible
  output widths is finite and small.
- `formats: ['image/avif', 'image/webp']` — two formats doubles the distinct
  transformation count in exchange for meaningfully smaller files.
- `minimumCacheTTL` of 30 days means a popular photograph is transformed once a
  month per width, not once per view.
- `remotePatterns` is built at config time from `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_IMAGE_HOST`, plus `images.unsplash.com` for the bundled demo
  content. A host that is not listed produces a 400 from the image endpoint
  rather than a proxy for arbitrary URLs.

Every `next/image` in the app supplies either real `width`/`height` or `fill`
with a sized parent. `PhotoCard` uses `fill` inside a box whose
`aspect-ratio` comes from `aspectRatio(photo.image)` — the frame's true ratio,
clamped to 0.45–3 so one absurd panorama cannot destroy the grid rhythm — which
is what makes the first paint the final layout with no reflow when the image
lands.

---

## The blur placeholder

`blurPlaceholder()` produces a 16 px WebP at quality 40 with `effort: 0`, as a
base64 `data:` URL, stored once in `photographs.blur_data_url` and passed to
`next/image` as `blurDataURL` with `placeholder="blur"`.

It is **cosmetic**, and the code says so in both directions: `attachVariants()`
wraps the call in a `try` and carries on with `null` on failure, because a
missing placeholder is not worth failing an upload over, and `PhotoCard` sets
`placeholder={photo.image.blurDataUrl ? 'blur' : 'empty'}` so a photograph
without one simply has none.

---

## Metadata and EXIF

### Derivatives carry no metadata

Every derivative is written with no EXIF, no XMP, no IPTC and no GPS. There is
no `keepMetadata`, `keepExif` or `keepIccProfile` call anywhere in
`src/lib/images/process.ts`: sharp drops every tag by default, and **that
default is the privacy guarantee**.

This is a privacy requirement, not a byte saving. An original routinely carries
the coordinates of where the photographer was standing, their name, their
camera's serial number and the software on their machine. Publishing a file is
not consent to publish any of that. The one thing a derivative does carry is the
sRGB profile, which describes the pixels.

### EXIF is read to fill in a form

[`readExif()`](../src/lib/images/exif.ts) runs in the browser, on the chosen
file, **before anything is uploaded**. That ordering is deliberate: a member can
see what the file contains, and decline to publish the location, before any of
it leaves their machine. It picks sixteen tags so a 40 MB file is barely
touched, and it never throws — a file with no EXIF, a truncated block and a
corrupt one all return the same readout full of nulls, because a member whose
camera writes nothing useful should see an empty form rather than an error.

What it normalises, and why each one matters to the form it prefills:
`NIKON CORPORATION` becomes `NIKON`; a model that repeats its brand becomes
`Z f` rather than `NIKON CORPORATION NIKON Z f`; `1.7999999523162842` becomes
`1.8`; an exposure becomes `1/250` or `4s` through the same
`formatShutterSeconds()` the upload schema enforces; a date outside 1826–tomorrow
is dropped; and dimensions are swapped for an orientation of 5–8, so a portrait
photograph is not reported as landscape.

**EXIF is never proof of ownership.** It is written by whatever software touched
the file last and can be edited in seconds, and a photograph with a complete
EXIF block is no more likely to belong to the uploader than one with none. So
nothing in the readout grants a permission. What the readout *does* get used for
is a review signal and a record of a claim: `publishPhotograph()` stores it as
`photograph_metadata.exif_source` so a moderator reviewing a disputed ownership
claim can see what the file said, and derives signals such as `exif-missing`
(explicitly labelled as proving nothing either way) and `exif-conflict`.

### GPS is never published without an explicit choice

Four separate gates, in order:

1. **The question is asked.** `describeExifGpsPolicy()` returns the paragraph
   shown beside it — written out as one piece rather than assembled from
   fragments, because a member deciding whether to publish where they were
   standing deserves the whole policy in plain words.
2. **Silence is a no.** `publishInputSchema` reads `shareExifGps` as
   `value === true`. Anything else — absent, null, `"false"` — resolves to not
   sharing. An unanswered question must never resolve to publishing where
   somebody was.
3. **Consent stores, it does not publish.** With consent, the point is written
   to `photograph_metadata.exif_gps_latitude`/`_longitude` with
   `exif_gps_consent = true`. Without it, those columns stay null and
   `exif_source.positionWithheld` records that the file *held* a position which
   was deliberately not kept. A place reaches the map only when a moderator
   approves a `location_submissions` row.
4. **What is published is rounded.** Every published coordinate leaves through
   [`publishableCoordinates()`](../src/lib/geo.ts): four decimals (~11 m)
   normally, two (~1.1 km) for a place a moderator marked sensitive, and none
   at all for one marked withheld. Precision is never widened on read, and
   `placeJsonLd()` emits `location.coordinates` verbatim for exactly that
   reason.

The capture date gets the same treatment one notch down: `publish_captured_at`
defaults to false, and `exifSourceRecord()` drops `capturedAt` from the stored
readout unless the member chose to publish it, because a published metadata row
is readable by anyone and a capture time can place a person somewhere on a
particular evening.

One consequence of the RLS model is worth knowing: `photograph_metadata` is
readable by anyone for a *published* photograph, and the GPS columns live on
that table. The repository's `METADATA_FIELDS` constant deliberately does not
include them, and the one query that does select them is scoped to
`status = 'under_review'`, which only the owner and moderators can read. A
column-level revoke would make that structural rather than careful; it is noted
in [`docs/LIMITATIONS.md`](LIMITATIONS.md).

---

## Storage key layout

```
<owner_id>/<photograph_id>/original      ← the upload, never served
<owner_id>/<photograph_id>/thumb.webp
<owner_id>/<photograph_id>/grid.webp
<owner_id>/<photograph_id>/display.webp
<owner_id>/<photograph_id>/full.webp
```

Built by `storageKeys(photographId, ownerId)` and by nothing else. Three
properties fall out of that shape:

- **Every key is derivable from the session.** The owner segment is the account,
  so the sign route never has to accept one.
- **The bucket policy can be one line.** `(storage.foldername(name))[1] =
  auth.uid()::text` is the whole rule for "a member writes only inside their own
  prefix".
- **Re-processing is cheap.** The original sits beside its derivatives under the
  same prefix, so regenerating them needs no index and no search.

`parseStorageKey()` is the only way in. It requires exactly three segments,
matches the first two against `^[A-Za-z0-9_-]{1,64}$`, and checks the leaf
against a set derived from `IMAGE_VARIANTS` — so adding a variant there makes it
signable here, and a stray `..` or a fourth segment is refused. Keys arrive from
request bodies, so a key that has not been through that function never reaches a
provider; `remove()` checks it too, which is what stops a delete request naming
an object this app did not write.

---

## What all of this costs

The arithmetic, because guessing it is how a successful week becomes an invoice.
[`docs/EXTERNAL-SERVICES.md`](EXTERNAL-SERVICES.md) carries the provider
comparison; this is the part that comes from the pipeline itself.

**What you store is dominated by the original.** Four derivatives together are
roughly 0.7–1.5 MB. The original can be up to 50 MB. So a 1 GB storage
allowance is in the region of fifty to a hundred uploads, almost all of it
originals.

**What you serve is dominated by `grid`.** One gallery page is
`PAGE_SIZE.gallery = 24` cards at 800 px WebP quality 76, which for a street
photograph is roughly 60–120 KB each: **about 1.5–3 MB of egress per gallery
page view.**

That asymmetry is the single most important operational fact about FRAME, and it
is why the original is kept but never linked. Keeping it costs storage, which is
cheap and predictable. Serving it would cost egress, which is neither.

The levers already in the code, in the order they matter:

1. **Only derivatives are served.** A 50 MB file is never a page's payload.
2. **`sizes` matches the layout**, so a browser downloads one correctly-sized
   candidate rather than the widest.
3. **Quality rises with size** — 72 at 320 px, 84 at 2560 px — because
   compression artefacts are visible in proportion to how large the image is
   drawn.
4. **A derivative never changes once written**, so it can be cached hard. The
   Supabase driver writes `cache-control: max-age=31536000`, and a CDN in front
   of the bucket is safe to cache aggressively.
5. **`minimumCacheTTL` of 30 days** bounds `/_next/image` work to once a month
   per `(source, width, format)`.

If the site gets real traffic, the answer is R2 (no egress fee) or a CDN in
front of whatever storage is in use — not a change to this pipeline.

---

## Adding a variant without reprocessing everything

The derivative set is data, not code paths, which is what makes this cheap.

1. **Add the entry** to `IMAGE_VARIANTS` in `src/lib/images/variants.ts`, with
   its width, quality, format and purpose.
2. That one edit propagates by construction:
   - `storageKeys()` grows a key, because it is built from the record.
   - `parseStorageKey()` accepts the new leaf, because `LEAF_NAMES` is derived
     from `IMAGE_VARIANTS`.
   - `signUploadSchema` accepts it, because `variantNames` and
     `variantContentTypes` are derived from the same record.
   - `buildVariants()` produces it, because it iterates `Object.entries()`.
3. **Add the name to the `ImageVariantName` union** in
   [`src/types/domain.ts`](../src/types/domain.ts) and to the
   `photograph_images_variant_allowed` check constraint in a **new migration**.
   The record is keyed by the union, so the compiler will tell you if you forget
   the first; the database will tell you if you forget the second.
4. **Use it somewhere**, with a matching `IMAGE_SIZES` entry if the layout it
   serves is new.

**Nothing needs reprocessing to deploy that.** Existing photographs simply have
no row for the new variant, and `buildImage()` already falls back through the
chain it knows. Backfilling is then an ordinary batch job that, for each
photograph, fetches `original`, runs `buildVariants()` and upserts the rows —
which is exactly what `attachVariants()` already does, and the reason the
original is retained at all. Two cautions for whoever writes it: the upsert is
on `(photograph_id, variant)`, so re-running is safe; and the batch must not
touch `photographs.image_width`/`image_height` unless the *display* variant
changed, because the grid reserves its box from those two numbers.

Removing a variant is the reverse and needs one extra step: the objects are
orphaned, because `remove()` only accepts keys this app writes and nothing will
be asking for the old leaf. Delete them in the same batch that drops the rows.

---

## Discarding an upload

`discardDraft()` refuses a published photograph outright — taking published work
down is a separate request, so that an appreciation count and a place entry are
not deleted by accident — and otherwise deletes in a deliberate order:

1. **Objects first**, all five keys. A deleted row leaves nothing pointing at
   them, and the orphan would be the original: the one file with the full
   metadata block still in it.
2. **Then the row.** If the object delete fails, the draft is kept and the member
   is told, rather than leaving files behind with nothing pointing at them.

The `photographs` row cascades to `photograph_images` and
`photograph_metadata`, so there is nothing else to clean up in the database.

---

## See also

| Document | What it answers |
| --- | --- |
| [`docs/EXTERNAL-SERVICES.md`](EXTERNAL-SERVICES.md) | Provider comparison, free tiers, which limit bites first |
| [`docs/SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) | The upload controls as verifiable checklist items |
| [`docs/DATABASE.md`](DATABASE.md) | `photographs`, `photograph_images`, `photograph_metadata` and their constraints |
| [`docs/LIMITATIONS.md`](LIMITATIONS.md) | What this pipeline does not do, including perceptual hashing |
| [`supabase/README.md`](../supabase/README.md) | Creating the bucket and its policies |
