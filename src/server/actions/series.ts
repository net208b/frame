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
import { seriesSchema } from '@/lib/validation/series';
import { SERIES_MAX_PER_MEMBER } from '@/types/domain';

/**
 * A photo series: three to ten of a member's own published photographs, in
 * order, with the words around them.
 *
 * The same gauntlet as the photobook actions and the same commitments: demo
 * mode refuses, nothing is reported saved before it is, and WHAT MAY BE AN
 * ITEM is decided by the trigger in migration 0020, not here. This file adds
 * the sentences, the rate limit, the slug, and the order of the writes.
 *
 * THE ORDER OF THE WRITES matters because PostgREST has no transaction. The
 * row first, then the items cleared and rewritten, then the cover — because
 * the cover trigger refuses a photograph that is not yet an item.
 */

type PreviousState = ActionResult<unknown> | null;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const LIMIT = { seconds: 3600, max: 30 } as const;

async function messages() {
  return getTranslations('account');
}

function log(operation: string, message: string, code?: string): void {
  console.error(`FRAME series: ${operation} failed — ${message}${code ? ` (${code})` : ''}`);
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
  const verdict = await checkRateLimit(`series:save:${userId}`, LIMIT.max, LIMIT.seconds);
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

function revalidateSeries(slug: string, username: string): void {
  revalidateLocalisedPath(`/series/${slug}`);
  revalidateLocalisedPath(`/photographers/${username}`);
  revalidatePath('/', 'layout');
}

export async function saveSeries(
  _state: PreviousState,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const t = await messages();
  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const supabase = await createClient();
  const member = await signedIn(supabase);
  if (!member) return fail(t('actions.signedOut'), 'unauthenticated');
  if (member.isSuspended) return fail(t('actions.suspended'), 'forbidden');

  const parsed = parseForm(formData, seriesSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const limited = await limit(member.id);
  if (limited) return limited;

  const { seriesId, title, standfirst, body, cover, visibility, items } = parsed.data;

  let existing: { id: string; slug: string } | null = null;
  if (seriesId) {
    const { data, error } = await supabase
      .from('photo_series')
      .select('id, slug')
      .eq('id', seriesId)
      .eq('owner_id', member.id)
      .maybeSingle();
    if (error) {
      log('reading the series being edited', error.message, error.code);
      return fail(t('actions.seriesFailed'), 'unknown');
    }
    if (!data) return fail(t('actions.seriesNotYours'), 'forbidden');
    existing = data as { id: string; slug: string };
  }

  // The cover is written last (see the header); clearing it first keeps the
  // trigger quiet while the items are rewritten underneath it.
  const fields = { title, standfirst, body, visibility, cover_photograph_id: null as string | null };

  let savedId: string;
  let slug: string;

  if (existing) {
    savedId = existing.id;
    slug = existing.slug;
    const { error } = await supabase.from('photo_series').update(fields).eq('id', savedId).eq('owner_id', member.id);
    if (error) {
      log('updating the series', error.message, error.code);
      return fail(t('actions.seriesFailed'), 'unknown');
    }
  } else {
    const { count, error: countError } = await supabase
      .from('photo_series')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', member.id);
    if (countError) {
      log('counting the series', countError.message, countError.code);
      return fail(t('actions.seriesFailed'), 'unknown');
    }
    if ((count ?? 0) >= SERIES_MAX_PER_MEMBER) {
      return fail(t('actions.seriesLimit', { max: SERIES_MAX_PER_MEMBER }), 'validation');
    }

    slug = slugify(`${member.username}-${title}`).slice(0, 70) || slugify(member.username);
    const { data, error } = await supabase
      .from('photo_series')
      .insert({ owner_id: member.id, slug, ...fields })
      .select('id, slug')
      .single();
    if (error || !data) {
      log('creating the series', error?.message ?? 'no row returned', error?.code);
      if (error?.code === '23505') return fail(t('actions.seriesSlugTaken'), 'conflict');
      if (error?.code === '23514') return fail(t('actions.seriesLimit', { max: SERIES_MAX_PER_MEMBER }), 'validation');
      return fail(t('actions.seriesFailed'), 'unknown');
    }
    savedId = (data as { id: string }).id;
  }

  const { error: clearError } = await supabase.from('photo_series_items').delete().eq('series_id', savedId);
  if (clearError) {
    log('clearing the items', clearError.message, clearError.code);
    return fail(t('actions.seriesFailed'), 'unknown');
  }

  const { error: itemsError } = await supabase.from('photo_series_items').insert(
    items.map((item, index) => ({
      series_id: savedId,
      photograph_id: item.photographId,
      position: index + 1,
      caption: item.caption,
    })),
  );
  if (itemsError) {
    log('writing the items', itemsError.message, itemsError.code);
    if (itemsError.code === '42501') {
      return fail(t('actions.seriesItemsRefused'), 'validation', { items: t('actions.seriesItemsRefused') });
    }
    return fail(t('actions.seriesItemsFailed'), 'unknown');
  }

  if (cover) {
    const { error: coverError } = await supabase
      .from('photo_series')
      .update({ cover_photograph_id: cover })
      .eq('id', savedId)
      .eq('owner_id', member.id);
    // A refused cover is not a lost series: the reader falls back to the
    // first frame, and the member is told nothing went wrong, because for
    // them nothing did.
    if (coverError) log('setting the cover', coverError.message, coverError.code);
  }

  revalidateSeries(slug, member.username);
  return ok({ slug }, t('actions.seriesSaved'));
}

export async function deleteSeries(
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

  const raw = formData.get('seriesId');
  const seriesId = typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw.trim()) ? raw.trim() : null;
  if (!seriesId) return fail(t('actions.seriesNotYours'), 'forbidden');

  const { data, error } = await supabase
    .from('photo_series')
    .delete()
    .eq('id', seriesId)
    .eq('owner_id', member.id)
    .select('slug');
  if (error) {
    log('deleting the series', error.message, error.code);
    return fail(t('actions.seriesFailed'), 'unknown');
  }

  for (const row of (data ?? []) as { slug: string }[]) revalidateSeries(row.slug, member.username);
  return ok(undefined, t('actions.seriesDeleted'));
}
