import { z } from 'zod';

import type { ModerationAction, ModerationDecision } from '@/types/domain';

import { blankToNull, choice, flag, identifier, optionalText, requiredText } from './fields';
import { REPORT_SUBJECT_TYPES } from './report';

/**
 * Moderation schemas.
 *
 * Every negative decision carries a reason, because the member is shown it.
 * A rejection a member cannot understand is indistinguishable from a mistake,
 * and a moderator who is required to write one sentence is a moderator who has
 * had to think about the decision.
 */

/** Keyed by the union: a new decision cannot be added without a description. */
export const MODERATION_DECISION_LABELS: Record<ModerationDecision, string> = {
  approve: 'Approve',
  reject: 'Reject',
  request_changes: 'Ask for changes',
  remove_content: 'Remove the content',
  suspend_account: 'Suspend the account',
  dismiss: 'Dismiss the report',
};

const decisions = Object.keys(MODERATION_DECISION_LABELS) as [
  ModerationDecision,
  ...ModerationDecision[],
];

/** Decisions the member is told about, and which therefore require a reason. */
const NEGATIVE_DECISIONS: ReadonlySet<string> = new Set<ModerationDecision>([
  'reject',
  'request_changes',
  'remove_content',
  'suspend_account',
]);

const REASON_REQUIRED =
  'Write the reason for this decision. The member is shown it, so it has to stand on its own.';

/** `optionalText` turns a blank field into null, so a null reason is a blank one. */
function hasReason(value: { reason: string | null }): boolean {
  return value.reason !== null;
}

type ModerationSubjectType = ModerationAction['subjectType'];

export const MODERATION_SUBJECT_TYPES = [
  ...REPORT_SUBJECT_TYPES,
  'location_submission',
] as [ModerationSubjectType, ...ModerationSubjectType[]];

/**
 * The general shape of a recorded decision, matching {@link ModerationAction}.
 * The queue-specific schemas below narrow the decisions each queue allows.
 */
export const moderationDecisionSchema = z
  .object({
    subjectType: choice(MODERATION_SUBJECT_TYPES, 'Choose what this decision applies to.'),
    subjectId: identifier('Item under review'),
    decision: choice(decisions, 'Choose a decision.'),
    reason: optionalText({ label: 'Reason', max: 1_200 }),
  })
  .refine((value) => !NEGATIVE_DECISIONS.has(value.decision) || hasReason(value), {
    error: REASON_REQUIRED,
    path: ['reason'],
  });

export const submissionDecisionSchema = z
  .object({
    submissionId: identifier('Submission'),
    decision: choice(
      ['approve', 'reject', 'request_changes'],
      'Choose whether to approve this place, reject it, or ask for changes.',
    ),
    reason: optionalText({ label: 'Reason', max: 1_200 }),
    /**
     * The coordinate-privacy decision, taken once, here. Both flags are read by
     * `publishableCoordinates`: `isSensitive` publishes the point at reduced
     * precision, `withholdCoordinates` publishes no point at all.
     */
    isSensitive: flag(),
    withholdCoordinates: flag(),
  })
  .refine((value) => !NEGATIVE_DECISIONS.has(value.decision) || hasReason(value), {
    error: REASON_REQUIRED,
    path: ['reason'],
  });

export const reportResolutionSchema = z
  .object({
    reportId: identifier('Report'),
    decision: choice(
      ['remove_content', 'request_changes', 'dismiss'],
      'Choose how this report was resolved.',
    ),
    reason: optionalText({ label: 'Reason', max: 1_200 }),
  })
  .refine((value) => !NEGATIVE_DECISIONS.has(value.decision) || hasReason(value), {
    error: REASON_REQUIRED,
    path: ['reason'],
  });

export const uploadActionSchema = z
  .object({
    photographId: identifier('Photograph'),
    decision: choice(
      ['approve', 'remove_content', 'request_changes'],
      'Choose what happens to this upload.',
    ),
    reason: optionalText({ label: 'Reason', max: 1_200 }),
  })
  .refine((value) => !NEGATIVE_DECISIONS.has(value.decision) || hasReason(value), {
    error: REASON_REQUIRED,
    path: ['reason'],
  });

/** Suspension is always adverse, so the reason is required outright. */
export const suspendAccountSchema = z.object({
  accountId: identifier('Account'),
  reason: requiredText({ label: 'Reason', min: 10, max: 1_200 }),
  /** Omitted for an indefinite suspension, which a second moderator reviews. */
  durationDays: z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: 'A suspension length must be a number of days.' })
      .int({ error: 'A suspension length must be a whole number of days.' })
      .gte(1, { error: 'A suspension must last at least one day.' })
      .lte(3_650, { error: 'Use an indefinite suspension rather than one over ten years.' })
      .nullable(),
  ),
});

export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;
export type SubmissionDecisionInput = z.infer<typeof submissionDecisionSchema>;
export type ReportResolutionInput = z.infer<typeof reportResolutionSchema>;
export type UploadActionInput = z.infer<typeof uploadActionSchema>;
export type SuspendAccountInput = z.infer<typeof suspendAccountSchema>;
