import type { SupabaseClient } from '@supabase/supabase-js';

import type { ContentTranslation, Translations } from '@/types/domain';

/**
 * Reading `content_translations` (migration 0035) for a batch of subjects.
 *
 * ONE QUERY PER LIST, not one per row: every reader here takes the whole set of
 * ids it is about to render and asks once. A feed of twenty-four photographs
 * costs one extra round trip, not twenty-four.
 *
 * BOTH LANGUAGES COME BACK, and that is on purpose. A subject has at most one
 * translation per field — the row is constrained to a language its author did
 * not write in — so "all of them" is already "the other one", and the reader
 * never has to tell the repository which language it is rendering in. The
 * component compares the translation's language with its own locale and shows
 * the original when they match, which they do for the author's own readers.
 *
 * NOTHING HERE DECIDES WHAT IS PUBLIC. The table's read policy answers only for
 * subjects whose content is already public, so a translation of an unpublished
 * photograph is invisible to this query in the same way the photograph is.
 */

const FIELD_NAMES: Record<string, Record<string, string>> = {
  photograph: { title: 'title', description: 'description', alt_text: 'altText' },
  comment: { body: 'body' },
  location: { name: 'name', description: 'description' },
  profile: { biography: 'biography' },
};

interface TranslationRow {
  subject_id: unknown;
  field: unknown;
  language: unknown;
  value: unknown;
}

/**
 * Translations for every id given, keyed by id. An id with none is simply
 * absent from the map; callers substitute an empty object.
 */
export async function translationsFor(
  supabase: SupabaseClient,
  subject: keyof typeof FIELD_NAMES & string,
  ids: string[],
): Promise<Map<string, Translations<string>>> {
  const out = new Map<string, Translations<string>>();
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return out;

  const names = FIELD_NAMES[subject];
  if (!names) return out;

  const { data, error } = await supabase
    .from('content_translations')
    .select('subject_id, field, language, value')
    .eq('subject_type', subject)
    .in('subject_id', unique);

  if (error) {
    // A page that cannot read translations is a page in one language, which is
    // where FRAME was before this existed. It is not a reason to fail the read.
    console.error(`FRAME translations: reading ${subject} translations failed — ${error.message}`);
    return out;
  }

  for (const row of (data ?? []) as TranslationRow[]) {
    const id = typeof row.subject_id === 'string' ? row.subject_id : null;
    const field = typeof row.field === 'string' ? names[row.field] : undefined;
    const language = row.language === 'en' || row.language === 'th' ? row.language : null;
    const value = typeof row.value === 'string' ? row.value : null;
    if (!id || !field || !language || !value) continue;

    const entry: ContentTranslation = { language, value };
    const existing = out.get(id) ?? {};
    existing[field] = entry;
    out.set(id, existing);
  }

  return out;
}

export const NO_TRANSLATIONS: Translations<string> = Object.freeze({});
