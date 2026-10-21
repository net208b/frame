import { z } from 'zod';

import { SERIES_MAX_ITEMS, SERIES_MIN_ITEMS } from '@/types/domain';

import { validationCode } from './codes';

/**
 * The series editor's schema.
 *
 * Every limit here is also a constraint or a trigger in migration 0020, and
 * has to be: the form is a courtesy and the database is the rule. Messages are
 * codes resolved under `auth.validation`, like the other Settings forms.
 *
 * The items arrive as repeated `items[]` fields in the member's order, with a
 * parallel `captions[]` — one per item, blank allowed. The two are zipped by
 * index here, which is why the form renders them side by side and in step.
 */

export const SERIES_LIMITS = {
  title: 80,
  standfirst: 200,
  body: 4000,
  caption: 240,
  minItems: SERIES_MIN_ITEMS,
  maxItems: SERIES_MAX_ITEMS,
} as const;

const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;

const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

function optionalText(max: number, code: string) {
  return z
    .string()
    .trim()
    .max(max, { error: validationCode(code) })
    .transform((value) => (value === '' ? null : value));
}

export const seriesSchema = z
  .object({
    seriesId: z
      .string()
      .trim()
      .transform((value) => (IDENTIFIER.test(value) ? value : null))
      .optional()
      .transform((value) => value ?? null),
    title: z
      .string({ error: validationCode('seriesTitle.required') })
      .trim()
      .min(1, { error: validationCode('seriesTitle.required') })
      .max(SERIES_LIMITS.title, { error: validationCode('seriesTitle.max') }),
    standfirst: optionalText(SERIES_LIMITS.standfirst, 'seriesStandfirst.max'),
    // Paragraphs are kept as the member typed them; the reader splits on blank
    // lines. Windows line endings are normalised so the count means the same
    // thing on every keyboard.
    body: z
      .string()
      .transform((value) => value.replace(/\r\n?/g, '\n').trim())
      .pipe(z.string().max(SERIES_LIMITS.body, { error: validationCode('seriesBody.max') })),
    cover: z
      .string()
      .trim()
      .transform((value) => (IDENTIFIER.test(value) ? value : null))
      .optional()
      .transform((value) => value ?? null),
    visibility: z
      .string()
      .trim()
      .transform((value) => (value === 'public' ? 'public' : 'unlisted') as 'public' | 'unlisted'),
    items: z.preprocess(list, z.array(z.string())),
    captions: z.preprocess(list, z.array(z.string())),
  })
  .transform((raw, context) => {
    const seen = new Set<string>();
    const items: Array<{ photographId: string; caption: string | null }> = [];
    raw.items.forEach((value, index) => {
      const id = String(value).trim();
      if (!IDENTIFIER.test(id) || seen.has(id)) return;
      seen.add(id);
      const caption = String(raw.captions[index] ?? '').trim();
      if (caption.length > SERIES_LIMITS.caption) {
        context.addIssue({ code: 'custom', message: validationCode('seriesCaption.max'), path: ['captions'] });
      }
      items.push({ photographId: id, caption: caption === '' ? null : caption });
    });
    if (items.length < SERIES_LIMITS.minItems) {
      context.addIssue({ code: 'custom', message: validationCode('seriesItems.tooFew'), path: ['items'] });
    }
    if (items.length > SERIES_LIMITS.maxItems) {
      context.addIssue({ code: 'custom', message: validationCode('seriesItems.tooMany'), path: ['items'] });
    }
    // A cover that is not one of the items is dropped to "the first frame",
    // which is what the trigger would refuse anyway.
    const cover = raw.cover && items.some((item) => item.photographId === raw.cover) ? raw.cover : null;
    return { ...raw, items, cover };
  });

export type SeriesInput = z.output<typeof seriesSchema>;
