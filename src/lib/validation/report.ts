import { z } from 'zod';

import { REPORT_REASONS, type ReportSubjectType } from '@/types/domain';

import { choice, identifier, optionalText } from './fields';

/**
 * Report schema.
 *
 * A report is the one write a signed-out visitor can make, so it stays as short
 * as a form can be: what, why, and anything the moderator needs to understand
 * it. A reason of "something else" without an explanation cannot be acted on,
 * so that one case asks for detail.
 */

/**
 * Written as a record keyed by the union so the compiler requires a label for
 * every subject type; the tuple `z.enum` needs is then derived from its keys
 * and cannot fall out of step with the domain.
 */
export const REPORT_SUBJECT_LABELS: Record<ReportSubjectType, string> = {
  photograph: 'photograph',
  location: 'location',
  profile: 'profile',
  collection: 'collection',
};

export const REPORT_SUBJECT_TYPES = Object.keys(REPORT_SUBJECT_LABELS) as [
  ReportSubjectType,
  ...ReportSubjectType[],
];

export const reportSchema = z
  .object({
    subjectType: choice(REPORT_SUBJECT_TYPES, 'Choose what is being reported.'),
    subjectId: identifier('Reported item'),
    reason: choice(
      REPORT_REASONS,
      'Choose a reason, so a moderator knows what to look at first.',
    ),
    details: optionalText({ label: 'Details', max: 1_200 }),
  })
  .refine((value) => value.reason !== 'other' || value.details !== null, {
    error: 'Describe the problem, otherwise a moderator has nothing to check.',
    path: ['details'],
  });

export type ReportInput = z.infer<typeof reportSchema>;
