-- =============================================================================
-- FRAME — 0025  A way back for a hidden comment, and EXECUTE that means it
-- =============================================================================
-- Two pieces of unfinished work, both found while auditing production.
--
-- 1. HIDING A COMMENT HAD NO UNDO.
--
--    Migration 0022 let the photograph's owner and moderators hide a comment
--    and offered nothing to reverse it, so a mis-tap or a decision reconsidered
--    could only be undone with SQL. unhide_comment() is that reversal, with one
--    rule that matters: a photographer may restore only a comment THEY hid. A
--    moderator's hide is a moderation decision, and the owner of the photograph
--    it sits under does not get to overrule it from their own page. A
--    moderator's restore is written to moderation_actions, as their hide was.
--
-- 2. EVERY FUNCTION IN THIS SCHEMA WAS EXECUTABLE BY anon.
--
--    The schema's default privileges grant EXECUTE on every new function to
--    anon and authenticated directly. `revoke all on function ... from public`
--    — which earlier migrations used — does not touch a grant held directly by
--    a role, so the revokes those migrations wrote did nothing.
--
--    Most of the functions this exposed refuse a caller who is not signed in,
--    and 0024 closed the one that did not. Two more are worse than "open":
--
--    * record_notification() is the helper the notification triggers call. It
--      checks nothing about its caller — it was never meant to have one — so
--      with EXECUTE it was a way to write a notification into any member's
--      list, with any wording, past the rule 0023 states ("written ONLY by
--      triggers"). The triggers that use it are SECURITY DEFINER and run as
--      the owner, so taking EXECUTE from both public roles changes nothing for
--      them.
--
--    * check_rate_limit() takes its bucket name as an argument. Callable from
--      the browser, it let anybody record hits against any bucket — including
--      the ones keyed on another member's id, which would rate-limit that
--      member out of commenting, appreciating or following. The application
--      now calls it with the service-role key, so the bucket is only ever one
--      the server chose, and the public roles lose EXECUTE.
--
--    The remaining writes (toggles, account changes, comment moderation,
--    notification reads) already refuse a null caller in their own bodies;
--    taking EXECUTE from anon means an anonymous request is refused before the
--    function runs at all, rather than inside it.
--
--    Deliberately left executable by anon: bump_photobook_opens and
--    bump_series_opens (the public pages count their own opens),
--    appreciation_count_of (a count of public rows), and the can_view_* /
--    owns_* / is_* predicates, which row-level security policies call while a
--    signed-out visitor reads the site.
-- =============================================================================

set search_path = public, extensions;

/* ------------------------------------------------------------------------ */
/* 1. unhide_comment                                                          */
/* ------------------------------------------------------------------------ */

create or replace function public.unhide_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := (select auth.uid());
  v_owner     uuid;
  v_hidden_by uuid;
  v_hidden_at timestamptz;
  v_moderator boolean;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select p.owner_id, c.hidden_by, c.hidden_at
    into v_owner, v_hidden_by, v_hidden_at
    from public.photograph_comments c
    join public.photographs p on p.id = c.photograph_id
   where c.id = p_id;

  if v_owner is null then
    raise exception 'No such comment.' using errcode = 'P0002';
  end if;
  if v_hidden_at is null then
    return;  -- already visible; restoring it again is not an error
  end if;

  v_moderator := public.is_moderator();

  -- A moderator may restore anything. The photographer may restore only what
  -- they hid themselves: a moderator's decision is not theirs to reverse.
  if not v_moderator and not (v_me = v_owner and v_hidden_by = v_me) then
    raise exception 'Only a moderator, or the photographer who hid it, may restore this comment.'
      using errcode = '42501';
  end if;

  update public.photograph_comments
     set hidden_at = null, hidden_by = null, hidden_reason = null
   where id = p_id;

  if v_moderator and v_me <> v_owner then
    insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
    values ('approve', 'comment', p_id, 'Comment restored.', v_me);
  end if;
end;
$$;

/* ------------------------------------------------------------------------ */
/* 2. EXECUTE, granted on purpose                                             */
/* ------------------------------------------------------------------------ */

-- Internal helpers: no public role calls these.
revoke all on function public.record_notification(uuid, text, uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Writes a signed-in member makes. Each refuses a null caller in its own body
-- as well; this makes an anonymous request fail before the body runs.
revoke all on function public.set_member_role(text, text)        from public, anon;
revoke all on function public.change_username(text)              from public, anon;
revoke all on function public.delete_own_account(text)           from public, anon;
revoke all on function public.toggle_appreciation(uuid)          from public, anon;
revoke all on function public.toggle_follow(uuid)                from public, anon;
revoke all on function public.delete_comment(uuid)               from public, anon;
revoke all on function public.hide_comment(uuid, text)           from public, anon;
revoke all on function public.unhide_comment(uuid)               from public, anon;
revoke all on function public.mark_notifications_read(uuid[])    from public, anon;

grant execute on function public.set_member_role(text, text)     to authenticated;
grant execute on function public.change_username(text)           to authenticated;
grant execute on function public.delete_own_account(text)        to authenticated;
grant execute on function public.toggle_appreciation(uuid)       to authenticated;
grant execute on function public.toggle_follow(uuid)             to authenticated;
grant execute on function public.delete_comment(uuid)            to authenticated;
grant execute on function public.hide_comment(uuid, text)        to authenticated;
grant execute on function public.unhide_comment(uuid)            to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
