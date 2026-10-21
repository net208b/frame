'use server';

import { z } from 'zod';

import {
  fail,
  failFromZod,
  ok,
  NOT_CONFIGURED_MESSAGE,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer, isModerator } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { createFeatureSchema, parseFeatureLines } from '@/lib/validation/feature';

/**
 * Editorial actions: picking a photograph, and writing and publishing
 * features.
 *
 * Migration 0030 holds the rules — staff only, published photographs only,
 * publication only through publish_feature() with at least three photographs,
 * and each photographer told once. These actions are the courtesy in front:
 * a plain sentence for a refusal, and the revalidation of every page the
 * change shows up on.
 */

const RULE_CODES = new Set(['42501', '23514', '23505', '23503', 'P0002']);
const uuid = z.uuid('An id must be a UUID.');

async function requireStaff(): Promise<
  { ok: true; viewerId: string } | { ok: false; result: ActionResult<never> }
> {
  if (isDemoMode()) return { ok: false, result: fail(NOT_CONFIGURED_MESSAGE, 'not_configured') };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, result: fail('Sign in first.', 'unauthenticated') };
  if (!isModerator(viewer)) {
    return { ok: false, result: fail('Only FRAME’s editors do this.', 'forbidden') };
  }
  return { ok: true, viewerId: viewer.id };
}

/* ------------------------------------------------------------------------ */
/* Editor's pick                                                             */
/* ------------------------------------------------------------------------ */

export async function setEditorsPick(input: {
  photographId: string;
  slug: string;
  pick: boolean;
}): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const parsed = uuid.safeParse(input.photographId);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_editors_pick', {
    p_photograph_id: parsed.data,
    p_pick: input.pick,
  });
  if (error) {
    if (RULE_CODES.has(error.code ?? '')) return fail(error.message, 'forbidden');
    return fail('That could not be saved. Try again in a moment.', 'unknown');
  }

  revalidateLocalisedPath(`/photographs/${input.slug}`);
  revalidateLocalisedPath('/');
  revalidateLocalisedPath('/discover');
  return ok(undefined, input.pick ? 'Marked as an editor’s pick.' : 'Removed from the editors’ picks.');
}

/* ------------------------------------------------------------------------ */
/* Features                                                                  */
/* ------------------------------------------------------------------------ */

export async function createFeature(input: unknown): Promise<ActionResult<{ id: string }>> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const parsed = createFeatureSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const value = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('features')
    .insert({
      slug: value.slug,
      title_en: value.titleEn,
      title_th: value.titleTh,
      intro_en: value.introEn,
      intro_th: value.introTh,
      created_by: staff.viewerId,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return fail('Another feature already uses that address.', 'conflict', { slug: 'Already in use.' });
    }
    if (error && RULE_CODES.has(error.code ?? '')) return fail(error.message, 'validation');
    return fail('The feature could not be saved. Try again in a moment.', 'unknown');
  }

  revalidateLocalisedPath('/moderation');
  return ok({ id: data.id as string }, 'Draft saved.');
}

/**
 * Replace a feature's photographs with the lines given, in order. The lines
 * name photographs by address; each is looked up, and a line naming nothing
 * published is reported by its number rather than silently dropped.
 */
export async function saveFeatureItems(input: {
  featureId: string;
  lines: string;
}): Promise<ActionResult<{ count: number }>> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const featureId = uuid.safeParse(input.featureId);
  if (!featureId.success) return failFromZod(featureId.error);

  const parsed = parseFeatureLines(input.lines);
  if (!parsed.ok) return fail(parsed.error, 'validation', { lines: parsed.error });

  const supabase = await createClient();
  const slugs = parsed.lines.map((line) => line.slug);
  const { data: found, error: lookupError } = slugs.length
    ? await supabase.from('photographs').select('id, slug').in('slug', slugs).eq('status', 'published')
    : { data: [], error: null };
  if (lookupError) return fail('The photographs could not be looked up. Try again in a moment.', 'unknown');

  const idBySlug = new Map((found ?? []).map((row) => [row.slug as string, row.id as string]));
  const missing = parsed.lines.findIndex((line) => !idBySlug.has(line.slug));
  if (missing >= 0) {
    const message = `Line ${missing + 1}: no published photograph has the address "${parsed.lines[missing]?.slug}".`;
    return fail(message, 'validation', { lines: message });
  }

  // Replaced whole, in one transaction, by set_feature_items(): the order of
  // the lines is the order of the piece, and a failure leaves the piece as it
  // was rather than half-emptied.
  const { error: replaceError } = await supabase.rpc('set_feature_items', {
    p_feature_id: featureId.data,
    p_items: parsed.lines.map((line) => ({
      photograph_id: idBySlug.get(line.slug) as string,
      caption_en: line.captionEn,
      caption_th: line.captionTh,
    })),
  });
  if (replaceError) {
    if (RULE_CODES.has(replaceError.code ?? '')) return fail(replaceError.message, 'forbidden');
    return fail('The feature could not be updated. Try again in a moment.', 'unknown');
  }

  const { data: feature } = await supabase.from('features').select('slug').eq('id', featureId.data).maybeSingle();
  revalidateLocalisedPath('/moderation');
  if (feature?.slug) revalidateLocalisedPath(`/features/${feature.slug as string}`);
  return ok({ count: parsed.lines.length }, 'Photographs saved.');
}

export async function publishFeature(input: { featureId: string; publish: boolean }): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff.result;

  const featureId = uuid.safeParse(input.featureId);
  if (!featureId.success) return failFromZod(featureId.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc('publish_feature', {
    p_feature_id: featureId.data,
    p_publish: input.publish,
  });
  if (error) {
    if (RULE_CODES.has(error.code ?? '')) return fail(error.message, 'forbidden');
    return fail('That could not be saved. Try again in a moment.', 'unknown');
  }

  const { data: feature } = await supabase.from('features').select('slug').eq('id', featureId.data).maybeSingle();
  revalidateLocalisedPath('/moderation');
  revalidateLocalisedPath('/');
  revalidateLocalisedPath('/community');
  if (feature?.slug) revalidateLocalisedPath(`/features/${feature.slug as string}`);
  return ok(undefined, input.publish ? 'Published.' : 'Taken down; it is a draft again.');
}
