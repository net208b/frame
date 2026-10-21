-- =============================================================================
-- FRAME — 0024  Close the approval gate, and finish what 0007 started
-- =============================================================================
-- Two findings from an audit of every table privilege and every function
-- EXECUTE grant on production.
--
-- 1. APPROVING A LOCATION SUBMISSION WAS REACHABLE WITHOUT SIGNING IN.
--
--    `approve_location_submission` took the caller from auth.uid() and then
--    compared it to the moderator named in the argument ONLY when it was not
--    null:
--
--      if v_actor is not null and v_actor <> p_moderator then raise ...
--
--    For a request made with the publishable key auth.uid() is null, so the
--    comparison was skipped and the function went on to authorise on the
--    strength of `p_moderator` alone — an argument the caller chooses. The
--    role check that follows asks whether THAT id belongs to a moderator, not
--    whether the caller is one, and `profiles` publishes id, username and role
--    to anon, so a valid value is one public request away.
--
--    Confirmed against production, with the controls that make it a finding
--    rather than a guess: anonymous + the admin's id + a submission id that
--    does not exist returned P0002 ("no longer exists"), which is raised AFTER
--    both gates; the same call naming an ordinary member returned 42501 from
--    the role check; and set_member_role, which refuses a null caller outright,
--    returned 42501. So the role check works and anonymous RPC is not
--    generally open — this one function let the caller name themselves.
--
--    A real submission id in place of the probe's would have inserted an
--    approved row into public.locations and closed the submission, both
--    recorded against a moderator who did nothing.
--
--    The fix refuses a null caller and then requires the caller to BE the
--    moderator they name. Every caller in the application already passes its
--    own viewer id, so nothing legitimate changes. There is deliberately no
--    exemption for a null actor: if a back-office path ever needs one it
--    should be added on purpose, not inherited from a skipped comparison.
--
-- 2. SIX TABLES NEVER WITHHELD ANYTHING, TRUNCATE INCLUDED.
--
--    Migration 0007 set the rule — "revoked first, then granted back
--    deliberately, so this block is the whole truth about what each role may
--    attempt rather than an addition to whatever a default grant left behind"
--    — and every table created after it granted without revoking. This
--    database has `alter default privileges in schema public grant all on
--    tables to anon, authenticated, service_role`, so each of these arrived
--    with ALL privileges already held by both public roles.
--
--    Row-level security still refused INSERT, UPDATE and DELETE wherever no
--    policy admitted them, so nothing was reachable through the REST API. But
--    TRUNCATE is not subject to row-level security at all, and a privilege
--    that only a missing policy stands in front of is one careless policy away
--    from being real. 0023 fixed photograph_comments, profile_follows and
--    notifications this way; these six are the rest of them.
-- =============================================================================

set search_path = public, extensions;

/* ------------------------------------------------------------------------ */
/* 1. The approval gate                                                      */
/* ------------------------------------------------------------------------ */

create or replace function public.approve_location_submission(
  p_submission_id uuid,
  p_moderator uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.location_submissions;
  v_role       text;
  v_actor      uuid := (select auth.uid());
  v_slug       text;
  v_candidate  text;
  v_attempt    integer := 0;
  v_location   uuid;
begin
  if p_moderator is null then
    raise exception 'A moderator id is required to approve a submission.' using errcode = '22023';
  end if;

  -- The caller has to be somebody. Without this, auth.uid() being null took
  -- the comparison below out of the picture and left `p_moderator` — a value
  -- the caller supplies — as the only thing being checked.
  if v_actor is null then
    raise exception 'You need to be signed in to approve a location submission.'
      using errcode = '42501';
  end if;

  -- And has to be the moderator they are recording the decision as.
  if v_actor <> p_moderator then
    raise exception 'A moderator may only record a decision under their own account.'
      using errcode = '42501';
  end if;

  select p.role
    into v_role
    from public.profiles p
   where p.id = p_moderator
     and p.is_suspended = false;

  if v_role is null or v_role not in ('moderator', 'admin') then
    raise exception 'Only a moderator may approve a location submission.' using errcode = '42501';
  end if;

  select *
    into v_submission
    from public.location_submissions s
   where s.id = p_submission_id
     for update;

  if not found then
    raise exception 'That location submission no longer exists.' using errcode = 'P0002';
  end if;

  if v_submission.status = 'approved' and v_submission.approved_location_id is not null then
    return v_submission.approved_location_id;
  end if;

  v_slug := public.frame_slugify(v_submission.proposed_name || ' ' || v_submission.city);
  if length(v_slug) = 0 then
    v_slug := 'location';
  end if;
  v_candidate := v_slug;

  while v_attempt < 20
        and exists (select 1 from public.locations l where l.slug = v_candidate) loop
    v_attempt := v_attempt + 1;
    v_candidate := left(v_slug, 60) || '-' || v_attempt::text;
  end loop;

  -- Deterministic last resort, derived from the submission id, so twenty
  -- identically named places in one city still cannot collide.
  if exists (select 1 from public.locations l where l.slug = v_candidate) then
    v_candidate := left(v_slug, 50) || '-' || substr(replace(p_submission_id::text, '-', ''), 1, 12);
  end if;

  insert into public.locations (
    slug, name, city, country, country_code,
    latitude, longitude, status, submitted_by, approved_at, approved_by
  )
  values (
    v_candidate, v_submission.proposed_name, v_submission.city, v_submission.country,
    upper(v_submission.country_code::text),
    v_submission.latitude, v_submission.longitude, 'approved', v_submission.submitted_by,
    now(), p_moderator
  )
  returning id into v_location;

  update public.location_submissions s
     set status               = 'approved',
         approved_location_id = v_location,
         rejection_reason     = null,
         resolved_at          = now(),
         resolved_by          = p_moderator
   where s.id = p_submission_id;

  insert into public.moderation_actions (decision, subject_type, subject_id, reason, moderator_id)
  values ('approve', 'location_submission', p_submission_id, null, p_moderator);

  return v_location;
end;
$$;

-- `revoke ... from public` does not touch a grant held directly by anon, which
-- is how every function in this schema is granted by default. Signing in is
-- now required inside the function; taking EXECUTE away from anon as well
-- means an anonymous caller cannot even reach it to be refused.
revoke all on function public.approve_location_submission(uuid, uuid) from public, anon;
grant execute on function public.approve_location_submission(uuid, uuid) to authenticated;

/* ------------------------------------------------------------------------ */
/* 2. The six tables that never withheld anything                            */
/* ------------------------------------------------------------------------ */
-- Revoked first, then granted back deliberately — the rule from 0007. The
-- grants restated here are the ones migrations 0013, 0018, 0020 and 0021
-- intended; the point of the revoke is that those grants now mean something.
revoke all on table
  public.photobooks, public.photobook_pages,
  public.photo_series, public.photo_series_items,
  public.photograph_exif_checks, public.photograph_content_checks
  from anon, authenticated;

-- Photobooks and series are public reading, and their owner writes them.
grant select on table
  public.photobooks, public.photobook_pages,
  public.photo_series, public.photo_series_items
  to anon, authenticated;
grant insert, update, delete on table
  public.photobooks, public.photobook_pages,
  public.photo_series, public.photo_series_items
  to authenticated;

-- The two verdict tables are a moderator's reading and nobody else's. The
-- policies already say `is_moderator()`; now the privileges agree, and anon
-- holds nothing on them at all. Both are written by the server with the
-- service-role key, which these revokes do not touch.
grant select on table
  public.photograph_exif_checks, public.photograph_content_checks
  to authenticated;
