-- =============================================================================
-- FRAME — 0032  A word from the admin, and who may sign in to the console
-- =============================================================================
-- Two small things the admin console needs.
--
-- 1. A NOTICE TO A MEMBER. "Request changes" has existed since 0012 and never
--    reached the member: the reason went to moderation_actions, which members
--    cannot read, so the photograph simply stayed unpublished with no word why.
--    send_admin_notice() writes a notification the member will see, with the
--    message itself — notifications gain a `message` column for it — and a
--    link to the photograph it is about. Staff only, and only about the
--    member's own photograph: a notice is not a way to message anybody about
--    anything.
--
-- 2. WHICH EMAIL MAY ASK FOR A SIGN-IN CODE. The console signs its admin in
--    with a one-time code sent by email. Before a code is sent the server asks
--    this function whether the address belongs to an admin account — and
--    sends nothing otherwise, saying nothing either way. Executable by the
--    service role only: it reads auth.users, which no public role may.
-- =============================================================================

set search_path = public, extensions;

alter table public.notifications
  add column if not exists message text
    constraint notifications_message_length check (message is null or char_length(message) <= 600);

alter table public.notifications
  drop constraint if exists notifications_kind_allowed,
  add constraint notifications_kind_allowed
    check (kind in ('comment', 'reply', 'appreciation', 'follow', 'photograph_published',
                    'challenge_award', 'editors_pick', 'featured', 'admin_notice'));

-- A notification's message is part of what it said: the read-only guard from
-- 0023 pins it along with the rest.
create or replace function public.notifications_read_only_read_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_id <> old.recipient_id or new.kind <> old.kind
     or new.actor_id is distinct from old.actor_id
     or new.subject_type <> old.subject_type or new.subject_id <> old.subject_id
     or new.subject_label <> old.subject_label
     or new.subject_slug is distinct from old.subject_slug
     or new.message is distinct from old.message
     or new.created_at <> old.created_at then
    raise exception 'A notification''s contents do not change.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.send_admin_notice(p_photograph_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_photo   public.photographs;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.is_moderator() then
    raise exception 'Only staff send a notice.' using errcode = '42501';
  end if;
  if v_message is null then
    raise exception 'Write the member something.' using errcode = '22023';
  end if;

  select * into v_photo from public.photographs p where p.id = p_photograph_id;
  if not found then
    raise exception 'No such photograph.' using errcode = 'P0002';
  end if;

  insert into public.notifications
    (recipient_id, kind, actor_id, subject_type, subject_id, subject_label, subject_slug, message)
  values
    (v_photo.owner_id, 'admin_notice', v_me, 'photograph', v_photo.id,
     left(coalesce(nullif(btrim(v_photo.title), ''), 'Untitled'), 200), left(v_photo.slug, 200),
     left(v_message, 600));
end;
$$;

create or replace function public.admin_email_is_staff(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(u.email) = lower(btrim(coalesce(p_email, '')))
       and p.role = 'admin'
       and not p.is_suspended
  );
$$;

revoke all on function public.send_admin_notice(uuid, text) from public, anon;
grant execute on function public.send_admin_notice(uuid, text) to authenticated;

revoke all on function public.admin_email_is_staff(text) from public, anon, authenticated;
grant execute on function public.admin_email_is_staff(text) to service_role;
