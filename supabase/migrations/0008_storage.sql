-- =========================================================================
-- Supabase Storage: the photographs bucket and who may write into it.
--
-- This existed only as a block of SQL in supabase/README.md, applied by hand
-- once per project. That made migrations/ an incomplete description of the
-- database: a fresh project, or a `supabase db reset`, came up with no bucket
-- and no policies, and uploads then failed at runtime rather than at build
-- time — the Supabase storage driver uses the cookie-bound client, so a
-- missing insert policy reads as a row-level security refusal, not a
-- configuration error. Hence this file.
--
-- It is written to be applied to a project that already has all of it,
-- because the live project does: the bucket insert yields on conflict, and
-- each policy is dropped before it is created. `supabase db push` is
-- therefore a no-op in effect there, while still recording 0008 in the
-- migration history.
--
-- The local stack builds the same bucket from config.toml
-- (`[storage.buckets.photographs]`); keep the two in step.
-- =========================================================================

-- 26214400 is UPLOAD_POLICY.maxFileBytes (25 MiB) in src/lib/config.ts, and
-- the MIME list mirrors UPLOAD_POLICY.acceptedMimeTypes. Both are a second
-- line of defence only: the bytes that arrive are checked against their magic
-- numbers by verifyImageBytes() before any derivative is attached.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photographs', 'photographs', true, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- The bucket is public-read because every derivative is served straight to a
-- browser from a public photograph page, and signing each grid image would put
-- a round trip in front of every card. Only derivatives are ever linked; the
-- original sits under the same prefix and no UI path points at it.
drop policy if exists "photographs are publicly readable" on storage.objects;
create policy "photographs are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'photographs');

-- Write access is the first path segment and nothing else. Storage keys are
-- `<owner_id>/<photograph_id>/<variant>`, built only by storageKeys() in
-- src/lib/images/variants.ts, so comparing folder one against auth.uid() is
-- the whole rule: a member may write inside their own prefix and nowhere else.
-- The sign endpoint refuses the same keys for the same reason, and this is the
-- half that a direct call to the Storage API cannot route around.
drop policy if exists "members write only their own prefix" on storage.objects;
create policy "members write only their own prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photographs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members replace or remove only their own objects" on storage.objects;
create policy "members replace or remove only their own objects"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photographs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members delete only their own objects" on storage.objects;
create policy "members delete only their own objects"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photographs' and (storage.foldername(name))[1] = auth.uid()::text);
