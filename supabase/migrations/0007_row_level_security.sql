-- =============================================================================
-- FRAME — 0007  Row-level security
-- =============================================================================
-- Authorisation lives here, on the server, in the database, and is checked on
-- every single statement. Hiding a control in the UI is not a permission check:
-- a hidden button is one fetch() away from being pressed anyway. Everything the
-- product promises about who can see and change what has to be true at this
-- layer or it is not true at all.
--
-- How to read this file:
--
--   * RLS is enabled on every table, including the gear lookup tables. No table
--     is left readable by default.
--   * Every table then gets explicit policies. A table with RLS on and no
--     policy denies everything, which is the correct default for
--     rate_limit_hits and wrong for everything else.
--   * Coarse grants come first, as an outer gate: a role with no INSERT
--     privilege on a table cannot be let in by a policy, and a reviewer can see
--     the shape of the thing before reading thirty policies.
--   * auth.uid() is wrapped in a scalar subquery — `(select auth.uid())` —
--     throughout. Postgres then evaluates it once per statement instead of once
--     per row, which on a 24-image gallery page is the difference between one
--     call and two dozen.
--   * `public.is_moderator()` is the moderator test everywhere. It is defined
--     in 0006, reads the caller's own profile row, and returns false for a
--     suspended account.
-- =============================================================================

set search_path = public, extensions;

do $guard$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception
      'These policies target a Supabase database: the roles anon, authenticated and service_role must exist. See supabase/README.md.';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.profiles                 enable row level security;
alter table public.camera_brands            enable row level security;
alter table public.camera_models            enable row level security;
alter table public.lens_brands              enable row level security;
alter table public.lens_models              enable row level security;
alter table public.locations                enable row level security;
alter table public.location_restrictions    enable row level security;
alter table public.location_submissions     enable row level security;
alter table public.photographs              enable row level security;
alter table public.photograph_images        enable row level security;
alter table public.photograph_metadata      enable row level security;
alter table public.photograph_appreciations enable row level security;
alter table public.collections              enable row level security;
alter table public.collection_items         enable row level security;
alter table public.reports                  enable row level security;
alter table public.moderation_actions       enable row level security;
alter table public.rate_limit_hits          enable row level security;

-- -----------------------------------------------------------------------------
-- Table privileges — the outer gate
-- -----------------------------------------------------------------------------
-- Revoked first, then granted back deliberately, so this block is the whole
-- truth about what each role may attempt rather than an addition to whatever a
-- default grant left behind.
--
-- Note that a moderator uses the same `authenticated` role as everybody else —
-- there is no separate database role for moderation. That is why tables only
-- moderators may write still grant INSERT and UPDATE to `authenticated`: the
-- distinction is made by the policies, which can read the caller's profile,
-- and not by the grant, which cannot.

revoke all on table
  public.profiles, public.camera_brands, public.camera_models, public.lens_brands,
  public.lens_models, public.locations, public.location_restrictions,
  public.location_submissions, public.photographs, public.photograph_images,
  public.photograph_metadata, public.photograph_appreciations, public.collections,
  public.collection_items, public.reports, public.moderation_actions,
  public.rate_limit_hits
  from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Signed-out visitors read the public site and nothing else. They write
-- nowhere: there is no anonymous appreciation, no anonymous report, no
-- anonymous anything.
grant select on table
  public.profiles, public.camera_brands, public.camera_models, public.lens_brands,
  public.lens_models, public.locations, public.location_restrictions,
  public.photographs, public.photograph_images, public.photograph_metadata,
  public.collections, public.collection_items
  to anon;

grant select on table
  public.profiles, public.camera_brands, public.camera_models, public.lens_brands,
  public.lens_models, public.locations, public.location_restrictions,
  public.location_submissions, public.photographs, public.photograph_images,
  public.photograph_metadata, public.photograph_appreciations, public.collections,
  public.collection_items, public.reports, public.moderation_actions
  to authenticated;

grant insert on table
  public.camera_brands, public.camera_models, public.lens_brands, public.lens_models,
  public.locations, public.location_restrictions, public.location_submissions,
  public.photographs, public.photograph_images, public.photograph_metadata,
  public.photograph_appreciations, public.collections, public.collection_items,
  public.reports, public.moderation_actions
  to authenticated;

grant update on table
  public.profiles, public.camera_brands, public.camera_models, public.lens_brands,
  public.lens_models, public.locations, public.location_restrictions,
  public.location_submissions, public.photographs, public.photograph_images,
  public.photograph_metadata, public.collections, public.collection_items,
  public.reports
  to authenticated;

-- DELETE is granted only where a row is genuinely meant to disappear. A
-- photograph, a place, a report and a moderation decision are all withdrawn by
-- changing status instead, so the history survives the withdrawal.
grant delete on table
  public.camera_brands, public.camera_models, public.lens_brands, public.lens_models,
  public.location_restrictions, public.photographs, public.photograph_images,
  public.photograph_metadata, public.photograph_appreciations, public.collections,
  public.collection_items
  to authenticated;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- A suspended profile disappears from the public site, but stays visible to its
-- owner — who has to be able to read the reason they were given — and to
-- moderators.
drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible
  on public.profiles for select
  to anon, authenticated
  using (
    is_suspended = false
    or id = (select auth.uid())
    or public.is_moderator()
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_moderator on public.profiles;
create policy profiles_update_moderator
  on public.profiles for update
  to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- No INSERT policy, deliberately: the row is created by handle_new_user() when
-- the account is created, and that is the only way a profile should ever come
-- into existence. No DELETE policy either — deleting the auth.users row
-- cascades, and that is the only supported way to remove a member.
--
-- The UPDATE policies above let a member write their own row, which includes
-- the role and is_suspended columns. The profiles_guard_privileged_columns
-- trigger in 0006 is what stops them; the reasoning for choosing a trigger over
-- a column-level REVOKE is written out there.

-- -----------------------------------------------------------------------------
-- Gear reference data
-- -----------------------------------------------------------------------------
-- Readable by everyone, because the Discover filters are public. Writable by
-- moderators only, because these tables are the canonical vocabulary behind the
-- facet counts — a member whose camera is not listed records it in the
-- *_text columns on photograph_metadata instead, and loses nothing.
drop policy if exists camera_brands_select_all on public.camera_brands;
create policy camera_brands_select_all
  on public.camera_brands for select to anon, authenticated using (true);

drop policy if exists camera_brands_write_moderator on public.camera_brands;
create policy camera_brands_write_moderator
  on public.camera_brands for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists camera_models_select_all on public.camera_models;
create policy camera_models_select_all
  on public.camera_models for select to anon, authenticated using (true);

drop policy if exists camera_models_write_moderator on public.camera_models;
create policy camera_models_write_moderator
  on public.camera_models for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists lens_brands_select_all on public.lens_brands;
create policy lens_brands_select_all
  on public.lens_brands for select to anon, authenticated using (true);

drop policy if exists lens_brands_write_moderator on public.lens_brands;
create policy lens_brands_write_moderator
  on public.lens_brands for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists lens_models_select_all on public.lens_models;
create policy lens_models_select_all
  on public.lens_models for select to anon, authenticated using (true);

drop policy if exists lens_models_write_moderator on public.lens_models;
create policy lens_models_write_moderator
  on public.lens_models for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
drop policy if exists locations_select_approved on public.locations;
create policy locations_select_approved
  on public.locations for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists locations_select_moderator on public.locations;
create policy locations_select_moderator
  on public.locations for select
  to authenticated
  using (public.is_moderator());

-- Members do not insert here. A place enters the map through
-- location_submissions and a human decision, because a coordinate is a
-- privacy decision about somewhere real and nothing automatic can make it.
drop policy if exists locations_insert_moderator on public.locations;
create policy locations_insert_moderator
  on public.locations for insert
  to authenticated
  with check (public.is_moderator());

drop policy if exists locations_update_moderator on public.locations;
create policy locations_update_moderator
  on public.locations for update
  to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- No DELETE policy and no DELETE grant: a place that should not be on the map
-- gets status 'rejected', which keeps the row, the submission that produced it
-- and the moderation_actions entry that explains it.

-- -----------------------------------------------------------------------------
-- location_restrictions
-- -----------------------------------------------------------------------------
-- A restriction is visible exactly when its place is.
drop policy if exists location_restrictions_select_with_location on public.location_restrictions;
create policy location_restrictions_select_with_location
  on public.location_restrictions for select
  to anon, authenticated
  using (public.can_view_location(location_id));

drop policy if exists location_restrictions_write_moderator on public.location_restrictions;
create policy location_restrictions_write_moderator
  on public.location_restrictions for all
  to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- -----------------------------------------------------------------------------
-- location_submissions
-- -----------------------------------------------------------------------------
drop policy if exists location_submissions_insert_own on public.location_submissions;
create policy location_submissions_insert_own
  on public.location_submissions for insert
  to authenticated
  with check (submitted_by = (select auth.uid()));

drop policy if exists location_submissions_select_own on public.location_submissions;
create policy location_submissions_select_own
  on public.location_submissions for select
  to authenticated
  using (submitted_by = (select auth.uid()));

drop policy if exists location_submissions_select_moderator on public.location_submissions;
create policy location_submissions_select_moderator
  on public.location_submissions for select
  to authenticated
  using (public.is_moderator());

drop policy if exists location_submissions_update_moderator on public.location_submissions;
create policy location_submissions_update_moderator
  on public.location_submissions for update
  to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- A member cannot edit a submission after sending it, which is why
-- 'changes_requested' exists as an outcome: the member reads the reason and
-- sends a new one, and both attempts stay on the record.

-- -----------------------------------------------------------------------------
-- photographs
-- -----------------------------------------------------------------------------
drop policy if exists photographs_select_published on public.photographs;
create policy photographs_select_published
  on public.photographs for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists photographs_select_own on public.photographs;
create policy photographs_select_own
  on public.photographs for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists photographs_select_moderator on public.photographs;
create policy photographs_select_moderator
  on public.photographs for select
  to authenticated
  using (public.is_moderator());

drop policy if exists photographs_insert_own on public.photographs;
create policy photographs_insert_own
  on public.photographs for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists photographs_update_own on public.photographs;
create policy photographs_update_own
  on public.photographs for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists photographs_update_moderator on public.photographs;
create policy photographs_update_moderator
  on public.photographs for update
  to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

drop policy if exists photographs_delete_own on public.photographs;
create policy photographs_delete_own
  on public.photographs for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Note what the insert policy does *not* check: it does not stop a member
-- inserting a row with status 'published'. It does not need to. The
-- photographs_publishable constraint in 0003 means such a row must already
-- carry a rights confirmation and a publication timestamp, and the
-- photographs_guard_privileged_columns trigger in 0006 stops the owner setting
-- editors_pick or appreciation_count at any point. A moderator's extra power is
-- narrow and explicit: the moderator UPDATE policy, plus the trigger letting
-- them through on those two columns.

-- -----------------------------------------------------------------------------
-- photograph_images, photograph_metadata
-- -----------------------------------------------------------------------------
-- Both are visible exactly when their parent photograph is, and writable by the
-- owner or a moderator. can_view_photograph() and can_edit_photograph() are
-- defined in 0006 so the rule is written once.
drop policy if exists photograph_images_select_with_parent on public.photograph_images;
create policy photograph_images_select_with_parent
  on public.photograph_images for select
  to anon, authenticated
  using (public.can_view_photograph(photograph_id));

drop policy if exists photograph_images_write_owner on public.photograph_images;
create policy photograph_images_write_owner
  on public.photograph_images for all
  to authenticated
  using (public.can_edit_photograph(photograph_id))
  with check (public.can_edit_photograph(photograph_id));

drop policy if exists photograph_metadata_select_with_parent on public.photograph_metadata;
create policy photograph_metadata_select_with_parent
  on public.photograph_metadata for select
  to anon, authenticated
  using (public.can_view_photograph(photograph_id));

drop policy if exists photograph_metadata_write_owner on public.photograph_metadata;
create policy photograph_metadata_write_owner
  on public.photograph_metadata for all
  to authenticated
  using (public.can_edit_photograph(photograph_id))
  with check (public.can_edit_photograph(photograph_id));

-- A consequence worth stating: photograph_metadata holds exif_gps_latitude and
-- exif_gps_longitude, so a published photograph's metadata row is readable by
-- anyone. The repository must never select those two columns into a public
-- payload. They exist for the owner's own upload form and for a moderator
-- reviewing a disputed location; publishing them would be exactly the harm the
-- coordinate-privacy policy was written to prevent. A column-level revoke is
-- the obvious hardening here and is listed as a follow-up.

-- -----------------------------------------------------------------------------
-- photograph_appreciations
-- -----------------------------------------------------------------------------
-- A member may read only their own appreciations. Aggregate counts come from
-- photographs.appreciation_count, which toggle_appreciation() and the
-- recount_photograph_appreciations trigger keep equal to the number of rows, so
-- nobody needs to read these rows to render a number — and therefore nobody
-- can enumerate who appreciated what. That matters more than it sounds: the
-- list of photographs a named person has appreciated is a map of their taste,
-- their city and often their movements.
drop policy if exists photograph_appreciations_select_own on public.photograph_appreciations;
create policy photograph_appreciations_select_own
  on public.photograph_appreciations for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Moderators can read them, because the burst check in src/lib/ranking.ts is a
-- review signal a human has to be able to look at. It is the narrowest
-- exception that makes abuse investigable.
drop policy if exists photograph_appreciations_select_moderator on public.photograph_appreciations;
create policy photograph_appreciations_select_moderator
  on public.photograph_appreciations for select
  to authenticated
  using (public.is_moderator());

-- Insert and delete are allowed directly, not only through
-- toggle_appreciation(). That is what keeps a PostgREST client honest without
-- an RPC, and the recount_photograph_appreciations trigger in 0006 makes sure
-- the summary on photographs follows either path.
drop policy if exists photograph_appreciations_insert_own on public.photograph_appreciations;
create policy photograph_appreciations_insert_own
  on public.photograph_appreciations for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists photograph_appreciations_delete_own on public.photograph_appreciations;
create policy photograph_appreciations_delete_own
  on public.photograph_appreciations for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- No UPDATE policy and no UPDATE grant. An appreciation is created or removed;
-- there is nothing in it to edit, and allowing an edit would let one member's
-- row be pointed at another member.

-- -----------------------------------------------------------------------------
-- collections, collection_items
-- -----------------------------------------------------------------------------
drop policy if exists collections_select_public_or_own on public.collections;
create policy collections_select_public_or_own
  on public.collections for select
  to anon, authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists collections_insert_own on public.collections;
create policy collections_insert_own
  on public.collections for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists collections_update_own on public.collections;
create policy collections_update_own
  on public.collections for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists collections_delete_own on public.collections;
create policy collections_delete_own
  on public.collections for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Moderators are deliberately not given a view of private collections. A
-- private collection is a working document — a shot list, a route, somewhere
-- someone is planning to be — and a report can only ever be filed about a
-- collection that is public, which a moderator can already read. If a private
-- collection ever needs reviewing, that is a service-role operation someone has
-- to decide to perform, not a standing permission.

drop policy if exists collection_items_select_with_collection on public.collection_items;
create policy collection_items_select_with_collection
  on public.collection_items for select
  to anon, authenticated
  using (public.can_view_collection(collection_id));

drop policy if exists collection_items_write_owner on public.collection_items;
create policy collection_items_write_owner
  on public.collection_items for all
  to authenticated
  using (public.owns_collection(collection_id))
  with check (public.owns_collection(collection_id));

-- An item in a public collection can point at a photograph that is not
-- published, and its row is then readable while the photograph itself is not.
-- Only the id leaks, never the image or its title: the photographs policies
-- still apply to the join, which simply returns nothing. The repository must
-- therefore treat a collection item with no joined photograph as absent rather
-- than rendering an empty card.

-- -----------------------------------------------------------------------------
-- reports
-- -----------------------------------------------------------------------------
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
  on public.reports for insert
  to authenticated
  with check (reported_by = (select auth.uid()));

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own
  on public.reports for select
  to authenticated
  using (reported_by = (select auth.uid()));

drop policy if exists reports_select_moderator on public.reports;
create policy reports_select_moderator
  on public.reports for select
  to authenticated
  using (public.is_moderator());

drop policy if exists reports_update_moderator on public.reports;
create policy reports_update_moderator
  on public.reports for update
  to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

-- Reporting requires an account. Report.reportedBy in src/types/domain.ts is
-- nullable to describe a report filed without one, which only the service role
-- can write — and a signed-out report form is not shipped, because an anonymous
-- write endpoint on a moderation queue is a denial-of-service waiting to be
-- found. See docs/LIMITATIONS.md.

-- -----------------------------------------------------------------------------
-- moderation_actions
-- -----------------------------------------------------------------------------
drop policy if exists moderation_actions_select_moderator on public.moderation_actions;
create policy moderation_actions_select_moderator
  on public.moderation_actions for select
  to authenticated
  using (public.is_moderator());

-- A moderator may only sign their own decisions. Without the second clause, one
-- moderator could write an audit row under another's name, which would make the
-- audit trail worse than no audit trail.
drop policy if exists moderation_actions_insert_moderator on public.moderation_actions;
create policy moderation_actions_insert_moderator
  on public.moderation_actions for insert
  to authenticated
  with check (public.is_moderator() and moderator_id = (select auth.uid()));

-- No UPDATE or DELETE policy, and no grant for either: the trail is
-- append-only. A decision that turns out to be wrong is corrected by recording
-- the new decision, not by editing the old one.

-- -----------------------------------------------------------------------------
-- rate_limit_hits
-- -----------------------------------------------------------------------------
-- RLS is enabled and there is no policy at all, which denies everything to
-- anon and authenticated. Combined with the revoked grants above, there is no
-- direct access to this table from any client: the only way in is
-- check_rate_limit(), which is SECURITY DEFINER. That is the point — a client
-- that could delete its own hits could reset its own rate limit.

-- =============================================================================
-- One thing a reader must leave this file knowing
-- =============================================================================
-- The service-role key bypasses every policy written above. All of it: the
-- published-only filter on photographs, the owner checks, the moderator checks,
-- the privacy rule on appreciations, the whole file. It is the key that answers
-- "what if we need to fix this from a script", and it is therefore the key that
-- answers "what if it leaks".
--
-- So it never reaches a browser. Not in a NEXT_PUBLIC_ variable, not in a
-- client component, not in a fetch from the client, not in an error message.
-- @/lib/supabase/admin exists to create a service-role client and is written to
-- throw if it is ever evaluated in a browser bundle. Anything running as the
-- service role must do its own authorisation first, in code, because the
-- database will not do it for them.
