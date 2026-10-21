import { z } from 'zod';

import { CHALLENGE_AWARDS } from '@/types/domain';

import { requiredText } from './fields';

/**
 * Challenge forms.
 *
 * Every limit here is a courtesy copy of a check in migration 0027 — the
 * lengths, the allowance, the shape of the slug, the order and length of the
 * window. The database is what refuses; this is what tells staff in the form
 * rather than after a round trip.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const createChallengeSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Use lowercase letters, digits and single hyphens.' })
      .min(3, { error: 'The address needs at least 3 characters.' })
      .max(80, { error: 'Keep the address to 80 characters.' }),
    titleEn: requiredText({ label: 'English title', min: 3, max: 80 }),
    titleTh: requiredText({ label: 'Thai title', min: 3, max: 80 }),
    briefEn: requiredText({ label: 'English brief', min: 20, max: 1200 }),
    briefTh: requiredText({ label: 'Thai brief', min: 20, max: 1200 }),
    opensAt: z.iso.datetime({ offset: true, error: 'Choose when it opens.' }),
    closesAt: z.iso.datetime({ offset: true, error: 'Choose when it closes.' }),
    maxEntries: z.coerce.number().int().min(1).max(5),
    requiresNewWork: z.boolean(),
  })
  .refine((value) => Date.parse(value.closesAt) > Date.parse(value.opensAt), {
    error: 'It has to close after it opens.',
    path: ['closesAt'],
  })
  .refine(
    (value) => {
      const length = Date.parse(value.closesAt) - Date.parse(value.opensAt);
      return length >= 3 * DAY_MS && length <= 62 * DAY_MS;
    },
    { error: 'A challenge runs for between 3 and 62 days.', path: ['closesAt'] },
  );

export const entrySchema = z.object({
  challengeId: z.uuid('A challenge id must be a UUID.'),
  photographId: z.uuid('A photograph id must be a UUID.'),
});

export const awardSchema = z.object({
  challengeId: z.uuid('A challenge id must be a UUID.'),
  photographId: z.uuid('A photograph id must be a UUID.'),
  /** Null takes an award away. */
  award: z.enum(CHALLENGE_AWARDS).nullable(),
  note: z
    .string()
    .trim()
    .max(500, { error: 'Keep the note to 500 characters.' })
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
