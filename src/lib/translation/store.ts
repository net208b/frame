import { createHash } from 'node:crypto';

import { after } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

import { languageOf, otherLanguage, worthTranslating, type Language } from './language';
import { translateTexts, translationConfigured } from './translate';

/**
 * Keeping `content_translations` up to date (migration 0035).
 *
 * WHEN THIS RUNS. Only when a piece of text becomes public, and that is the
 * whole privacy rule: a photograph is translated when a moderator publishes
 * it, a place when a moderator approves it, a comment when it is posted, a
 * biography when it is saved. A draft, a rejected proposal and a photograph
 * waiting in the queue are never sent anywhere.
 *
 * HOW IT RUNS. Through `scheduleTranslation`, which hands the work to Next's
 * `after()`: the member's response is flushed first and the provider is called
 * afterwards. Nobody waits on a network call to somebody else's API to find
 * out that their comment posted. If the work fails, or the platform cuts it
 * short, the content is already saved and simply has no translation yet —
 * which is exactly how the reader's side is written to cope.
 *
 * WHAT IT COSTS. Unchanged text is never re-translated: each row remembers the
 * SHA-256 of the source it was made from, so calling this twice on the same
 * photograph makes no second request. A member editing a title drops only that
 * title's translation (by trigger, in 0035), so the next run re-translates one
 * field rather than all of them.
 *
 * FIELDS MAY DISAGREE ABOUT THEIR LANGUAGE. A member can perfectly well write
 * an English title over a Thai description, so the source language is decided
 * per field and the work is grouped by language — at most two requests, one
 * per direction, however many fields there are.
 */

export type TranslationSubject = 'photograph' | 'comment' | 'location' | 'profile';

const SUBJECTS: Record<TranslationSubject, { table: string; fields: readonly string[] }> = {
  photograph: { table: 'photographs', fields: ['title', 'description', 'alt_text'] },
  comment: { table: 'photograph_comments', fields: ['body'] },
  location: { table: 'locations', fields: ['name', 'description'] },
  profile: { table: 'profiles', fields: ['biography'] },
};

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The provider's ceiling on a single segment; longer text is left alone. */
const MAX_SOURCE_CHARS = 5_000;

interface Pending {
  field: string;
  text: string;
  hash: string;
  from: Language;
  to: Language;
}

/**
 * Bring one subject's translations up to date. Resolves either way: every
 * failure is logged and swallowed, because no caller of this should care.
 */
export async function translateSubject(
  subject: TranslationSubject,
  id: string,
): Promise<void> {
  if (!translationConfigured()) return;

  const spec = SUBJECTS[subject];

  try {
    const admin = createAdminClient();

    const { data: row, error: readError } = await admin
      .from(spec.table)
      .select(spec.fields.join(', '))
      .eq('id', id)
      .maybeSingle<Record<string, unknown>>();

    if (readError) {
      console.error(`FRAME translation: reading the ${subject} failed — ${readError.message}`);
      return;
    }
    if (!row) return;

    // What is already translated, and from which exact words.
    const { data: existing, error: existingError } = await admin
      .from('content_translations')
      .select('field, source_hash')
      .eq('subject_type', subject)
      .eq('subject_id', id);

    if (existingError) {
      console.error(
        `FRAME translation: reading existing translations failed — ${existingError.message}`,
      );
      return;
    }

    const done = new Map<string, string>();
    for (const entry of existing ?? []) {
      if (typeof entry.field === 'string' && typeof entry.source_hash === 'string') {
        done.set(entry.field, entry.source_hash);
      }
    }

    const pending: Pending[] = [];
    for (const field of spec.fields) {
      const value = row[field];
      if (!worthTranslating(value)) continue;
      const text = value.trim();
      if (text.length > MAX_SOURCE_CHARS) continue;

      const hash = sha256(text);
      // Already translated from exactly these words.
      if (done.get(field) === hash) continue;

      const from = languageOf(text);
      pending.push({ field, text, hash, from, to: otherLanguage(from) });
    }

    if (pending.length === 0) return;

    // One request per direction, not one per field.
    for (const from of ['th', 'en'] as const) {
      const batch = pending.filter((entry) => entry.from === from);
      if (batch.length === 0) continue;

      const to = otherLanguage(from);
      const translated = await translateTexts(
        batch.map((entry) => entry.text),
        from,
        to,
      );
      if (translated === null) continue;

      const rows = batch
        .map((entry, index) => ({ entry, value: translated[index]?.trim() ?? '' }))
        // A provider that hands back the input unchanged has not translated
        // anything, and storing it would put a "translated" label on the very
        // same sentence. An empty answer is no answer either.
        .filter(({ entry, value }) => value.length > 0 && value !== entry.text)
        .map(({ entry, value }) => ({
          subject_type: subject,
          subject_id: id,
          field: entry.field,
          language: to,
          value: value.slice(0, 5_000),
          source_language: from,
          source_hash: entry.hash,
          provider: 'google',
          updated_at: new Date().toISOString(),
        }));

      if (rows.length === 0) continue;

      const { error: writeError } = await admin
        .from('content_translations')
        .upsert(rows, { onConflict: 'subject_type,subject_id,field,language' });

      if (writeError) {
        console.error(`FRAME translation: storing translations failed — ${writeError.message}`);
      }
    }
  } catch (error) {
    console.error(
      `FRAME translation: ${subject} ${id} could not be translated — ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}

/**
 * Queue a subject for translation after the response has been sent.
 *
 * Call this from a server action once the write has succeeded. It returns
 * immediately and never throws, so it can be the last line of an action
 * without a try/catch around it.
 */
export function scheduleTranslation(subject: TranslationSubject, id: string): void {
  if (!translationConfigured()) return;
  try {
    after(async () => {
      await translateSubject(subject, id);
    });
  } catch (error) {
    // after() throws outside a request scope. That is a programming error
    // rather than a reason to fail the member's write.
    console.error(
      `FRAME translation: could not schedule ${subject} ${id} — ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}
