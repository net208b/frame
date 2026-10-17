# Database tests

`constraints.sql` asserts the guarantees FRAME makes to its members, against a
real PostgreSQL server. They are not type checks. Each one corresponds to a
promise the product makes, and each is enforced in the database rather than
only in application code, so a replayed request, a direct query or a bug in a
server action cannot route around it:

| Guarantee | Enforced by |
| --- | --- |
| One appreciation per member per photograph, reversible | `photograph_appreciations_one_per_member` unique constraint |
| The appreciation counter never drifts from its rows | `toggle_appreciation()` writes both in one statement |
| Only a published photograph can be appreciated | `toggle_appreciation()` status check |
| An anonymous caller cannot appreciate | `toggle_appreciation()` identity check on `auth.uid()` |
| A location restriction always says where the claim came from | `source` not null + `location_restrictions_source_present` |
| A collection item is exactly one photograph or one place | `collection_items_exactly_one_subject` |
| A published photograph has a rights confirmation | `photographs_publishable` |
| A negative moderation decision carries a reason | `moderation_actions_negative_decision_needs_reason` |
| A rejected location submission explains why | `location_submissions_rejection_needs_reason` |
| A suspended account records a reason | `profiles_suspension_needs_reason` |
| A new account never arrives above `member` | `handle_new_user()` |
| A requested username is sanitised, never silently reused | `handle_new_user()` + `profiles_username_format` |
| Row-level security is on for every public table | `0007_row_level_security.sql` |
| Rate limits count per bucket and per window | `check_rate_limit()` |

Every guard is paired with a **positive control** — a `test_accepts` case
proving the same path still takes good data. A suite of negative cases alone
passes just as happily against a constraint that rejects everything, so a
one-sided result is not evidence.

## Running them

```bash
supabase/tests/run.sh
```

With no arguments the script builds its own throwaway cluster under a temporary
directory, applies all seven migrations plus `seed.sql`, runs the suite, and
removes the cluster on exit. It never touches a database holding real data. It
exits non-zero if any guarantee fails, so it works in CI.

To run against an existing **empty** database instead:

```bash
DATABASE_URL=postgres://user:pass@host:5432/dbname supabase/tests/run.sh
```

The script refuses to continue if that database already has tables in `public`.

Set `PGBIN` if your PostgreSQL binaries are not on `PATH`:

```bash
PGBIN=/opt/homebrew/opt/postgresql@14/bin supabase/tests/run.sh
```

## What the run does not cover

Two shims are applied for local development, and both narrow what a green run
proves. `local-shims.sql` states this at the top of the file as well.

- **`auth.uid()` reads a session setting, not a JWT.** The suite exercises the
  identity checks inside the database functions. It does not exercise
  Supabase's own token handling, and it does not test the RLS policies from the
  `anon` and `authenticated` roles — the assertions run as the table owner,
  which bypasses RLS. The suite therefore verifies that RLS is *enabled
  everywhere*, not that every policy expression is correct. Policy behaviour
  needs a run as each role against a project with real sessions.
- **PostGIS is optional locally.** When the server has no `postgis` extension,
  `run.sh` rewrites `locations.geog` to `text`, swaps the GiST index for a
  B-tree, and loads `postgis-stubs.sql`. Real geography semantics — distance,
  `ST_DWithin`, the spatial index — are then **not** exercised. The run says so
  in its output. Verify those against a project with PostGIS enabled.

## Adding a test

Put the assertion next to the guarantee it protects, and give it a positive
control. Use `test_rejects(label, statement, expected_sqlstate)` for a guard
and `test_accepts(label, statement)` for the control. Prefer naming the
expected SQLSTATE: without it, a statement that fails for an unrelated reason —
a typo in a column name, an invalid UUID literal — counts as a pass and the
constraint is never actually tested.
