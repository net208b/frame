# Security checklist

A list of controls, where each one is implemented, and how to check it for
yourself.

**This is not a passed audit.** Nothing here has been penetration-tested, no
third party has reviewed it, and the last two sections exist specifically to
list what is missing: [what must be done before the first real member
account](#before-the-first-real-member-account) and [the controls that are
designed but not implemented](#designed-but-not-implemented). Read those two
before you draw a conclusion from the ticks above them.

Each item says what the control is, the file that implements it, and a check
you can run. `✓` means the control is in the code as described. `◐` means it is
partial, and says what is missing.

---

## Contents

- [Authentication and sessions](#authentication-and-sessions)
- [Authorisation](#authorisation)
- [The service-role key](#the-service-role-key)
- [Input validation](#input-validation)
- [Uploads](#uploads)
- [Rate limits](#rate-limits)
- [Vote integrity](#vote-integrity)
- [Redirects](#redirects)
- [Account enumeration](#account-enumeration)
- [Response headers](#response-headers)
- [Privacy: coordinates and EXIF](#privacy-coordinates-and-exif)
- [Search-engine hygiene](#search-engine-hygiene)
- [Dependencies and secrets](#dependencies-and-secrets)
- [Before the first real member account](#before-the-first-real-member-account)
- [Designed but not implemented](#designed-but-not-implemented)

---

## Authentication and sessions

**✓ Identity is read from the Supabase session on the server, on every request.**
[`src/lib/auth.ts`](../src/lib/auth.ts) calls `supabase.auth.getUser()` and then
reads the matching `profiles` row. Nothing takes identity from a prop, a
client-writable cookie, or a value passed in from a component.
*Verify:* `grep -rn "getViewer\|getUser()" src/lib/auth.ts`, and confirm no
server action accepts a user id as a parameter —
`grep -rn "userId\|viewerId\|ownerId" src/server/actions/ | grep -i "input\|param"`
returns nothing that reaches a write.

**✓ There is no fake sign-in path, and no development bypass.** In demo mode
`loadSession()` returns `null` before it touches Supabase, so the viewer is
permanently signed out; it does not invent one. Every auth action refuses with
`NOT_CONFIGURED_MESSAGE` and sets no cookie.
*Verify:* `grep -rn "NODE_ENV" src/lib/auth.ts src/server/actions/auth.ts` —
nothing. Start the app with an empty environment and confirm the header shows a
visitor and `/login` cannot produce a session.

**✓ A signed-in account with no profile row is treated as signed out.**
Inventing a display name there would put a fabricated member in the UI, so
`loadSession()` returns `null` when the row or the username is missing.
*Verify:* read lines 71–91 of `src/lib/auth.ts`.

**✓ The session is refreshed where cookies can actually be written.** Server
Components cannot write cookies, so [`middleware.ts`](../middleware.ts) calls
[`updateSession()`](../src/lib/supabase/middleware.ts), which writes the rotated
tokens onto a response that has not been sent yet, and passes Supabase's own
no-store headers through so a CDN cannot cache one member's rotated session and
serve it to another. The server client's cookie writer swallows only the
expected Server-Component throw.
*Verify:* `grep -n "setAll" src/lib/supabase/{server,middleware}.ts`.

**✓ Sign-out is POST-only and origin-checked.**
[`src/app/auth/signout/route.ts`](../src/app/auth/signout/route.ts) answers GET
with 405 and refuses a cross-site POST on `sec-fetch-site`/`origin`. A sign-out
on GET can be fired by any image tag on any page, which turns "visit a forum"
into "lose your session". The header submits a real form, so POST is all that is
needed. Scope is `local`, so signing out on a laptop does not sign the member out
of their phone.
*Verify:* `curl -i <site>/auth/signout` → 405. Submit the form from another
origin → 403.

**✓ Server actions are origin-checked by the framework.** Next.js compares
`Origin` against `Host` for server-action requests, so a cross-site form cannot
invoke one. The one hand-written POST endpoint
(`/api/uploads/sign`) does *not* repeat that check — see
[Designed but not implemented](#designed-but-not-implemented).

**✓ Email links are verified server-side.**
[`/auth/callback`](../src/app/auth/callback/route.ts) exchanges a `code` for a
session; [`/auth/confirm`](../src/app/auth/confirm/route.ts) verifies a
`token_hash` and hands a `code` over to the callback rather than implementing the
exchange twice. A refused or expired link lands on a page that can issue a new
one, with the provider's error logged rather than shown.
*Verify:* open a confirmation link twice; the second lands on
`/verify-email?status=invalid`.

**◐ Password strength is partly delegated.** `src/lib/validation/auth.ts`
enforces a 10-character minimum; the identity service's own `weak_password`
refusal is surfaced with its own sentence. There is no breach-list check in the
app. Whether one exists depends on the Supabase project's password settings,
which are configuration rather than code.

---

## Authorisation

**A hidden button is not a permission check.** It is one `fetch()` away from
being pressed. Everything in this section exists because the UI's own decisions
carry no weight.

**✓ Three layers, and the bottom one is the real one.**

| Layer | Where | What it is |
| --- | --- | --- |
| The UI hides a control | components | a courtesy to the reader |
| The page or action checks the session | `src/lib/auth.ts`, each action | a readable refusal |
| Row-level security decides per statement | [`0007_row_level_security.sql`](../supabase/migrations/0007_row_level_security.sql) | the actual control |

*Verify:* RLS is on for all seventeen tables and 48 policies exist —
```sql
select relname, relrowsecurity from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'r';
select count(*) from pg_policies where schemaname = 'public';
```
Every row of the first query must read `t`. [`docs/DATABASE.md`](DATABASE.md#the-rule-for-each-table)
has the intended rule for each table in one line.

**✓ Every server action re-checks authorisation for itself.** A page gate is
rendered once and can be cached; an action is a public HTTP endpoint whether or
not a page links to it. Each module has a named guard that runs capability,
identity, suspension and role before anything else: `guardUploader()`
([upload](../src/server/actions/upload.ts)), `authorise()`
([collections](../src/server/actions/collections.ts)), `begin()` →
`authoriseModerator()` ([moderation](../src/server/actions/moderation.ts)).
*Verify:* `grep -n "getViewer()" src/server/actions/*.ts` — every module.
`src/app/moderation/layout.tsx` says in its own comment that its
`requireModerator()` is for the reader's benefit and is not what protects
anything.

**✓ Ownership is checked in the query and re-asserted on the row.**
`loadOwnedPhotograph()` filters `.eq('owner_id', viewer.id)` and then checks
`row.owner_id !== viewerId` again, because a mistake in either place is the
difference between a member editing their own draft and a member editing
somebody else's. Collection writes are filtered on `owner_id` a second time so a
policy regression cannot become someone else's data being edited.
*Verify:* `grep -n "owner_id" src/server/actions/upload.ts src/server/actions/collections.ts`.

**✓ A missing row and a row you may not see give the same answer.** "That upload
was not found in your account" / "This account cannot record moderation
decisions" are returned for both cases, so a probe cannot confirm that somebody
else's id is real. `requireModerator()` answers with `notFound()` rather than a
403, so `/moderation` is indistinguishable from a URL that does not exist.
*Verify:* request `/moderation` as a member — 404, not 403. Call an upload action
with another member's photograph id — `not_found`.

**✓ A suspended account is treated as signed out for every write.**
`getViewer()` deliberately still returns a suspended member, because the pages
they can reach have to explain the suspension, so every write path asks
`getViewerSuspension()` separately. `requireModerator()` refuses a suspended
moderator whatever their role, which is how a compromised moderator account is
stopped. `toggle_appreciation()` and `approve_location_submission()` check
suspension in SQL as well.
*Verify:* `grep -rn "getViewerSuspension" src/server/actions/ src/app/api/` —
present in upload, locations, collections, moderation and the sign route.

**✓ Privileges cannot be written by their holder.** `profiles.role`,
`is_suspended` and `suspended_reason` are refused by the
`profiles_guard_privileged_columns` trigger; `photographs.editors_pick` and
`appreciation_count` by `photographs_guard_privileged_columns`. Self-promotion is
refused even for an admin. No code path anywhere writes `profiles.role` — the
column simply never appears in an update payload.
*Verify:* `grep -rn "role:" src/server/actions/` returns nothing that writes it.
As a member, with a real JWT:
```sql
update profiles set role = 'admin' where id = auth.uid();   -- 42501
update photographs set editors_pick = true where id = '…';  -- 42501
```

**✓ The audit trail is append-only and self-signed.** No role has `update` or
`delete` on `moderation_actions`, and the insert policy requires
`moderator_id = auth.uid()` so one moderator cannot write a decision under
another's name.
*Verify:* `select * from pg_policies where tablename = 'moderation_actions';`
— one select, one insert, nothing else.

**✓ Route protection is not in middleware, on purpose.**
`middleware.ts` refreshes the session and nothing else. Middleware runs before a
route is resolved and cannot read the database cheaply, so a redirect decided
there would be a guess. The decision is made where the real role is known.

---

## The service-role key

**✓ It is server-only by construction.** `serverEnv()` in
[`src/lib/config.ts`](../src/lib/config.ts) throws if evaluated with a `window`,
and reads `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` — neither of which
carries a `NEXT_PUBLIC_` prefix, so neither is inlined into the browser bundle.
[`createAdminClient()`](../src/lib/supabase/admin.ts) throws in a browser bundle
and throws again if the key is absent.
*Verify:*
```bash
grep -rn "NEXT_PUBLIC_.*SERVICE\|NEXT_PUBLIC_.*SECRET" src/ .env.example   # nothing
grep -rln "createAdminClient" src/                                          # one caller
# after a build, the strongest check of all:
grep -r "service_role" .next/static/ | head             # must be empty
```

**✓ Exactly one code path uses it**, and it is deliberate: the unattributed
branch of [`submitReport()`](../src/server/actions/reports.ts). RLS lets an
authenticated member insert a report only under their own id, so a report filed
without a session has to be written with the service role. When no key is
configured the action says so plainly rather than claiming the report was filed.

**✓ Public reads never use it.** Every repository read runs on the cookie-bound
client, so RLS is the gate; the four slug-list reads that run outside a request
scope use a session-less client carrying the **publishable** key, which is still
subject to RLS.
*Verify:* `grep -n "admin" src/lib/data/supabase-repository.ts` — nothing.

**The thing a reviewer must remember:** this key bypasses every policy in the
schema. Anything running as the service role has to do its own authorisation in
code, because the database will not do it for them.

---

## Input validation

**✓ Validation happens at the server boundary, with zod v4.** Every action
validates through [`parseForm(input, schema)`](../src/lib/validation/index.ts),
which accepts either a `FormData` from a progressively-enhanced form or a plain
object from a client component, never throws, and flattens issues into
dotted-path `fieldErrors` matching
[`failFromZod()`](../src/lib/action-result.ts). The schemas live in
`src/lib/validation/`, one module per feature.
*Verify:* `grep -c "parseForm\|safeParse" src/server/actions/*.ts` — every
module. `grep -rn "as any\|JSON.parse(.*body" src/server/actions/` — nothing.

**✓ The rules are in the schema, not only in the UI.** A username is 3–24
characters of `[a-z0-9_]`, lowercased, and refused if it is one of the
`RESERVED_USERNAMES` — route segments plus names such as `moderator` and
`staff` that would let an account imply an authority it does not have. A
password is at least 10 characters. A title is 1–120. **Alt text is required,
10–280 characters**, in the schema *and* as a `NOT NULL` check constraint from
the first insert. A negative moderation decision requires a non-empty reason, in
the schema, in the action's own `requireReason()` and in two database
constraints. Latitude and longitude go through `isValidLatitude` /
`isValidLongitude` from [`src/lib/geo.ts`](../src/lib/geo.ts).
*Verify:* read `src/lib/validation/auth.ts`, `upload.ts`, `location.ts`,
`moderation.ts`. Post a sign-up with `username=moderation` → refused.

**✓ Validation runs after authorisation.** A stranger should not be able to
learn a schema by probing error messages. The two documented exceptions are the
address-keyed auth actions, where the bucket is derived from the submitted
address and so the address has to be parsed first — nothing is read or written
before the limit applies — and `submitReport()`, which does not require a
viewer at all.

**✓ A free-text search term cannot rewrite a query.** The place filter goes into
a PostgREST `or=(…)` expression, so `sanitiseSearchTerm()` in the repository
strips the characters that carry meaning there — commas, brackets, quotes,
backslashes and the `ilike` wildcards — and caps the term at 80 characters.
Everything else is a parameterised PostgREST filter; there is no string-built
SQL anywhere in the application.
*Verify:* `grep -rn "sanitiseSearchTerm" src/lib/data/supabase-repository.ts`;
search for `St. Pauli` and for `a,b)` and confirm both behave as searches.

**✓ A row read back is parsed, not asserted.** The Supabase client is untyped by
contract, so the moderation actions and the appreciation action parse every
returned row with zod and treat a shape mismatch as an honest error rather than
casting it.

---

## Uploads

Full detail in [`docs/IMAGE-PIPELINE.md`](IMAGE-PIPELINE.md). The controls:

**✓ The storage key is derived on the server from the session.**
`storageKeys(photograph.id, viewer.id)` in
[`/api/uploads/sign`](../src/app/api/uploads/sign/route.ts). A client never names
a key, so it can neither choose where its bytes land nor write over another
member's object.
*Verify:* read the comment at step 7 of that file. Post a sign request with a
`key` field — it is not in `signUploadSchema` and is ignored.

**✓ The grant is scoped to one key, one media type and one declared size.**
`assertSignableUpload()` in [`src/lib/storage/types.ts`](../src/lib/storage/types.ts)
refuses a leaf/content-type mismatch, a non-positive ceiling, or a ceiling above
`UPLOAD_POLICY.maxFileBytes`. `parseStorageKey()` accepts only the
`owner/photograph/leaf` layout, with the leaf set derived from
`IMAGE_VARIANTS`.
*Verify:* ask for `grid.webp` as `image/jpeg` → refused before any provider call.

**◐ The grant cannot pin a maximum size.** Neither provider can express one:
Supabase has no per-grant limit at all, and SigV4 can sign an exact
`content-length` but not a range. The controls that do hold are the bucket's
`file_size_limit`, the short expiry, and the byte check below. This is stated in
both drivers' header comments rather than papered over.

**✓ The real file contents are verified server-side, from magic bytes.**
`verifyImageBytes()` in [`src/lib/images/process.ts`](../src/lib/images/process.ts)
takes the media type from what `sharp` actually decoded, never from the declared
type; refuses multi-frame files, undecodable files, anything below 800×800 and
anything over the byte ceiling; and reads dimensions from `metadata.autoOrient`.
`limitInputPixels` is capped at 120 MP so a 40 KB file cannot ask for tens of
gigabytes of memory.
*Verify:* rename a PDF to `.jpg`, declare `image/jpeg`, upload it → refused with
"could not be read as an image". Try an animated WebP → refused.

**✓ A gallery is never served an original.** Only the four derivatives are
linked. `buildImage()` falls back `display` → `full` → `grid` → `thumb` and
returns `null` rather than reaching for the original.
*Verify:* `grep -n "original" src/lib/data/supabase-repository.ts` — nothing.
View source on `/discover` and confirm every image URL ends in a variant name.

**✓ Derivatives carry no metadata.** No `keepMetadata`, `keepExif` or
`keepIccProfile` call exists in the module; sharp drops every tag by default and
that default is the guarantee. Only the sRGB profile is written.
*Verify:* `exiftool` a stored `grid.webp` — no EXIF, no GPS. And
`grep -rn "keepMetadata\|keepExif\|withMetadata" src/lib/images/` returns
nothing.

**✓ A member cannot leave unbounded work pending.** `maxPendingUploads` (30)
caps drafts, processing and under-review rows, and a *failed count refuses the
upload* rather than letting the ceiling disappear.

**✓ Deletion is scoped.** `remove()` on both drivers refuses any key that is not
one `storageKeys()` builds, and `discardDraft()` deletes the objects before the
row so the orphan can never be the original.

---

## Rate limits

**✓ The limiter is in the database, and it is the only way into its table.**
`check_rate_limit()` is `SECURITY DEFINER`; `rate_limit_hits` has RLS enabled,
zero policies, and no grants to `anon` or `authenticated`. A client that could
delete its own hits could reset its own limit.
*Verify:* as a member — `select * from rate_limit_hits;` → permission denied.

**✓ Buckets key on an account, never on an IP address alone.** An address is
shared by everyone behind a university NAT or a mobile carrier, so treating it
as identity both misses real abuse and punishes innocent members. The auth
flows, which have no session yet, key on a truncated SHA-256 of the submitted
address so the limiter table cannot be read as a list of addresses that tried to
sign in.
*Verify:* `grep -rn "checkRateLimit(" src/ | grep -i "ip\|x-forwarded"` —
nothing.

**✓ Each window gets its own bucket name.** The limiter records one hit per
allowed call against the name it is handed, so two windows sharing a name would
each count the other's attempts. Every caller names the window in the bucket;
the one exception is noted below.

**✓ It fails closed.** A limiter that opens up when its store is unreachable is
not a limiter, so any RPC error other than "function does not exist" denies the
attempt. A missing function means the migrations have not been applied, which is
a deployment problem rather than an attack, so the per-instance fallback keeps
the app usable and logs the reason.

### The policy numbers

| Action | Limit | Where it is set |
| --- | --- | --- |
| Appreciate | 20/minute, 200/hour per account | `APPRECIATION_POLICY` |
| Upload — sign, create, process, publish, discard | 6/hour and 20/day per account, **per operation** | `UPLOAD_POLICY` |
| Pending uploads | 30 concurrent | `UPLOAD_POLICY.maxPendingUploads` |
| Propose a place | 5/day per account | `LOCATION_POLICY.maxSubmissionsPerDay` |
| Report (signed in) | 10/hour, 40/day per account | `src/server/actions/reports.ts` |
| Report (no account) | 20/hour, **one shared bucket** | same file |
| Sign in | 8 per 5 min, 25/hour per address | `src/server/actions/auth.ts` |
| Sign up | 5/hour per address | same |
| Password reset | 3 per 15 min, 8/day per address | same |
| Resend confirmation | 2 per 10 min, 6/day per address | same |
| Password change | 5/hour per account | same |
| Moderation decisions | 30/minute, 400/hour per moderator | `src/server/actions/moderation.ts` |

The mail-sending flows are tightest because the cost of abusing them lands in
somebody else's inbox. The moderation figures are generous for a person working
a queue and still bound a script that has got hold of a moderator session.

**◐ The anonymous report bucket is a weak control and is labelled as one.** It
cannot tell two visitors apart, so a determined abuser spends the same allowance
as the honest reporters behind the same deployment. It exists to bound the
damage a script can do to the queue, not to attribute anything. Its own comment
says so.

**◐ The appreciation action passes the same bucket string to both windows.**
`appreciate:<viewer id>` is used for the 20/60s check and the 200/3600s check, so
each toggle records two hits in one bucket and the effective limits are roughly
half the stated figures. It fails safe — stricter, not looser — and the fix is a
one-line rename to match every other caller. Listed below.

---

## Vote integrity

**✓ The database unique constraint is the guard, not the API.**

```sql
constraint photograph_appreciations_one_per_member unique (photograph_id, profile_id)
```

No amount of care in a server action would help. Two concurrent requests can
both pass a "have you already appreciated this?" check and both insert; only a
row-level guarantee refuses the second. Because
`photographs.appreciation_count` is **recomputed** from these rows rather than
incremented, the constraint protects the score as well as the table.
*Verify:*
```sql
insert into photograph_appreciations (photograph_id, profile_id)
values ('<id>', auth.uid());   -- run twice: the second raises 23505
```

**✓ A replayed request is treated as the idempotent success it is.**
`toggleAppreciation()` reads a `23505` as "the member asked for the state they
are already in" and returns it with the true count.

**✓ The count can only ever hold the truth.**
`photographs_guard_privileged_columns()` permits exactly one value for
`appreciation_count` — the number of rows that actually exist, read past RLS by
`appreciation_count_of()`. A caller who writes the correct number has changed
nothing; any other number is refused. There is no `+ 1` anywhere in the schema.

**✓ The actor is never a parameter.** `toggle_appreciation()` acts on
`auth.uid()`; the photograph id is the only input. It refuses a suspended
account and anything not published, and locks the `photographs` row so two
simultaneous toggles cannot both recount a half-finished picture.

**✓ Two independent writers keep the summary honest.** The RPC recomputes, and
`recount_photograph_appreciations()` covers the direct insert/delete path that
RLS deliberately allows. Without the trigger that path would leave the count
behind — which is exactly the request an attacker would choose.

**✓ The count the client sends is never trusted.** `AppreciateButton` is
optimistic locally and adopts the server's authoritative number on success; the
action takes no count as input.

**✓ Who appreciated what cannot be enumerated.** A member may read only their
own appreciation rows; aggregate counts come from the denormalised column.
Moderators can read them, because the burst heuristic in
[`src/lib/ranking.ts`](../src/lib/ranking.ts) is a signal a human has to be able
to look at.

**✓ Nothing is bought and nothing is hidden.** No sponsored placement is mixed
into any ordering, and `editors_pick` is a labelled surface rather than a silent
boost — stated in `ranking.ts`, enforced by the trigger, and explained to readers
through `SORT_EXPLANATIONS`.

---

## Redirects

**✓ Every `next` parameter passes through one function.**
[`safeNextPath()`](../src/lib/safe-redirect.ts) requires a single leading slash,
refuses `//evil.example` and `/\evil.example` (some browsers read a backslash as
a slash), refuses control characters, caps the length at 512, and refuses
`/login`, `/join`, `/auth` and anything under `/auth/` or `/api/` so a completed
flow cannot bounce a member straight back out of it. Anything that fails falls
back to a known-good destination rather than being repaired.
*Verify:*
```
/login?next=https://evil.example   → lands on /
/login?next=//evil.example         → lands on /
/login?next=/discover              → lands on /discover
```
`grep -rn "searchParams.get('next')\|get('next')" src/` — every hit is wrapped.

**✓ The hidden field is validated as well as the query string.** `signIn()`
re-validates `formData.get('next')`, because a hidden field is as editable as
the URL it came from.

**✓ Redirects are built on the origin the request arrived at.**
`sameOriginUrl()` clones `request.nextUrl`, which accounts for the forwarded
host. A session cookie set on one host is useless on another, so redirecting to
a URL built from a configured base would hand the browser a cookie for a site it
is no longer on.

---

## Account enumeration

**✓ Sign-in gives one answer for a wrong password and an unknown address.**
`SIGN_IN_REFUSED` — "Those details do not match an account" — is returned for
both, and the provider's `invalid_credentials` is deliberately not logged
differently from any other case.
*Verify:* sign in with a known address and a wrong password, then with an
address that has no account. Compare the responses byte for byte.

**✓ Password reset and confirmation resend answer conditionally.** "**If** that
address has an account, a reset link is on its way." The sentence is written so
that it stays true when its condition is false, and the same sentence is
returned when the provider refuses the resend as `validation_failed` — because
answering differently there would disclose which case it was.

**◐ Two distinctions are observable, and both are documented in the code.**
An unconfirmed address gets its own message, because the identity service
answers an unconfirmed sign-in with its own distinct error and the distinction is
already observable — leaving the member with the generic refusal would strand
them with no way to work out why. And with email confirmation **switched off** in
the Supabase project, sign-up answers `user_already_exists` plainly, because in
that configuration sign-in already discloses the same thing. With confirmation
on, sign-up is conditional like the rest.

**✓ Usernames are public by design, and treated that way.** The availability
check during sign-up reads a public URL namespace. It exists because
`handle_new_user()` suffixes a taken username rather than failing, so without it
a member would be told they had joined as the handle they asked for and find a
different one on their profile.

**✓ Moderation surfaces disclose nothing.** `/moderation` 404s for a
non-moderator, and the actions return one sentence — "This account cannot record
moderation decisions" — for both "you are not a moderator" and "there is no such
queue item".

---

## Response headers

Set globally in [`next.config.mjs`](../next.config.mjs):

| Header | Value | What it buys |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | A served file is never re-interpreted as script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | A photograph slug does not leak to third parties in a referrer |
| `X-Frame-Options` | `DENY` | No framing, so no clickjacking of the appreciate or moderation controls |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), payment=()` | Only same-origin geolocation, for "places near me" |
| `X-Powered-By` | removed (`poweredByHeader: false`) | One less version fingerprint |

*Verify:* `curl -sI https://<site>/ | sort`.

**◐ There is no Content-Security-Policy, and no HSTS.** Both are the largest
remaining header gaps and both are listed below. What a CSP would add, concretely
for this app:

- `script-src 'self'` plus a per-request nonce would turn any successful HTML
  injection from script execution into inert text. The app renders no
  user-supplied HTML and injects JSON-LD through a `<script type="application/ld+json">`
  tag, so a nonce-based policy is achievable without `unsafe-inline`.
- `img-src` restricted to `'self'`, `data:` and the configured image host would
  stop an injected `<img>` beaconing a reader's visit to a third party.
- `connect-src` restricted to `'self'` and the Supabase origin would stop an
  injected script exfiltrating to an arbitrary endpoint.
- `frame-ancestors 'none'` would replace `X-Frame-Options` with the modern
  equivalent, and `form-action 'self'` would stop an injected form posting
  credentials elsewhere.

The honest reason it is absent: MapLibre fetches tiles, glyphs and sprites from
whatever host the configured style document names, so a correct `img-src` /
`connect-src` has to be derived from `NEXT_PUBLIC_MAP_STYLE_URL` at request
time. That is a real piece of work rather than a one-line header, and shipping a
policy that silently breaks the map on a provider nobody tested would be worse
than shipping none. HSTS, by contrast, is a one-line addition and belongs in the
pre-launch list only because it is destructive to get wrong on a domain that
still serves anything over HTTP.

---

## Privacy: coordinates and EXIF

**✓ A coordinate is treated as a privacy decision.** Publishing the exact
position of someone's doorway, a shelter, or a place of worship under
surveillance can cause real harm. `publishableCoordinates()` in
[`src/lib/geo.ts`](../src/lib/geo.ts) is the only function that turns a stored
coordinate into a published one: four decimals (~11 m) normally, two (~1.1 km)
for a place marked `is_sensitive`, and `null` for one marked
`withhold_coordinates`. Rounding truncates, which widens the area rather than
moving it.
*Verify:* `grep -rn "latitude" src/lib/data/supabase-repository.ts | grep -v publishableCoordinates`
— every remaining hit is a column name or a bounding-box filter, never a value
on its way out.

**✓ Precision is never widened downstream.** `placeJsonLd()` emits
`location.coordinates` verbatim — the already-coarsened value — and adds a
`Coordinate precision` property when it is approximate, so a machine reader is
told the point is deliberately imprecise.

**✓ EXIF GPS is never published automatically.** Four gates, in order: the
question is asked with the full policy beside it
(`describeExifGpsPolicy()`); silence is a no (`shareExifGps` is read as
`value === true`); consent *stores* the point in consent-gated columns but does
not publish it, and a place reaches the map only when a moderator approves a
submission; and what is finally published is rounded.
*Verify:* publish with no answer to the GPS question and confirm
`photograph_metadata.exif_gps_consent` is `false` and both columns are null.

**✓ EXIF is never treated as proof of ownership.** It is read in the browser to
prefill a form, stored as `exif_source` so a moderator reviewing a dispute can
see what the file said, and used to derive review signals — one of which,
`exif-missing`, explicitly says that missing EXIF is common and proves nothing
either way. No permission anywhere in the app is granted on the strength of it.

**✓ The capture date is consent-gated too.** `publish_captured_at` defaults to
false and `exifSourceRecord()` drops the date from the stored readout unless the
member chose to publish it, because a capture time can place a person somewhere
on a particular evening.

**✓ Nothing is inferred about a member's location.** `profiles.based_in` is free
text the member typed and `profiles.country_code` is a country they picked from
a list, both with column comments saying they are never inferred from a request
— even though the home page can resolve a city from the request's own address
for the map, which is read per request and stored nowhere. FRAME keeps no record of what anyone searches for — the "suggested
searches" on `/search` are a fixed list, and the page says so rather than calling
them popular.

**◐ The GPS columns are protected by query discipline, not by a grant.**
`photograph_metadata` is readable by anyone for a published photograph, and the
repository's `METADATA_FIELDS` deliberately omits the GPS columns; the one query
that selects them is scoped to `status = 'under_review'`. A column-level revoke
for `anon` and `authenticated` would make that structural. Listed below, and
noted in the migration itself.

---

## Search-engine hygiene

**✓ Nothing unpublished can reach the sitemap.** Every entry in
[`src/app/sitemap.ts`](../src/app/sitemap.ts) comes from the read API, so it has
already been through the same published-and-approved filters the public pages
use. Its own header comment states the stakes: a draft, a pending location or a
private collection in a machine-readable file designed to be crawled would be a
privacy breach rather than a ranking mistake.
*Verify:* `curl -s https://<site>/sitemap.xml | grep -c "<loc>"` and compare
against `select count(*) from photographs where status = 'published';` plus the
approved locations, public collections and profiles.

**✓ `lastModified` is omitted where no date exists** rather than filled with
today's. A fabricated timestamp tells a crawler that everything changed at once.

**✓ Private surfaces are excluded from both the sitemap and robots.txt.**
`/upload`, `/moderation`, `/search`, `/api/`, `/auth/` and the five account pages
are disallowed in [`src/app/robots.ts`](../src/app/robots.ts), whose comment says
plainly that this is a crawling instruction and not a security control —
`/moderation` and `/upload` authorise every request for themselves on the server.

**✓ Pages that should not be indexed say so in their own metadata.**
`noIndex: true` on `/search` and `/moderation`, and on any **filtered** Discover
view, because filters, orderings and pages multiply into thousands of
near-identical URLs.
*Verify:* `curl -s "https://<site>/discover?category=night" | grep noindex`.

**✓ Canonicals are built from `siteUrl()`,** so a preview deployment never
advertises itself as production. Note the consequence recorded by the shell
author: Next inherits `alternates` from the root layout, so **a page that does
not export its own metadata will advertise the home page as its canonical**.
Every page owner must export metadata.
*Verify:* `grep -rLn "buildMetadata\|generateMetadata\|export const metadata" $(find src/app -name 'page.tsx')`
— at the time of writing the only hit is `src/app/moderation/page.tsx`, whose
own layout exports `buildMetadata({ …, noIndex: true })`, so it is covered. Any
other hit is a page advertising the home page as its canonical.

**✓ Structured data states only what FRAME knows.** `photographJsonLd()` names
the creator and the copyright holder but claims no licence, because members grant
none; `placeJsonLd()` emits `geo` only when a coordinate survived the privacy
policy.

---

## Dependencies and secrets

**✓ The dependency surface is small and deliberate.** Twenty direct runtime
dependencies, eight of which are individual Radix primitives. No
state-management library, no data-fetching library, no component framework, no
CSS-in-JS. The R2 driver signs SigV4 with `node:crypto` rather than pulling in
the AWS SDK for four HMACs.
*Verify:* read [`package.json`](../package.json); `npm ls --depth=0`.

**◐ Nothing audits them automatically.** There is no `npm audit` in a script, no
lockfile-update automation and no CI configuration in the repository. The
scripts are `dev`, `build`, `start`, `lint`, `typecheck`.

**✓ Secrets are kept out of the repository by construction.**
[`.gitignore`](../.gitignore) excludes `.env` and every `.env.*.local`;
[`.env.example`](../.env.example) is committed with placeholder values only and
opens with three paragraphs explaining that any `NEXT_PUBLIC_` name is inlined
into the JavaScript sent to every visitor.
*Verify:* `git log --all --full-history -- .env .env.local` → empty. `grep -rn
"eyJ" .env.example` → nothing.

**✓ Provider errors are logged, not shown.** Every action logs the provider's
own message through a named helper and returns a sentence written for the
member. No stack trace, no provider error code and no internal identifier
reaches a response body.
*Verify:* `grep -rn "console.error" src/server/actions/ | wc -l` — present
throughout; then `grep -rn "error.message" src/server/actions/ | grep -v
console` — the message is never returned.

**◐ `console.error` is the whole of the logging story.** There is no structured
logger, no error reporter and no alerting, so a repeated failure is visible only
to whoever reads the host's logs.

---

## Before the first real member account

In rough priority order. None of these is code the application is missing; they
are things only the operator of a deployment can do.

1. **Apply all seven migrations and confirm RLS is on.** Run the two queries in
   [Authorisation](#authorisation). A table with RLS off is readable by every
   visitor. Enable PostGIS *before* `0002` runs on a hosted project.
2. **Confirm the service-role key is not in the client bundle.**
   `grep -r "service_role" .next/static/` after a production build must be
   empty, and no `NEXT_PUBLIC_` variable may hold it.
3. **Create the storage bucket with its limits and its four policies**, from
   [`supabase/README.md`](../supabase/README.md#creating-the-storage-bucket).
   `file_size_limit` must match `UPLOAD_POLICY.maxFileBytes` (26214400) and
   `allowed_mime_types` must match the four accepted types — the per-grant
   ceiling cannot be expressed, so the bucket is where that limit lives.
4. **Set the Supabase auth URLs** (site URL and the redirect allow-list) so that
   confirmation and recovery links land on this deployment and not on
   `localhost`. A link that lands on the wrong origin cannot set a session on
   this one.
5. **Decide the email-confirmation setting, knowingly.** With confirmation off,
   sign-up discloses that an address already has an account. See
   [Account enumeration](#account-enumeration).
6. **Promote the first moderator by hand**, as `postgres`, per
   `supabase/README.md`. There is no code path that grants a role above
   `member`; that is deliberate.
7. **Add HSTS**, once every host serving the domain is HTTPS-only.
8. **Raise the project's `max_rows`** above the repository's bounds (2,000 for
   `mapPins`), or the map silently truncates past a thousand places.
9. **Review the demo content.** With a database configured the bundled dataset
   is not served, but `images.unsplash.com` remains in `remotePatterns`; remove
   it if nothing references it. The bundled images are development material and
   not a licence for production use — see
   [`docs/LIMITATIONS.md`](LIMITATIONS.md).
10. **Decide a licence.** There is no `LICENSE` file, so no licence is granted
    by default. That is a legal exposure for anyone deploying this, not a
    technical one.
11. **Put a log destination and an error reporter somewhere you will read**, and
    decide who is paged when `check_rate_limit` starts failing closed.
12. **Walk the smoke test** in
    [`docs/DEPLOYMENT.md`](DEPLOYMENT.md#post-deploy-smoke-test) as a signed-out
    visitor, a member and a moderator, in that order.

---

## Designed but not implemented

Everything in this section is a real gap. It is listed here so that nobody
mistakes the ticks above for a complete control set. The longer form of each —
why it is like this, what could go wrong, what the fix looks like — is in
[`docs/LIMITATIONS.md`](LIMITATIONS.md).

| Gap | Where | Consequence |
| --- | --- | --- |
| **No Content-Security-Policy** | `next.config.mjs` | An HTML injection anywhere would execute. Needs a nonce and a map-host-aware `img-src`/`connect-src` |
| **No HSTS** | `next.config.mjs` | A first request over HTTP is strippable |
| **Perceptual hashing is claimed but absent** | `src/app/legal/copyright/page.tsx` says FRAME "computes a perceptual fingerprint of each upload". No such code and no such column exists | A published policy page describes a control that does not run. Either implement it or change the copy before launch |
| **Derivative bytes are not verified** | `signUploadSchema` accepts a `target` of `thumb`/`grid`/`display`/`full`, so an owner can obtain a grant for their own derivative key and PUT arbitrary WebP over a server-generated one before publishing | The served image can differ from the verified original. Fix: restrict the signable target to `original`, or run `verifyImageBytes` on a derivative that was not produced by `buildVariants` |
| **`/api/uploads/sign` has no origin check** | that route, unlike `/auth/signout` | A cross-site POST cannot *read* the grant (no CORS headers are sent) but can burn a member's upload rate limit. Fix: the same `sec-fetch-site` check the signout route already has |
| **The pending-upload ceiling is off by one between two callers** | the route uses `pending > max`, `pendingUploadGuard()` uses `pending >= max` | 31 pending via the route, 30 via the action. Fix: one shared helper |
| **The appreciation limiter shares one bucket across two windows** | `src/server/actions/appreciation.ts` | Effective limits are about half the published figures. Fails safe. Fix: name the window in the bucket, as every other caller does |
| **No column-level revoke on the EXIF GPS columns** | `photograph_metadata` | Protected by query discipline only. Fix: `revoke select (exif_gps_latitude, exif_gps_longitude) on photograph_metadata from anon, authenticated;` in a new migration |
| **The in-process rate-limit fallback is per-instance** | `src/lib/rate-limit.ts` | Not a security control on its own; a serverless deployment runs many instances. It is reached only when the RPC is missing, which means the migrations have not been applied |
| **No automated dependency or secret scanning** | no CI in the repository | A vulnerable transitive dependency or a committed key would be found by a person or not at all |
| **No account-deletion path** | — | A member cannot delete their account from the UI, so the data-subject request is manual. Note that moderation history blocks a profile delete by design |
| **No two-factor authentication, and no session-revocation UI** | — | Supabase supports MFA; nothing in this app enrols or enforces it. Sign-out is local scope only |
| **No audit log for reads** | — | `moderation_actions` records decisions, not who looked at a private collection with the service role |
| **No formal review** | — | No penetration test, no third-party review, no threat model written down. This document is a self-assessment |

---

## See also

| Document | What it answers |
| --- | --- |
| [`docs/LIMITATIONS.md`](LIMITATIONS.md) | Each gap in full: why, what could go wrong, what the fix would look like |
| [`docs/DATABASE.md`](DATABASE.md) | The RLS rule for every table, and the constraints that carry product meaning |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Where authorisation lives, and the server-action order |
| [`docs/IMAGE-PIPELINE.md`](IMAGE-PIPELINE.md) | The upload controls in full |
| [`docs/ENVIRONMENT.md`](ENVIRONMENT.md) | Which variable is a secret and which is public |
| [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) | The smoke test and the rollback plan |
