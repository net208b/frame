import { z } from 'zod';

import {
  PHOTOBOOK_COVERS,
  PHOTOBOOK_GEAR_MODES,
  PHOTOBOOK_MAX_PAGES,
  PHOTOBOOK_MIN_PAGES,
  PHOTOBOOK_PAPERS,
} from '@/types/domain';

import { validationCode } from './codes';

/**
 * The photobook editor's schema.
 *
 * Every limit here is also a constraint or a trigger in migration 0018, and
 * has to be: a member can write their own rows with the public key, so the
 * form is a courtesy and the database is the rule. Messages are codes resolved
 * under `auth.validation`, like the other Settings forms — see `codes.ts`.
 *
 * The page list arrives as repeated `pages[]` fields, in the order the member
 * put them. Order is the whole point of a book, so it is kept exactly, and a
 * repeat is dropped rather than refused: it can only come from a form edited by
 * hand, and the trigger would refuse it anyway.
 */

export const PHOTOBOOK_LIMITS = {
  title: 60,
  dedication: 160,
  gear: 30,
  minPages: PHOTOBOOK_MIN_PAGES,
  maxPages: PHOTOBOOK_MAX_PAGES,
} as const;

const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;

function choice<const T extends readonly string[]>(allowed: T, fallback: T[number]) {
  return z
    .string()
    .trim()
    .transform((value) => ((allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback));
}

function optionalText(max: number, code: string) {
  return z
    .string()
    .trim()
    .max(max, { error: validationCode(code) })
    .transform((value) => (value === '' ? null : value));
}

export const photobookSchema = z.object({
  title: z
    .string({ error: validationCode('bookTitle.required') })
    .trim()
    .min(1, { error: validationCode('bookTitle.required') })
    .max(PHOTOBOOK_LIMITS.title, { error: validationCode('bookTitle.max') }),
  dedication: optionalText(PHOTOBOOK_LIMITS.dedication, 'bookDedication.max'),
  cover: choice(PHOTOBOOK_COVERS, 'linen'),
  paper: choice(PHOTOBOOK_PAPERS, 'lustre'),
  gearMode: choice(PHOTOBOOK_GEAR_MODES, 'none'),
  gearBrand: optionalText(PHOTOBOOK_LIMITS.gear, 'bookGear.max'),
  gearModel: optionalText(PHOTOBOOK_LIMITS.gear, 'bookGear.max'),
  visibility: z
    .string()
    .trim()
    .transform((value) => (value === 'public' ? 'public' : 'unlisted') as 'public' | 'unlisted'),
  pages: z.preprocess(
    (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]),
    z.array(z.string()).transform((values, context) => {
      const seen = new Set<string>();
      const pages: string[] = [];
      for (const raw of values) {
        const id = String(raw).trim();
        if (!IDENTIFIER.test(id) || seen.has(id)) continue;
        seen.add(id);
        pages.push(id);
      }
      if (pages.length < PHOTOBOOK_LIMITS.minPages) {
        context.addIssue({ code: 'custom', message: validationCode('bookPages.tooFew') });
        return z.NEVER;
      }
      if (pages.length > PHOTOBOOK_LIMITS.maxPages) {
        context.addIssue({ code: 'custom', message: validationCode('bookPages.tooMany') });
        return z.NEVER;
      }
      return pages;
    }),
  ),
});
