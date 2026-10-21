-- =============================================================================
-- FRAME — 0026  Nobody lists the bucket, and the last default grant goes
-- =============================================================================
-- From the audit of storage, views and sequences.
--
-- 1. THE READ POLICY MADE EVERY OBJECT NAME LISTABLE.
--
--    0008 made the bucket public-read and justified the original sitting under
--    the same prefix with "only derivatives are ever linked ... no UI path
--    points at it". That held for links. It did not hold for listing: the read
--    policy granted SELECT on every object in the bucket to anon, and the
--    Storage API's list endpoint is governed by exactly that policy. So the
--    names in a member's folder — photograph ids of drafts, of uploads a
--    moderator refused, and of an original still waiting to be processed —
--    were one request away for anybody, and with them the addresses.
--
--    A public bucket does not need a read policy to serve its files: the
--    public download endpoint does not consult row-level security at all, so
--    every photograph page, every grid card and next/image keep working. What
--    the policy was actually still doing was answering list and authenticated
--    download calls — and the only caller that needs those is a member looking
--    at their own folder (the storage driver's delete runs its verification
--    with the service role, which RLS does not filter). Reads are narrowed to
--    exactly that.
--
--    The original itself still passes through this public bucket while it is
--    processed; the application now deletes it on every failed path as well as
--    the successful one. Moving originals into a private bucket is the
--    complete fix, and it is a change to the upload pipeline, not to policy.
--
-- 2. THE BUCKET'S SIZE LIMIT HAD DRIFTED FROM THE APPLICATION'S.
--
--    UPLOAD_POLICY.maxFileBytes went to 50 MiB and production's bucket was
--    raised by hand to match; 0008, config.toml and the test asserting them
--    all still said 25 MiB. A project built from these migrations would have
--    refused every file between the two at the storage provider, after the
--    application had told the member it was fine. One value, in every place.
--
-- 3. THE ONE SEQUENCE STILL HAD THE DEFAULT GRANT.
--
--    rate_limit_hits_id_seq arrived, like every table and function here, with
--    USAGE, SELECT and UPDATE for anon and authenticated. PostgREST does not
--    expose sequence functions, so nothing reached it — but it is only ever
--    advanced inside check_rate_limit(), which runs as its owner, and a grant
--    nobody needs is a grant to remove.
-- =============================================================================

set search_path = public, extensions;

drop policy if exists "photographs are publicly readable" on storage.objects;
drop policy if exists "members read only their own objects" on storage.objects;
create policy "members read only their own objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photographs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 52428800 is UPLOAD_POLICY.maxFileBytes (50 MiB) in src/lib/config.ts.
update storage.buckets set file_size_limit = 52428800 where id = 'photographs';

revoke all on sequence public.rate_limit_hits_id_seq from anon, authenticated;
