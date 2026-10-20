# Database

The data model, the constraints that carry product meaning, the row-level
security rules, and how to extend the schema. Written from
[`supabase/migrations/`](../supabase/migrations/) as it stands: every claim
below names the file that makes it true.

Read [`supabase/README.md`](../supabase/README.md) first if you want to *run*
the migrations. Read this one to understand what they build and why.

---

## Contents

- [Shape of the schema](#shape-of-the-schema)
- [Table reference](#table-reference)
- [Relationships](#relationships)
- [Constraints that carry product meaning](#constraints-that-carry-product-meaning)
- [Row-level security](#row-level-security)
- [Functions and triggers](#functions-and-triggers)
- [Indexing and pagination](#indexing-and-pagination)
- [Running and extending the migrations](#running-and-extending-the-migrations)

---

## Shape of the schema

Seventeen tables in `public`, built by seven numbered migrations that must run
in order and are each safe to re-run:

| File | What it creates |
| --- | --- |
| [`0001_extensions_and_enums.sql`](../supabase/migrations/0001_extensions_and_enums.sql) | Five extensions, and the written-out vocabularies |
| [`0002_core_tables.sql`](../supabase/migrations/0002_core_tables.sql) | `profiles`, the four gear lookups, `locations`, `location_restrictions`, `location_submissions` |
| [`0003_photographs.sql`](../supabase/migrations/0003_photographs.sql) | `photographs`, `photograph_images`, `photograph_metadata`, `photograph_appreciations` |
| [`0004_collections_and_reports.sql`](../supabase/migrations/0004_collections_and_reports.sql) | `collections`, `collection_items`, `reports`, `moderation_actions`, `rate_limit_hits` |
| [`0005_indexes.sql`](../supabase/migrations/0005_indexes.sql) | 34 indexes, each annotated with the query it serves |
| [`0006_functions_and_triggers.sql`](../supabase/migrations/0006_functions_and_triggers.sql) | 23 functions, 19 triggers |
| [`0007_row_level_security.sql`](../supabase/migrations/0007_row_level_security.sql) | RLS on all seventeen tables, 48 policies, and the grants underneath them |

Then [`seed.sql`](../supabase/seed.sql), which inserts reference data only.

**Extensions:** `pgcrypto` (uuid keys), `citext` (usernames), `postgis`
(`locations.geog` and radius queries), `pg_trgm` (the `ILIKE '%term%'` place
search), `unaccent` (so `frame_slugify()` produces `cafe-de-flore` and matches
the TypeScript `slugify()`). They install into an `extensions` schema, and each
file that needs one sets `search_path = public, extensions`.

**There are no enum types.** Every closed vocabulary is `text` with an inline
`CHECK`, for the reasons written out at the foot of `0001`: the vocabularies
already exist once in [`src/types/domain.ts`](../src/types/domain.ts), a check
constraint reads side by side with that file, and a taxonomy that will change
should not be in a type that is close to impossible to alter in place.
PostgREST exposes both as strings, so the client sees no difference.

**There is no `+ 1` anywhere in this schema.** The three denormalised counters
— `locations.photograph_count`, `collections.item_count`,
`photographs.appreciation_count` — are each recomputed with `count(*)` over the
rows they summarise. An increment is correct only if every past increment was
correct; a recount is correct on its own.

---

## Table reference

### `profiles`

One row per account, created by the `handle_new_user()` trigger on
`auth.users`, never by the application. `id` **is** the `auth.users` id, so
there is no second identity to keep in step.

| Column | Worth knowing |
| --- | --- |
| `username` | `citext`, unique. The format check is applied to `username::text` on purpose: citext overloads the regex operators to be case-insensitive, so the unqualified form would accept `Kenji`. Casting restores case sensitivity and makes "lowercase only" mean it. |
| `role` | `member` / `moderator` / `admin`. Never written by the application. `handle_new_user()` always inserts `member`, and `profiles_guard_privileged_columns()` refuses a change unless an admin is changing *somebody else's*. |
| `is_suspended`, `suspended_reason` | Moderator-only, and bound together by a constraint (below). |
| `based_in` | Free text the member typed. Never inferred from an IP address or a locale header — a guessed location presented as a fact is a privacy problem. |
| `member_since` | A `date`, not a timestamp, because the profile page shows month precision. The exact signup moment is never published. |
| `usual_gear` | `text[]`, the member's own words. Unrelated to the gear lookup tables. |
| `country_code` | `char(2)`, ISO 3166-1 alpha-2, chosen by the member from a list beside the free-text `based_in` line. Never inferred from a request, for the same reason `based_in` is not. |
| `style_tags` | `text[]` from a closed vocabulary (`PHOTOGRAPHY_STYLES`), up to five with no repeats. How the member shoots, which is a different axis from a photograph's category. |
| `collaboration_status` | `open` / `selective` / `closed`, or null. Null means they have not said, which is not the same as "no", so the profile shows nothing for it. |
| `critique_preference` | `any` / `technical` / `none`, or null. A sentence addressed to other members: FRAME has no comments, so nothing in the application enforces it, and the Settings form says so. |
| `social_links` | `text[]`, up to four, each `http(s)` only and at most 200 characters — each one becomes an `href` on a public page. |
| `cover_photograph_id` | One of the member's **own published** photographs, shown across the top of their profile — not an uploaded banner, so there is no second image pipeline. `profiles_cover_must_be_own_published` refuses anything else (a CHECK cannot query another table); `on delete set null` clears it with the photograph; and the repository joins on `status = 'published'` as well, so a frame taken down for a day hides the band without forgetting the choice. |

### `camera_brands`, `camera_models`, `lens_brands`, `lens_models`

Curated reference data behind the Discover gear facets, so that `Fujifilm`,
`FUJIFILM` and `Fuji` do not become three facets. Model slugs are globally
unique and therefore brand-prefixed in the seed (`sony-a7-iv`), because two
manufacturers do ship a model with the same bare name. Lens brands are a
separate table from camera brands because a manufacturer's lens brand is
frequently not its camera brand — Nikon sells Nikkor, Fujifilm sells Fujinon.

A member whose gear is not listed loses nothing: `photograph_metadata` keeps
free-text `*_text` columns with exactly what they typed. That is also why
members have no write access to these tables.

### `locations`

A place a photograph was made. **Members do not insert here**; they write to
`location_submissions` and a moderator decides.

| Column | Worth knowing |
| --- | --- |
| `country_code` | `char(2)`, upper case. `char_length()` ignores trailing blanks on `char(2)`, so a one-character value fails the length check rather than being silently padded past it. |
| `geog` | `geography(Point, 4326)`, derived from `latitude`/`longitude` by the `locations_set_geog` trigger, so it cannot disagree with the numbers the UI shows. It exists for the GiST radius queries behind nearby places and the map. |
| `categories` | Derived by `recount_location_photographs()` from the **published** photographs at the place. It is what the place has actually produced, not a list somebody typed when proposing it. Empty is the correct value for a place with no published work. |
| `is_sensitive` | Moderator flag. Coarsens the published coordinate to roughly a kilometre. |
| `withhold_coordinates` | Moderator flag. No coordinate is published at all. |
| `photograph_count` | Recounted by the same trigger as `categories`. |
| `submitted_by`, `approved_by` | `on delete set null`. Deleting an account must not delete the places the community relies on; the credit disappears, the place stays. |

Both privacy flags are read in exactly one place:
[`publishableCoordinates()`](../src/lib/geo.ts). Precision is never widened on
the way out.

### `location_restrictions`

Access and photography restrictions attached to a place — permit, private
property, no tripod, hours, fee, other. `source` is `NOT NULL` and non-blank;
see [the constraints section](#constraints-that-carry-product-meaning).

### `location_submissions`

A member's proposal. The only way a member adds a place, and it always ends
with a human decision.

`signals` is a `jsonb` array of `SubmissionSignal` from
[`evaluateLocationSubmission()`](../src/lib/geo.ts) — automated checks recorded
for a person to read. There is deliberately no path in `0006` from a clean set
of signals to an approved location.

### `photographs`

The unit of publication. A row exists from the moment an upload starts
(`status = 'draft'`), so the storage keys can be derived from its id, and
becomes public only when a human has confirmed the rights.

| Column | Worth knowing |
| --- | --- |
| `slug` | The public identifier; every photograph page is `/photographs/[slug]`. Written at draft time, so storage, the audit trail and the URL agree from the start. |
| `alt_text` | `NOT NULL`, 10–280 characters, **from the first insert**. Not generated and not optional: the grid is almost nothing but images. |
| `category` | Nullable while a draft is filled in, required to publish. |
| `status` | `draft` / `processing` / `published` / `under_review` / `removed`. |
| `editors_pick` | An editorial surface, always labelled, never a silent boost inside another ordering. Moderator-only, enforced by a trigger. |
| `appreciation_count` | Recomputed, never incremented, by two independent writers. |
| `publish_captured_at` | A capture time can place a person somewhere on a particular evening, so the date is published only on an explicit choice. |
| `rights_confirmed_at` | The moment the uploader confirmed the work is theirs. A precondition of publication, in the database. |
| `storage_prefix` | `<owner_id>/<photograph_id>`, matching `storageKeys()` in [`src/lib/images/variants.ts`](../src/lib/images/variants.ts). |
| `image_width`, `image_height`, `blur_data_url` | The display derivative's intrinsic size and its placeholder, so the grid reserves the right box before the image lands. |
| `removed_reason` | Required when `status = 'removed'`. |

`owner_id` cascades on delete: a photograph with no owner has nobody who can
answer a copyright claim about it. `location_id` is `set null`: if a place
disappears, the photograph survives without one.

### `photograph_images`

One row per generated derivative — `thumb`, `grid`, `display`, `full` — with
its storage key, pixel size, byte size and content type. `content_type` is
recorded from the real magic bytes read by `sharp`, never from what the browser
declared. `UNIQUE (photograph_id, variant)` means re-processing replaces a row
rather than accumulating duplicates the UI would then have to choose between.

### `photograph_metadata`

How the frame was made, keyed one-to-one on `photograph_id`. Every field is
optional; a photograph with no recorded settings is still a photograph.

Two groups of columns deserve attention:

- `camera_brand_id` … `lens_model_id` are the normalised gear used by the
  facets; `camera_brand_text` … `lens_model_text` are exactly what the member
  typed, kept even when they matched a lookup row.
- `exif_source` (jsonb), `exif_gps_latitude`, `exif_gps_longitude` and
  `exif_gps_consent`. These exist so a member can be *asked* whether this was
  the place, and so a moderator can compare a disputed location against what
  the camera recorded. The comment in `0003` states the rule plainly: they are
  never published, never used to create or move a location, and never copied
  onto a public record without consent **and** a moderator approving the
  resulting location submission.

### `photograph_appreciations`

`(photograph_id, profile_id)` with a unique constraint and nothing else of
substance. See [the constraints section](#constraints-that-carry-product-meaning)
— this is the one that actually protects the ranking.

### `collections`, `collection_items`

A member's own grouping of photographs and places: a shot list, a route, a set
of references. `visibility` defaults to `private`, because a collection is a
working document before it is a publication and the default must not be the one
that leaks. `cover_photograph_id` is `set null` — the cover disappears if that
photograph does, the collection does not.

An item points at exactly one subject; see the constraints below.

### `reports`

What was reported, why, and a readable copy of its name.

`subject_id` is deliberately **not** a foreign key: the subject lives in one of
four tables, and a report has to survive the thing it is about being removed —
which is frequently the outcome of the report itself. `subject_label` carries a
human-readable copy for exactly that case, so a queue never shows a bare uuid.

`reported_by` is `set null`, which covers both a closed account and a report
filed without one.

### `moderation_actions`

The audit trail: decision, subject, reason, moderator, timestamp. Append-only —
no role is granted `update` or `delete`. `moderator_id` is
`on delete restrict`, because an audit row with no author is not an audit row.
The consequence is deliberate and worth knowing: **an account with moderation
history cannot be deleted**, so a departing moderator is demoted to `member`
instead, and any delete-account path has to handle that foreign-key error.

### `rate_limit_hits`

One row per accepted attempt inside a named bucket. A `bigint` identity key
rather than a uuid, because this is the highest-churn table in the schema and
nothing reads a row by id. No role has any privilege on it; the only way in is
`check_rate_limit()`, which is `SECURITY DEFINER`. A client that could delete
its own hits could reset its own rate limit.

---

## Relationships

```
auth.users ─1:1─ profiles
                   │
                   ├─1:N─ photographs ─1:N─ photograph_images      (one row per variant)
                   │          │         ─1:1─ photograph_metadata
                   │          │         ─1:N─ photograph_appreciations ─N:1─ profiles
                   │          └─N:1─ locations                     (set null)
                   │
                   ├─1:N─ collections ─1:N─ collection_items ──┬─ photographs  (cascade)
                   │                                           └─ locations    (cascade)
                   ├─1:N─ location_submissions ─0:1─ locations   (approved_location_id)
                   ├─1:N─ reports            (reported_by, set null)
                   └─1:N─ moderation_actions (moderator_id, restrict)

locations ─1:N─ location_restrictions                            (cascade)
photograph_metadata ─N:1─ camera_brands / camera_models / lens_brands / lens_models  (set null)
```

Delete behaviour is a product decision rather than a default, and it splits
three ways:

- **cascade** where the child is meaningless without the parent: a member's
  photographs, a photograph's derivatives and metadata, a place's restrictions,
  a collection's items.
- **set null** where the child outlives the parent: a place keeps existing when
  its submitter leaves; a photograph keeps existing when its place is removed;
  a report keeps existing when its reporter's account goes.
- **restrict** in exactly one place: `moderation_actions.moderator_id`.

---

## Constraints that carry product meaning

Most constraints in this schema are type safety. These five are product
promises, written where they cannot be forgotten.

### One appreciation per member, per photograph

```sql
constraint photograph_appreciations_one_per_member unique (photograph_id, profile_id)
```
[`0003_photographs.sql`](../supabase/migrations/0003_photographs.sql)

This is the only thing standing between the ranking and a replayed request. No
amount of care in a server action would help: two concurrent requests can both
pass a "have you already appreciated this?" check and both insert. Because
`appreciation_count` is recomputed from these rows rather than incremented, the
constraint protects the score as well as the table.

The write path cooperates rather than duplicating it:
[`toggleAppreciation()`](../src/server/actions/appreciation.ts) treats a `23505`
unique violation as the idempotent success it is — the member asked for the
state they are already in, and gets it with the true count.

### A restriction needs a source

```sql
source text not null
  constraint location_restrictions_source_present check (char_length(btrim(source)) > 0)
```
[`0002_core_tables.sql`](../supabase/migrations/0002_core_tables.sql)

An unsourced "permit required" or "no tripods" note is a rumour, and publishing
it under FRAME's name can stop someone making a photograph they were entitled
to make. If nobody can say where the claim came from — signage, an operator's
published policy, a dated moderator visit — the row does not get written.
`seed.sql` inserts no restrictions at all for the same reason: a fresh database
has had no review to cite.

### A collection item is exactly one thing

```sql
constraint collection_items_exactly_one_subject check (num_nonnulls(photograph_id, location_id) = 1)
```
[`0004_collections_and_reports.sql`](../supabase/migrations/0004_collections_and_reports.sql)

Never both, never neither. The two companion unique constraints —
`(collection_id, photograph_id)` and `(collection_id, location_id)` — are
partial in effect rather than in syntax: a unique index ignores rows whose
indexed column is null, so a collection's many place-items do not collide with
one another, and the same for photographs.

### A published photograph has a rights confirmation

```sql
constraint photographs_publishable
  check (status <> 'published'
         or (published_at is not null
             and rights_confirmed_at is not null
             and category is not null
             and image_width is not null
             and image_height is not null))
```
[`0003_photographs.sql`](../supabase/migrations/0003_photographs.sql)

The constraint the copyright policy exists for. It is in the database rather
than only in an action because an action can be forgotten, bypassed by a direct
PostgREST call, or re-written by someone who does not know why the check was
there. Note that it asks for more than the two timestamps: a published row also
needs its category and its pixel dimensions, because every card needs them to
render. `publishPhotograph()` sets all five in one statement.

The minimum row needed to insert a draft is therefore `owner_id`, `slug`,
`title` and `alt_text` — which is why the upload wizard holds a draft in memory
until the member has written alt text, rather than creating the row when they
pick a file.

### A negative moderation decision carries a reason

```sql
constraint moderation_actions_negative_decision_needs_reason
  check (decision in ('approve', 'dismiss')
         or char_length(btrim(coalesce(reason, ''))) > 0)
```
[`0004_collections_and_reports.sql`](../supabase/migrations/0004_collections_and_reports.sql)

`approve` and `dismiss` take nothing away, so they may stand alone. Everything
that removes, rejects, blocks or suspends must say why, because the member is
shown that sentence. Three sibling constraints enforce the same idea on the
rows the decision writes: `location_submissions_rejection_needs_reason`,
`photographs_removed_needs_reason` and `profiles_suspension_needs_reason`. A
member told only "rejected" has been given a verdict, not an explanation.

The rule is checked in three places on purpose — the zod schema, the action's
own `requireReason()`, and here — because it is a rule of the product rather
than a detail of a form.

### Others a writer will meet

| Constraint | What it refuses |
| --- | --- |
| `reports_resolved_needs_timestamp` | Closing a report as `actioned` or `dismissed` without `resolved_at` |
| `location_submissions_approved_needs_location` | A bare `update … status = 'approved'`; approval must go through `approve_location_submission()` |
| `locations_approved_needs_timestamp` | An approved place with no `approved_at` (a trigger fills it, so this catches a bug) |
| `locations_categories_allowed` | A category outside the six, or a null inside the array |
| `photographs_alt_text_length` | Alt text shorter than 10 or longer than 280 characters, at **any** status |

---

## Row-level security

RLS is enabled on all seventeen tables, including the gear lookups. Privileges
are revoked from `anon` and `authenticated` first and granted back deliberately,
so [`0007`](../supabase/migrations/0007_row_level_security.sql) is the whole
truth about what each role may attempt rather than an addition to whatever a
default grant left behind.

**Roles.** There are three, and they are Supabase's: `anon` (a signed-out
visitor), `authenticated` (any signed-in member) and `service_role`. There is no
separate database role for moderators — a moderator is an `authenticated`
session whose profile row says `moderator` or `admin`, which is why tables only
moderators may write still grant `insert`/`update` to `authenticated` and leave
the distinction to the policies. `public.is_moderator()` is that test
everywhere; it reads the caller's own profile row and returns false for a
suspended account.

`auth.uid()` is written as `(select auth.uid())` throughout, so Postgres
evaluates it once per statement instead of once per row.

### The rule for each table

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | Not suspended, or yourself, or a moderator | Update your own row; moderators may update any (privileged columns still blocked by a trigger). No insert policy — `handle_new_user()` is the only writer. No delete policy — removing the `auth.users` row cascades |
| `camera_brands` / `camera_models` / `lens_brands` / `lens_models` | Everyone | Moderators only |
| `locations` | `status = 'approved'`, plus everything for a moderator | Moderators only; no delete policy and no delete grant |
| `location_restrictions` | Visible exactly when its place is (`can_view_location()`) | Moderators only |
| `location_submissions` | Your own, plus everything for a moderator | Insert your own; moderators update. A member cannot edit a submission after sending it — that is what `changes_requested` is for |
| `photographs` | `status = 'published'`, plus your own, plus everything for a moderator | Insert and update your own; moderators update any; delete your own |
| `photograph_images` | Visible exactly when its photograph is (`can_view_photograph()`) | Owner or moderator (`can_edit_photograph()`) |
| `photograph_metadata` | Same as `photograph_images` | Same as `photograph_images` |
| `photograph_appreciations` | **Your own only**, plus moderators | Insert and delete your own. No update policy and no update grant |
| `collections` | `visibility = 'public'`, or your own | Insert, update and delete your own. Moderators are deliberately **not** given a view of private collections |
| `collection_items` | Visible exactly when its collection is (`can_view_collection()`) | Owner of the collection (`owns_collection()`) |
| `reports` | Your own, plus everything for a moderator | Insert under your own id; moderators update |
| `moderation_actions` | Moderators only | Insert only, and only `moderator_id = auth.uid()`. No update or delete policy or grant — append-only |
| `rate_limit_hits` | Nobody | Nobody. RLS on, zero policies, grants revoked; `check_rate_limit()` is the only way in |

Four decisions in that table are worth defending explicitly, because each one
was a choice rather than an oversight:

- **A member may read only their own appreciations.** Aggregate counts come
  from `photographs.appreciation_count`, so nobody needs to read these rows to
  render a number — and therefore nobody can enumerate who appreciated what.
  The list of photographs a named person has appreciated is a map of their
  taste, their city and often their movements.
- **Moderators cannot read private collections.** A report can only be filed
  about a public collection, which a moderator can already read. Reviewing a
  private one is a service-role operation somebody has to decide to perform,
  not a standing permission.
- **Appreciations may be written directly, not only through the RPC.** That
  keeps a plain PostgREST client honest without an RPC, and
  `recount_photograph_appreciations()` makes the summary follow either path.
- **Nothing is deleted where history matters.** A photograph, a place, a report
  and a decision are withdrawn by changing `status`. `photographs` and
  `collections` are the exceptions: an owner may delete their own.

### The sentence a reviewer must leave with

**The service-role key bypasses every policy above.** All of it: the
published-only filter, the owner checks, the moderator checks, the privacy rule
on appreciations. It is the key that answers "what if we need to fix this from
a script", and therefore the key that answers "what if it leaks".

So it never reaches a browser. [`@/lib/supabase/admin`](../src/lib/supabase/admin.ts)
is the only module that creates such a client and throws if it is evaluated in
a browser bundle. Anything running as the service role must do its own
authorisation first, in code, because the database will not do it for them. At
the time of writing exactly one code path uses it: the unattributed branch of
[`submitReport()`](../src/server/actions/reports.ts).

---

## Functions and triggers

Twenty-three functions, all with an explicit `set search_path` — most to `''`
with every name schema-qualified, which is the strictest form. Without it, a
`SECURITY DEFINER` function can be made to resolve `profiles` to a table an
attacker created in a schema earlier in their own search path. `SECURITY
DEFINER` appears only where it is genuinely required, and every use states what
it is for and has `EXECUTE` revoked from `PUBLIC` and granted to named roles.

| Function | What it is for |
| --- | --- |
| `set_updated_at()` | The `updated_at` trigger on eleven tables. Ignores a client-supplied value |
| `frame_slugify(text)` | Accent-folding slug, matched to `slugify()` in [`src/lib/utils.ts`](../src/lib/utils.ts) |
| `locations_set_geog()` | Keeps `geog` in step with `latitude`/`longitude` |
| `locations_stamp_approval()` | Fills `approved_at` when a place becomes approved |
| `current_profile_role()`, `is_moderator()` | The role test used by every policy |
| `can_view_photograph()`, `can_edit_photograph()`, `can_view_location()`, `can_view_collection()`, `owns_collection()` | Visibility rules written once and reused by the child-table policies |
| `handle_new_user()` | After-insert on `auth.users`. Creates the profile, derives a unique username, **never** assigns a role above `member` |
| `profiles_guard_privileged_columns()` | Refuses a member writing `role`, `is_suspended` or `suspended_reason`; refuses self-promotion even for an admin |
| `appreciation_count_of()` | The true count for one photograph, read past RLS, for the guard below |
| `photographs_guard_privileged_columns()` | Refuses an owner setting `editors_pick`, reassigning ownership, or writing any `appreciation_count` other than the true one |
| `recount_location_photographs()` | Rebuilds `photograph_count` **and** `categories` from published photographs |
| `recount_collection_items()` | Rebuilds `item_count` |
| `recount_photograph_appreciations()` | Second, redundant writer of `appreciation_count`, covering the direct insert/delete path |
| `toggle_appreciation(uuid)` | The member-facing write: lock, toggle, recount, return |
| `check_rate_limit(text, integer, integer)` | Fixed-window limiter and the only access path to `rate_limit_hits` |
| `trending_score_at()` / `trending_score()` | The decay formula, immutable and stable forms |
| `approve_location_submission(uuid, uuid)` | Creates the place, links the submission and writes the audit row in one transaction. Idempotent |

Three behaviours are worth understanding before changing anything here.

**`handle_new_user()` is the only writer of `profiles`.** It runs inside the
auth service's insert into `auth.users`, whose session has no rights on
`public.profiles` — which is why it is `SECURITY DEFINER` and why `profiles` has
no insert policy for anyone. If it raises, the signup fails and no account is
created; an `auth.users` row with no profile is an account that can sign in and
then 404 on its own profile page, which is worse than a retryable error. A
collision takes a short random suffix rather than a counter, because a counter
tells anyone who can read usernames how many people wanted the same one.

**The privileged-column guards are triggers, not column-level revokes.** Three
reasons, written out in `0006`: a column privilege error surfaces through
PostgREST as a bare "permission denied for table profiles", which tells a member
nothing; a column privilege is silently widened again by any later `grant update
on profiles`, which is a one-line mistake in a future migration; and the rule is
conditional ("an admin may change a role, but nobody may change their own"),
which a column privilege cannot express.

The `appreciation_count` guard is phrased as *the value must be true* rather
than *only this function may write it*: a caller who writes the correct number
has changed nothing, and a caller who writes any other number is inflating a
ranking. That is what `appreciation_count_of()` exists for.

**`toggle_appreciation()` is the narrow hole in the wall.** It is `SECURITY
DEFINER` because it has to write `appreciation_count` on a row the caller does
not own, and no policy should ever let a member update someone else's
photograph. It acts on `auth.uid()` — the actor is never a parameter — refuses a
suspended account and anything not published, locks the `photographs` row so two
simultaneous toggles cannot both recount a half-finished picture, and recomputes
the count in the same statement that writes it. Rate limiting is deliberately
not done here; it belongs to the server action, which has the bucket naming and
can report a retry-after.

`check_rate_limit()` is a **fixed-window** limiter: it counts the hits already
in the window, records this one if it is allowed, and runs its housekeeping
delete on roughly one call in a hundred. It records one hit per call against the
name it is handed, which is why each window needs its own bucket name — two
windows sharing a name would each count the other's attempts, halving both
limits. [`checkRateLimit()`](../src/lib/rate-limit.ts) appends the window length
to the key so that holds without every caller having to remember it. `anon` is granted `EXECUTE` because the limits that matter
most, sign-in and password reset, must apply before a session exists.

---

## Indexing and pagination

### What the indexes are shaped for

[`0005`](../supabase/migrations/0005_indexes.sql) creates 34 indexes and names
the query each one serves; an index nobody can name a query for is a write cost
with no reader. Most end in `id desc` after the ordering column, because they
are shaped for **keyset** pagination: `where (ordering_column, id) < (:last,
:last_id) order by ordering_column desc, id desc limit :n` needs the
tiebreaking id inside the same index as the ordering column.

| Ordering the UI asks for | Index that serves it |
| --- | --- |
| `/discover?sort=recent`, and every status-scoped moderation listing | `photographs_status_published_at_idx (status, published_at desc, id desc)` |
| `/discover?sort=appreciated` | `photographs_status_appreciation_idx (status, appreciation_count desc, published_at desc)` |
| `/discover?sort=editors` | `photographs_editors_pick_idx`, partial on `editors_pick and status = 'published'` |
| `/discover?category=…` | `photographs_category_published_idx`, partial on published |
| A portfolio, and "more by this photographer" | `photographs_owner_published_at_idx` |
| "Other photographs at this place" | `photographs_location_published_idx`, partial |
| `/locations` alphabetical / by popularity | `locations_approved_name_idx`, `locations_approved_popular_idx`, both partial on approved |
| Place search (`ILIKE '%term%'` over name, city, country) | `locations_search_trgm_idx`, one multi-column GIN because the query ORs the three columns |
| Nearby places, and the map viewport | `locations_geog_gist` |
| Report queue, submission queue, recent actions | `reports_status_created_idx`, `location_submissions_status_created_idx`, `moderation_actions_created_idx` |
| The appreciation burst check | `photograph_appreciations_profile_created_idx (profile_id, created_at desc)` |
| `check_rate_limit()` and its cleanup | `rate_limit_hits_bucket_created_idx`, `rate_limit_hits_created_idx` |

Two absences are deliberate and documented in the file: `photograph_images`
needs no index on `photograph_id` alone, because the
`(photograph_id, variant)` unique constraint already indexes a prefix of its own
columns; and `lens_model_id` is left unindexed because nothing filters or facets
on an individual lens model.

**Trending cannot be indexed.** `trending_score()` decays with wall-clock time,
so the ordering of two rows changes without either row being written. The live
repository therefore reads a bounded recent window through
`photographs_status_published_at_idx` and ranks it in process — `TRENDING_POOL =
300` rows in
[`supabase-repository.ts`](../src/lib/data/supabase-repository.ts). With a
36-hour half-life a two-week-old photograph is divided by roughly 630, so it
cannot realistically re-enter the top of the feed; the bound is honest, but it
is a bound.

### How the application actually pages

**Offset, not keyset.** This is the gap between the indexes' intent and the code
on disk, and it is worth stating plainly rather than leaving a reader to find
it:

- [`fetchPhotographRows()`](../src/lib/data/supabase-repository.ts) pages with
  `.range(offset, offset + limit - 1)` where `offset = (page - 1) * pageSize`.
- `locations()` does the same, with `count: 'exact'` so the index page can show
  a total.
- [`Pagination`](../src/components/ui/Pagination.tsx) renders numbered anchors,
  and [`discover-query.ts`](../src/lib/discover-query.ts) carries `?page=N` in
  the URL.

The composite indexes still serve the `ORDER BY`, so the ordering itself is
cheap. What offset paging costs is the rows before the window: page 400 reads
and discards 9,576 rows. Two bounds keep that finite — `MAX_DISCOVER_PAGE = 500`
in `discover-query.ts` and `MAX_PAGE_SIZE = 60` in the repository — and the
trade is recorded in [`docs/LIMITATIONS.md`](LIMITATIONS.md). Moving to keyset
is a change to the repository and to `Pagination`'s href builder; the indexes
are already right for it.

**Counts are avoided where they are expensive.** The discover feed asks for
`pageSize + 1` rows and reports `hasMore` from that, leaving
`Paginated.totalCount` as `null`; `Pagination` degrades its "Showing X to Y of
Z" line to "Page N" when it is. Trending also returns `null`, because the pool
is a window rather than the table. The location index does ask for an exact
count, because that table is small and the number is useful.

**Page sizes** come from `PAGE_SIZE` in [`src/lib/config.ts`](../src/lib/config.ts):
24 for a gallery, 18 for locations, 24 for a profile, 25 for a moderation queue.

### Reads that sample rather than aggregate

PostgREST cannot express several of the aggregates the UI wants, so the
repository computes them over a bounded sample. Each is a named constant with a
comment, and each is listed in [`docs/LIMITATIONS.md`](LIMITATIONS.md): gear
facets and the profile aggregates sample 5,000 rows, the duplicate scan reads
3,000 locations, map pins cap at 2,000, slug lists cap at 5,000. **A hosted
Supabase project defaults `max_rows` to 1,000**, which is below several of these
— `supabase/config.toml` sets 2,000 locally. Raise it on the project, or the map
will silently truncate past a thousand places.

---

## Running and extending the migrations

### Running them

The commands are in [`supabase/README.md`](../supabase/README.md). The order is
fixed — `0001` → `0007`, then `seed.sql` — and every file is written to be
re-runnable, so a second run adds what is missing rather than failing halfway.

Two things bite on a hosted project:

1. **PostGIS must exist before `0002` runs.** `0001` issues `create extension
   if not exists postgis`, which works when migrations run as `postgres`. A
   restricted migration role needs the dashboard toggle first, or
   `locations.geog` fails to create.
2. **The `auth` schema and the three Supabase roles must exist.** `0006` and
   `0007` each open with a guard that raises one clear error instead of failing
   statement by statement.

After any migration that changes a column, regenerate the database types that
the live repository annotates its hand-written `select` strings with. They live
at [`src/lib/supabase/types.ts`](../src/lib/supabase/types.ts) — note that this
is *not* the path printed in `supabase/README.md`, which still says
`src/types/supabase.ts`. The generated types describe the database; they are not
the domain types, and `src/types/domain.ts` is hand-written and must not be
replaced by generated output.

### The convention for a new migration

1. **A new numbered file.** `0008_<subject>.sql`, never an edit to a file that
   has been applied anywhere. The numbers are the order, and the order is the
   only thing that makes a re-run safe.
2. **Idempotent statements.** `create table if not exists`, `create index if not
   exists`, `create or replace function`, and `drop policy if exists` before
   `create policy` — the pattern every policy in `0007` already follows.
3. **Say why, in the file.** Every table, non-obvious column and index in this
   schema carries a comment naming the query or the product rule it exists for.
   A new one without that explanation is a maintenance problem the next person
   inherits.
4. **A new table means four more things**, not one: `alter table … enable row
   level security`, explicit grants for `anon` and `authenticated`, an explicit
   policy per operation, and a line in [the table above](#the-rule-for-each-table).
   A table with RLS enabled and no policy denies everything — correct for
   `rate_limit_hits`, wrong for anything a reader needs.
5. **Prefer a check constraint to a new enum type**, for the reasons in `0001`.
6. **If a vocabulary changes, change `src/types/domain.ts` in the same commit.**
   The check constraints and that file are two copies of one list.
7. **If a derived value changes, change its recount function** — never write an
   increment.
8. **Run it twice** against a scratch database before it goes anywhere, and run
   the behaviour you changed as a real `set role authenticated` session with JWT
   claims. RLS bugs do not show up as the `postgres` role, because that role
   bypasses them.

---

## See also

| Document | What it answers |
| --- | --- |
| [`supabase/README.md`](../supabase/README.md) | How to run the migrations, create the bucket, regenerate types, promote the first moderator |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | The repository seam above this schema, and where authorisation lives |
| [`docs/SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) | Each control, where it is implemented, and how to verify it |
| [`docs/LIMITATIONS.md`](LIMITATIONS.md) | The bounded reads, the offset paging, and what the fixes would look like |
