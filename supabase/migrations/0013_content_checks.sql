-- =============================================================================
-- 0013 — automated content checks, so a clean photograph publishes at once
-- =============================================================================
-- 0012 made every upload wait for a moderator. This lets most of them stop
-- waiting: when an upload is processed, the server sends the stripped display
-- size to an image classifier (Google Cloud Vision SafeSearch) and records the
-- answer here. On publish, an upload whose check came back clear is published
-- by the server; anything else — a likely adult, violent or graphic image, a
-- check that could not run, or a high-severity signal from the upload's own
-- checks — stays in the review queue for a person.
--
-- The answer has to be trustworthy, so only the server writes it. There is no
-- INSERT, UPDATE or DELETE policy and no grant for any of them: the service role
-- writes past RLS, and a member — who could otherwise insert a 'clear' row for
-- their own upload and walk it past the review — cannot write at all.
--
-- 0012's rule is unchanged and still the backstop: an owner cannot set
-- status = 'published'. The server publishes with the service role, after it
-- has read this table itself.

create table if not exists public.photograph_content_checks (
  photograph_id uuid primary key
                  references public.photographs (id) on delete cascade,

  -- Which classifier answered. One for now; named so a second provider, or a
  -- change of model, is visible in the record rather than silent.
  provider      text not null
                  constraint photograph_content_checks_provider_allowed
                  check (provider in ('google_vision_safesearch', 'none')),

  -- clear: publish. review: a person looks first. unavailable: the check did
  -- not run (no key configured, timeout, provider error) — treated as review.
  verdict       text not null
                  constraint photograph_content_checks_verdict_allowed
                  check (verdict in ('clear', 'review', 'unavailable')),

  -- SafeSearch likelihoods as the provider names them (VERY_UNLIKELY …
  -- VERY_LIKELY, or UNKNOWN). Kept so a moderator sees why, not only that.
  adult         text,
  racy          text,
  violence      text,
  medical       text,
  spoof         text,

  -- A short, provider-free explanation for the review queue.
  note          text constraint photograph_content_checks_note_length check (char_length(note) <= 500),

  checked_at    timestamptz not null default now()
);

comment on table public.photograph_content_checks is
  'One automated content check per photograph, written only by the server (service role). Read by moderators in the review queue.';

alter table public.photograph_content_checks enable row level security;

-- Moderators read it in the review queue. Members never see it: a likelihood
-- next to their own photograph invites an argument with a classifier.
grant select on table public.photograph_content_checks to authenticated;

drop policy if exists photograph_content_checks_select_moderator on public.photograph_content_checks;
create policy photograph_content_checks_select_moderator
  on public.photograph_content_checks for select
  to authenticated
  using (public.is_moderator());
