-- =============================================================================
-- FRAME — 0004  Collections, reports, the moderation audit trail, rate limits
-- =============================================================================
-- Tables created here: collections, collection_items, reports,
-- moderation_actions, rate_limit_hits.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- collections
-- -----------------------------------------------------------------------------
-- A member's own grouping of photographs and places — a shot list, a route, a
-- set of references. Private by default: a collection is a working document
-- before it is a publication, and the default must not be the one that leaks.
create table if not exists public.collections (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique
                        constraint collections_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  title               text not null
                        constraint collections_title_length
                        check (char_length(btrim(title)) between 1 and 120),
  description         text
                        constraint collections_description_length
                        check (char_length(description) <= 1000),

  visibility          text not null default 'private'
                        constraint collections_visibility_allowed
                        check (visibility in ('public', 'private')),

  -- set null: the cover disappears if that photograph does, the collection does
  -- not.
  cover_photograph_id uuid references public.photographs (id) on delete set null,

  -- Maintained by the recount_collection_items trigger in 0006.
  item_count          integer not null default 0
                        constraint collections_item_count_non_negative check (item_count >= 0),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.collections.visibility is
  'Private by default. A public collection is selectable by anyone; a private one only by its owner (0007).';

-- -----------------------------------------------------------------------------
-- collection_items
-- -----------------------------------------------------------------------------
-- An item is either a photograph or a place, never both and never neither.
create table if not exists public.collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  photograph_id uuid references public.photographs (id) on delete cascade,
  location_id   uuid references public.locations (id) on delete cascade,
  note          text constraint collection_items_note_length check (char_length(note) <= 500),
  added_at      timestamptz not null default now(),

  constraint collection_items_exactly_one_subject
    check (num_nonnulls(photograph_id, location_id) = 1),

  -- The same photograph, or the same place, cannot be added to one collection
  -- twice. Both constraints are partial in effect rather than in syntax: a
  -- unique index ignores rows where the indexed column is null, so the many
  -- place-items of a collection (photograph_id null) do not collide with each
  -- other, and vice versa.
  constraint collection_items_unique_photograph unique (collection_id, photograph_id),
  constraint collection_items_unique_location unique (collection_id, location_id)
);

-- -----------------------------------------------------------------------------
-- reports
-- -----------------------------------------------------------------------------
-- A member flagging something for review. The eight reasons are the
-- REPORT_REASONS list in src/types/domain.ts, in the same order.
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),

  subject_type  text not null
                  constraint reports_subject_type_allowed
                  check (subject_type in ('photograph', 'location', 'profile', 'collection')),

  -- Deliberately not a foreign key: the subject lives in one of four tables and
  -- a report must survive the thing it is about being removed, which is often
  -- the outcome of the report itself. subject_label carries a human-readable
  -- copy for exactly that case, so a moderation queue never shows a bare uuid.
  subject_id    uuid not null,
  subject_label text,

  reason        text not null
                  constraint reports_reason_allowed
                  check (reason in ('copyright', 'not-my-photograph', 'wrong-location',
                                    'privacy', 'inappropriate', 'spam', 'duplicate', 'other')),
  details       text constraint reports_details_length check (char_length(details) <= 2000),

  status        text not null default 'open'
                  constraint reports_status_allowed
                  check (status in ('open', 'reviewing', 'actioned', 'dismissed')),

  -- set null: a closed account must not erase the report queue. Null also
  -- covers a report filed without an account, which only the service role can
  -- write (see 0007).
  reported_by   uuid references public.profiles (id) on delete set null,
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles (id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reports_resolved_needs_timestamp
    check (status not in ('actioned', 'dismissed') or resolved_at is not null)
);

comment on column public.reports.subject_id is
  'Id of the reported row in whichever table subject_type names. Not a foreign key on purpose: a report outlives its subject.';

-- -----------------------------------------------------------------------------
-- moderation_actions
-- -----------------------------------------------------------------------------
-- The audit trail. Every decision a moderator records lands here, with the
-- reason the member is shown.
create table if not exists public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),

  decision     text not null
                 constraint moderation_actions_decision_allowed
                 check (decision in ('approve', 'reject', 'request_changes',
                                     'remove_content', 'suspend_account', 'dismiss')),

  subject_type text not null
                 constraint moderation_actions_subject_type_allowed
                 check (subject_type in ('photograph', 'location', 'profile',
                                         'collection', 'location_submission')),
  subject_id   uuid not null,
  reason       text constraint moderation_actions_reason_length check (char_length(reason) <= 2000),

  -- on delete restrict, not cascade or set null: an audit row with no author is
  -- not an audit row. The consequence is deliberate — a moderator's account
  -- cannot be deleted while their decisions stand, so a departing moderator is
  -- demoted to 'member' instead. ModerationAction in src/types/domain.ts
  -- requires a moderator to be present for the same reason.
  moderator_id uuid not null references public.profiles (id) on delete restrict,

  created_at   timestamptz not null default now(),

  -- The brief requires a member to be told why. 'approve' and 'dismiss' take
  -- nothing away, so they may stand alone; every decision that removes,
  -- rejects, blocks or suspends must carry its reason.
  constraint moderation_actions_negative_decision_needs_reason
    check (decision in ('approve', 'dismiss')
           or char_length(btrim(coalesce(reason, ''))) > 0)
);

comment on table public.moderation_actions is
  'Append-only audit trail. No update or delete privilege is granted to any application role (0007).';

-- -----------------------------------------------------------------------------
-- rate_limit_hits
-- -----------------------------------------------------------------------------
-- One row per accepted attempt, inside a named bucket.
--
-- bigint identity rather than a uuid: this is the highest-churn table in the
-- schema and nothing outside check_rate_limit() ever reads a row by id, so
-- there is no reason to pay 16 bytes and a random index insert for it.
create table if not exists public.rate_limit_hits (
  id         bigint generated always as identity primary key,
  bucket     text not null constraint rate_limit_hits_bucket_present check (char_length(btrim(bucket)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.rate_limit_hits is
  'Internal. No role has direct access; the only path in is check_rate_limit(), which is security definer. Buckets key on account id, never on IP address alone — an address is shared by everyone behind one carrier NAT.';
