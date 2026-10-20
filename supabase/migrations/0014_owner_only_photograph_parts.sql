-- =============================================================================
-- 0014 — a photograph's images and metadata are written by its owner alone
-- =============================================================================
-- 0007 let "the owner or a moderator" insert, update and delete rows in
-- photograph_images and photograph_metadata, through can_edit_photograph().
-- Nothing in the moderation tools uses that: a moderator acts on somebody
-- else's photograph by changing its status, with a reason, in the moderation
-- trail. What the policy did allow was a moderator — or an administrator —
-- deleting another member's image rows or metadata straight through the REST
-- API, which takes the photograph off its pages with no reason and no record.
--
-- The rule is now the one the product states: nobody deletes or edits another
-- member's photograph or its parts. Reading is unchanged; moderators still see
-- unpublished work through can_view_photograph(). The service role, used by the
-- server for the automated content check and auto-publishing, writes past RLS
-- as before.

create or replace function public.owns_photograph(p_photograph_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.photographs p
     where p.id = p_photograph_id
       and p.owner_id = (select auth.uid())
  )
$$;

comment on function public.owns_photograph(uuid) is
  'True when the caller owns the photograph. The write rule for its images and metadata: owner only, whatever the caller''s role.';

revoke all on function public.owns_photograph(uuid) from public;
grant execute on function public.owns_photograph(uuid) to authenticated, service_role;

drop policy if exists photograph_images_write_owner on public.photograph_images;
create policy photograph_images_write_owner
  on public.photograph_images for all
  to authenticated
  using (public.owns_photograph(photograph_id))
  with check (public.owns_photograph(photograph_id));

drop policy if exists photograph_metadata_write_owner on public.photograph_metadata;
create policy photograph_metadata_write_owner
  on public.photograph_metadata for all
  to authenticated
  using (public.owns_photograph(photograph_id))
  with check (public.owns_photograph(photograph_id));
