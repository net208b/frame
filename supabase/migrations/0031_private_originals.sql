-- =============================================================================
-- FRAME — 0031  Originals in a bucket nobody can read from the outside
-- =============================================================================
-- The last item from the storage audit.
--
-- An upload's original — the file as the camera wrote it, EXIF and GPS
-- included — went into the `photographs` bucket, which is public: a public
-- bucket serves any object by its address without consulting row-level
-- security. 0026 stopped anybody listing the folders, and the application
-- deletes the original on every path out of processing, so what was left was
-- a window of seconds during which the original sat at an address made of the
-- owner's id and a random photograph id. Small, and still the one place FRAME
-- served a file it promises never to serve.
--
-- `photograph-originals` is private. The member uploads their own original
-- into it with a signed URL, as before; the server reads it back as that
-- member (or with the service role) rather than through a public address; and
-- the derivatives go to the public bucket as they always did. Nothing in this
-- bucket has a public address at all.
--
-- The application picks the bucket from the key: `<owner>/<photograph>/original`
-- goes here and every other key goes to `photographs`. So the policies below
-- mirror the public bucket's write rules — a member writes, reads and deletes
-- only inside their own prefix — and there is no read policy for anon.
-- =============================================================================

set search_path = public, extensions;

-- 52428800 is UPLOAD_POLICY.maxFileBytes (50 MiB); the four types are
-- UPLOAD_POLICY.acceptedMimeTypes. The original is the one file that arrives
-- at full size, so it is the one these limits actually bind.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photograph-originals', 'photograph-originals', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members upload only their own originals" on storage.objects;
create policy "members upload only their own originals"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photograph-originals'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Update is what an upsert needs when a retry re-sends the same original.
drop policy if exists "members replace only their own originals" on storage.objects;
create policy "members replace only their own originals"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photograph-originals'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Read is what the server uses, as the member, to process the upload — and
-- what an upsert and a delete need to see the row they act on.
drop policy if exists "members read only their own originals" on storage.objects;
create policy "members read only their own originals"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photograph-originals'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "members delete only their own originals" on storage.objects;
create policy "members delete only their own originals"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photograph-originals'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
