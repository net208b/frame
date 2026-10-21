import { z } from 'zod';

import { FEATURE_MAX_ITEMS } from '@/types/domain';

import { requiredText } from './fields';

/**
 * Feature forms. Every limit is a courtesy copy of a check in migration 0030;
 * the database is what refuses.
 */

export const createFeatureSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Use lowercase letters, digits and single hyphens.' })
    .min(3, { error: 'The address needs at least 3 characters.' })
    .max(80, { error: 'Keep the address to 80 characters.' }),
  titleEn: requiredText({ label: 'English title', min: 3, max: 100 }),
  titleTh: requiredText({ label: 'Thai title', min: 3, max: 100 }),
  introEn: requiredText({ label: 'English introduction', min: 20, max: 3000 }),
  introTh: requiredText({ label: 'Thai introduction', min: 20, max: 3000 }),
});

/**
 * One line per photograph, in order: `address | English caption | Thai caption`.
 * The address may be a full photograph URL or just its slug; the captions are
 * optional. Parsing is separate from validation so the line a problem is on
 * can be named.
 */
export interface FeatureLine {
  slug: string;
  captionEn: string | null;
  captionTh: string | null;
}

export function parseFeatureLines(
  text: string,
): { ok: true; lines: FeatureLine[] } | { ok: false; error: string } {
  const lines: FeatureLine[] = [];
  const seen = new Set<string>();
  const raw = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  if (raw.length > FEATURE_MAX_ITEMS) {
    return { ok: false, error: `A feature holds at most ${FEATURE_MAX_ITEMS} photographs.` };
  }

  for (const [index, line] of raw.entries()) {
    const [address = '', captionEn = '', captionTh = ''] = line.split('|').map((part) => part.trim());
    // Accept a pasted photograph URL as well as a bare slug.
    const slug = address.replace(/^.*\/photographs\//, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return { ok: false, error: `Line ${index + 1}: "${address}" is not a photograph address.` };
    }
    if (seen.has(slug)) {
      return { ok: false, error: `Line ${index + 1}: "${slug}" is already in the feature.` };
    }
    if (captionEn.length > 400 || captionTh.length > 400) {
      return { ok: false, error: `Line ${index + 1}: keep each caption to 400 characters.` };
    }
    seen.add(slug);
    lines.push({ slug, captionEn: captionEn || null, captionTh: captionTh || null });
  }
  return { ok: true, lines };
}
