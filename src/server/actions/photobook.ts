'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { fail, ok, type ActionResult } from '@/lib/action-result';
import { isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';
import { parseForm } from '@/lib/validation';
import { PHOTOBOOK_LIMITS, photobookSchema } from '@/lib/validation/photobook';

/**
 * The photobook: one per member, made from their own published photographs.
 *
 * The same gauntlet as the account actions — capability, identity,
 * suspension, validation, rate limit, write — and the same two commitments:
 * nothing pretends (demo mode refuses), and nothing is reported as saved
 * before it is.
 *
 * WHAT THE DATABASE DECIDES, not this file: that every page is the member's
 * own published photograph, that there are at most 24, that there is one book
 * per member, and whose row may be written at all. Migration 0018 holds all
 * four, so a request that skips this file is refused exactly as one that goes
 * through it. What this file adds is the sentences, the rate limit, the slug,
 * and the order of the two writes.
 *
 * THE ADDRESS IS SET ONCE. The slug is derived from the username and the title
 * the first time, and kept on every save after that, because a book's address
 * is the thing the member pasted into a bio. Renaming the book must not break
 * the link they are proudest of.
 */

type PreviousState = ActionResult<unknown> | null;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const LIMIT = { seconds: 3600, max: 30 } as const;

async function messages() {
  return getTranslations('account');
}

function log(operation: string, message: string, code?: string): void {
  console.error(`FRAME photobook: ${operation} failed — ${message}${code ? ` (${code})` : ''}`);
}

async function signedIn(
  supabase: SupabaseClient,
): Promise<{ id: string; username: string; isSuspended: boolean } | null> {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;

  const { data: row, error: rowError } = await supabase
    .from('profiles')
    .select('username, is_suspended')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (rowError || !row) return null;

  const profile = row as { username: string; is_suspended: boolean };
  return { id: auth.user.id, username: profile.username, isSuspended: profile.is_suspended };
}

async function limit(userId: string): Promise<ActionResult<never> | null> {
  const verdict = await checkRateLimit(`photobook:save:${userId}`, LIMIT.max, LIMIT.seconds);
  if (verdict.allowed) return null;
  const auth = await getTranslations('auth');
  const wait = Math.max(1, verdict.retryAfterSeconds);
  return fail(
    wait <= 90
      ? auth('actions.retrySeconds', { count: wait })
      : auth('actions.retryMinutes', { count: Math.ceil(wait / 60) }),
    'rate_limited',
  );
}

/** The book page in both languages, the short link, and the profile that lists it. */
function revalidateBook(slug: string, username: string): void {
  revalidateLocalisedPath(`/books/${slug}`);
  revalidateLocalisedPath(`/photographers/${username}`);
  revalidatePath('/', 'layout');
}

export async function savePhotobook(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const t = await messages();
  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const supabase = await createClient();
  const member = await signedIn(supabase);
  if (!member) return fail(t('actions.signedOut'), 'unauthenticated');
  if (member.isSuspended) return fail(t('actions.suspended'), 'forbidden');

  const parsed = parseForm(formData, photobookSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const limited = await limit(member.id);
  if (limited) return limited;

  const { bookId, title, dedication, cover, paper, gearMode, gearBrand, gearModel, visibility, pages } =
    parsed.data;

  // The book being edited, if any — looked up by id AND owner, so a foreign
  // id gets a sentence rather than a silent no-op. Its address is kept.
  let existing: { id: string; slug: string } | null = null;
  if (bookId) {
    const { data, error: readError } = await supabase
      .from('photobooks')
      .select('id, slug')
      .eq('id', bookId)
      .eq('owner_id', member.id)
      .maybeSingle();
    if (readError) {
      log('reading the book being edited', readError.message, readError.code);
      return fail(t('actions.bookFailed'), 'unknown');
    }
    if (!data) return fail(t('actions.bookNotYours'), 'forbidden');
    existing = data as { id: string; slug: string };
  }

  const fields = {
    title,
    dedication,
    cover_preset: cover,
    paper_preset: paper,
    gear_mode: gearMode,
    gear_brand: gearMode === 'none' ? null : gearBrand,
    gear_model: gearMode === 'model' ? gearModel : null,
    visibility,
  };

  let savedId: string;
  let slug: string;

  if (existing) {
    savedId = existing.id;
    slug = existing.slug;
    const { error } = await supabase.from('photobooks').update(fields).eq('id', savedId).eq('owner_id', member.id);
    if (error) {
      log('updating the book', error.message, error.code);
      return fail(t('actions.bookFailed'), 'unknown');
    }
  } else {
    // A new book goes at the end of the shelf. The count is also the early,
    // friendlier form of the cap: the trigger in 0019 refuses a thirteenth
    // regardless, and is caught below as the same sentence.
    const { count, error: countError } = await supabase
      .from('photobooks')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', member.id);
    if (countError) {
      log('counting the shelf', countError.message, countError.code);
      return fail(t('actions.bookFailed'), 'unknown');
    }
    const shelved = count ?? 0;
    if (shelved >= PHOTOBOOK_LIMITS.maxBooks) {
      return fail(t('actions.bookLimit', { max: PHOTOBOOK_LIMITS.maxBooks }), 'validation');
    }

    // `username-title`, like the profile's own address: memorable enough to
    // read aloud, unique enough that two members' "Bangkok" do not collide.
    slug = slugify(`${member.username}-${title}`).slice(0, 70) || slugify(member.username);
    const { data, error } = await supabase
      .from('photobooks')
      .insert({ owner_id: member.id, slug, position: shelved + 1, ...fields })
      .select('id, slug')
      .single();
    if (error || !data) {
      log('creating the book', error?.message ?? 'no row returned', error?.code);
      if (error?.code === '23505') return fail(t('actions.bookSlugTaken'), 'conflict');
      if (error?.code === '23514') {
        return fail(t('actions.bookLimit', { max: PHOTOBOOK_LIMITS.maxBooks }), 'validation');
      }
      return fail(t('actions.bookFailed'), 'unknown');
    }
    savedId = (data as { id: string }).id;
  }

  // The pages: cleared and rewritten in the member's order. Two statements,
  // not one transaction — PostgREST has none — so the order is the one that
  // fails safely: a failed insert leaves a book with no pages and a sentence
  // saying so, never a book with somebody else's page or a duplicate.
  const { error: clearError } = await supabase.from('photobook_pages').delete().eq('photobook_id', savedId);
  if (clearError) {
    log('clearing the pages', clearError.message, clearError.code);
    return fail(t('actions.bookFailed'), 'unknown');
  }

  const { error: pagesError } = await supabase
    .from('photobook_pages')
    .insert(pages.map((photographId, index) => ({ photobook_id: savedId, photograph_id: photographId, position: index + 1 })));
  if (pagesError) {
    log('writing the pages', pagesError.message, pagesError.code);
    // 42501 is the trigger: a page that is not this member's own published
    // photograph. That can happen honestly — a frame unpublished in another
    // tab — so it gets its own sentence, filed against the field.
    if (pagesError.code === '42501') {
      return fail(t('actions.bookPagesRefused'), 'validation', { pages: t('actions.bookPagesRefused') });
    }
    return fail(t('actions.bookPagesFailed'), 'unknown');
  }

  revalidateBook(slug, member.username);
  return ok({ slug }, t('actions.bookSaved'));
}

export async function deletePhotobook(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<void>> {
  const t = await messages();
  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const supabase = await createClient();
  const member = await signedIn(supabase);
  if (!member) return fail(t('actions.signedOut'), 'unauthenticated');

  const limited = await limit(member.id);
  if (limited) return limited;

  // One book, named by id, and only the member's own. Deleting "all my books"
  // from a single button is not a thing this form offers.
  const raw = formData.get('bookId');
  const bookId = typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.trim()) ? raw.trim() : null;
  if (!bookId) return fail(t('actions.bookNotYours'), 'forbidden');

  const { data, error } = await supabase
    .from('photobooks')
    .delete()
    .eq('id', bookId)
    .eq('owner_id', member.id)
    .select('slug');
  if (error) {
    log('deleting the book', error.message, error.code);
    return fail(t('actions.bookFailed'), 'unknown');
  }

  for (const row of (data ?? []) as { slug: string }[]) revalidateBook(row.slug, member.username);
  return ok(undefined, t('actions.bookDeleted'));
}
