# FRAME — database

The PostgreSQL schema, the row-level security policies, the functions and the
reference data behind FRAME. This directory is the whole database: there is no
step that exists only in somebody's dashboard.

Without a Supabase project configured the application runs on the bundled demo
dataset and every write path refuses with an explanation — see `isDemoMode()`
in `src/lib/config.ts`. Everything below is for the point at which you want
real data.

## The files, in order

| File | What it does |
| --- | --- |
| `migrations/0001_extensions_and_enums.sql` | Extensions (`pgcrypto`, `citext`, `postgis`, `pg_trgm`, `unaccent`) and the canonical vocabularies, with a note on why the schema uses `text` + `check` instead of enum types |
| `migrations/0002_core_tables.sql` | `profiles`, the four gear lookup tables, `locations`, `location_restrictions`, `location_submissions` |
| `migrations/0003_photographs.sql` | `photographs`, `photograph_images`, `photograph_metadata`, `photograph_appreciations` |
| `migrations/0004_collections_and_reports.sql` | `collections`, `collection_items`, `reports`, `moderation_actions`, `rate_limit_hits` |
| `migrations/0005_indexes.sql` | Every index, each with the query it exists for |
| `migrations/0006_functions_and_triggers.sql` | `updated_at`, the derived `geog` column, profile creation on signup, the column guards, the counters, `toggle_appreciation`, `check_rate_limit`, `approve_location_submission`, `trending_score`, `is_moderator` |
| `migrations/0007_row_level_security.sql` | Grants and policies for every table |
| `migrations/0008_storage.sql` | The `photographs` storage bucket and the four `storage.objects` policies |
| `seed.sql` | Camera and lens reference data, and fifteen approved places. No profiles, no photographs, no appreciation counts |

They must run in that order: later files reference earlier tables. Every file is
written to be re-runnable — `create ... if not exists`, `create or replace`,
`drop policy if exists`, `on conflict do nothing` — so a second run adds what is
missing rather than failing halfway. One caveat that `if not exists` cannot
cover: if a table already exists with a *different* shape, the create is skipped
silently. Changing an existing column belongs in a new numbered migration, not
in an edit to one of these.

## Running it locally

```bash
npm install -g supabase          # or: brew install supabase/tap/supabase
supabase start                   # applies migrations/ then seed.sql
```

`supabase start` prints the API URL, the publishable (anon) key and the
service-role key. Put the first two in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the anon key it printed>
SUPABASE_SERVICE_ROLE_KEY=<the service_role key it printed>
```

See `docs/ENVIRONMENT.md` for the rest, including the map style URL that `/map`
needs. The service-role key is server-only; the note at the end of
`0007_row_level_security.sql` explains what it bypasses and why that matters.

To re-apply everything from scratch after editing a migration:

```bash
supabase db reset                # drops, re-runs migrations/, re-runs seed.sql
```

Local Postgres runs on port 54322, so you can also connect directly:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Running it against a hosted project

1. **Enable PostGIS first.** It is available on every project but not enabled by
   default, and `0002_core_tables.sql` fails without it because `locations.geog`
   is a `geography(Point, 4326)` column. Either:
   - Dashboard → Database → Extensions → search `postgis` → enable; or
   - SQL editor: `create extension if not exists postgis with schema extensions;`

   `0001` issues the same statement, so if you have the rights to run migrations
   as `postgres` it will enable itself. Do it by hand first if your migration
   runner uses a restricted role. `citext`, `pg_trgm` and `unaccent` are in the
   same position but are enabled by `0001` without trouble on a normal project.

2. **Link and push.**

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   `db push` applies anything in `migrations/` the project has not seen. It does
   **not** run `seed.sql`; that is a local-development convenience. To load the
   reference data into a hosted project, paste `seed.sql` into the SQL editor or
   run it with `psql` against the connection string from Project Settings →
   Database. It is safe to run more than once.

3. **Check `major_version` in `config.toml`** matches the hosted project's
   Postgres version before pushing, or the shadow database used to verify the
   diff will not match the real one.

## The storage bucket

`migrations/0008_storage.sql` creates it and `0026` corrects it, so there is
no manual step: a `supabase db push` or a `supabase db reset` produces the
bucket and its four policies. The local stack also declares it in `config.toml`
(`[storage.buckets.photographs]`); keep the two in step. What follows is what
0008 does and why, not something to run by hand.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photographs', 'photographs', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;
```

`52428800` is `UPLOAD_POLICY.maxFileBytes` (50 MiB) from `src/lib/config.ts`;
0008 wrote 25 MiB and 0026 raised it to match.
Then allow a member to write only inside their own prefix — storage keys are
`<owner_id>/<photograph_id>/<variant>.webp`, per `storageKeys()` in
`src/lib/images/variants.ts`:

```sql
-- 0026. A public bucket serves files without consulting RLS, so this policy
-- only governs listing and authenticated download — a member's own folder.
create policy "members read only their own objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photographs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "members write only their own prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photographs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "members replace or remove only their own objects"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photographs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members delete only their own objects"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photographs' and (storage.foldername(name))[1] = auth.uid()::text);
```

The bucket is public because every derivative is served directly to a browser
from a public photograph page. Being public, it serves any object by its
address whatever the policies say — which is why the read policy no longer
lets anybody list other members' folders (0026), why a moderator's removal
deletes the photograph's files rather than only hiding the row, and why an
upload's original never comes here at all: since 0031 it goes to the private
`photograph-originals` bucket, is read back through the member's own session,
and is deleted on every path out of processing. If the
project is configured for R2 instead (`STORAGE_PROVIDER=r2`), none of this
applies and the bucket lives there — the swap is meant to be a configuration
change, which is what `StorageDriver` in `@/lib/storage` is for.

## Regenerating the TypeScript types

```bash
# local stack
supabase gen types typescript --local > src/types/supabase.ts

# hosted project
supabase gen types typescript --project-id <your-project-ref> \
  --schema public > src/types/supabase.ts
```

These generated types describe the *database*. They are not the domain types:
`src/types/domain.ts` is hand-written, is the contract the UI depends on, and
must not be replaced by generated output. The repository layer maps one to the
other, which is exactly what lets the demo dataset and the live queries satisfy
the same interface.

Re-run the generator after any migration that changes a column.

## The first moderator

There is no code path that grants a role above `member` —
`handle_new_user()` always inserts `'member'`, and
`profiles_guard_privileged_columns()` refuses a self-promotion even for an
admin. Promote the first moderator by hand, as `postgres`, from the SQL editor
or `psql`:

```sql
update public.profiles set role = 'moderator' where username = 'your_username';
```

`auth.uid()` is null in that session, so the guard trigger lets it through and
the change is attributable to whoever holds the database credentials. After
that, an admin can promote other people through the application.

## Things worth knowing before you write a query

- **Status, not deletion.** A photograph, a place or a report is withdrawn by
  changing `status`, and most tables grant no `delete` at all. `photographs`
  and `collections` are the exceptions: an owner may delete their own.
- **`moderation_actions` is append-only.** No update or delete privilege is
  granted to any application role. Correct a wrong decision by recording the
  new one.
- **Counters are recounted, never incremented.** `locations.photograph_count`,
  `collections.item_count` and `photographs.appreciation_count` are all derived
  from a `count(*)` over the rows they summarise, by triggers in `0006`. There
  is no `+ 1` anywhere in this schema, so a missed or replayed request cannot
  bend a number permanently.
- **Publishing requires a rights confirmation.** The
  `photographs_publishable` constraint refuses `status = 'published'` without
  `published_at`, `rights_confirmed_at`, `category`, `image_width` and
  `image_height`. The minimum row needed to insert a draft is therefore
  `owner_id`, `slug`, `title` and `alt_text` — note that `alt_text` is required
  from the very first insert, so the upload wizard has to collect it before it
  creates the row.
- **`approve_location_submission()` is the only way to approve a place.** A bare
  `update location_submissions set status = 'approved'` fails the
  `location_submissions_approved_needs_location` constraint, which is
  deliberate: approving without creating the location is a half-finished
  decision. The same applies to `reports`: `actioned` and `dismissed` require
  `resolved_at`.
- **Negative outcomes require a reason.** A rejected or changes-requested
  submission needs `rejection_reason`; a removed photograph needs
  `removed_reason`; a suspended profile needs `suspended_reason`; a negative
  `moderation_actions` decision needs `reason`. All four are database
  constraints, because "we told them why" is a promise the product makes.
- **EXIF GPS is stored, never published.** `photograph_metadata` holds
  `exif_gps_latitude`, `exif_gps_longitude` and `exif_gps_consent`. The columns
  exist so a member can be asked and so a moderator can check a disputed
  location. A public payload must never select them.
- **Coordinate precision only ever narrows.** Read a location's coordinate
  through `publishableCoordinates()`; `is_sensitive` and
  `withhold_coordinates` are moderator decisions, and nothing in the read path
  may widen what they reduced.
- **Keyset pagination.** The indexes in `0005` carry the tiebreaking `id`
  alongside the ordering column so `where (published_at, id) < (:a, :b)` can be
  answered from the index. Large `offset` values will work and will get slower.
- **`sort=trending` cannot be indexed.** The score decays with the clock, so the
  ordering of two unchanged rows changes over time. Read a bounded recent
  window and rank that. `public.trending_score()` is the same formula as
  `trendingScore()` in `src/lib/ranking.ts`; if one changes, both change.
