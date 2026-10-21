import { z } from 'zod';

import { PIN_PRECISIONS } from '@/types/domain';

import type { ModerationAction, ModerationDecision } from '@/types/domain';

import { validationCode } from './codes';
import { blankToNull, choice, identifier } from './fields';
import { REPORT_SUBJECT_TYPES } from './report';

/**
 * Moderation schemas.
 *
 * Every negative decision carries a reason, because the member is shown it.
 * A rejection a member cannot understand is indistinguishable from a mistake,
 * and a moderator who is required to write one sentence is a moderator who has
 * had to think about the decision.
 *
 * MESSAGES. Every `error` here is a key rather than a sentence —
 * `validation.reason.required` instead of "Write the reason for this
 * decision." — following the pattern `src/lib/validation/codes.ts` sets out for
 * every validation module. The copy sits under `moderation.validation` in
 * `src/messages/{en,th}.json` and `DecisionForm` resolves it with its own
 * translator, so a refusal is written in the language the moderator is reading.
 * The bounds appear in that copy as literals, which is honest because they are
 * constants of this schema rather than runtime values; {@link MODERATION_LIMITS}
 * is what keeps the form's own controls and checks on the same numbers.
 *
 * Two messages are still English, and deliberately so rather than by oversight:
 * the record identifiers below use `identifier()` from `./fields`, whose
 * primitives compose their messages from an English label and have not been
 * converted by their owner yet. Those fields are hidden values the queue puts
 * in the request, never something a moderator types, so a failure there means a
 * crafted request rather than a mistake somebody can read and correct.
 */

/**
 * The bounds a moderation decision is held to, shared by the schemas here and
 * by the form that collects them: `DecisionForm` caps the reason field and the
 * suspension input from this object, so the control cannot offer something the
 * schema will reject. The copy states the same numbers in words.
 */
export const MODERATION_LIMITS = {
  /** Applies to every queue: the reason column is the same width everywhere. */
  reasonMaxLength: 1_200,
  /** A suspension reason is the whole of what the member is told, so it is longer. */
  suspensionReasonMinLength: 10,
  suspensionMinDays: 1,
  /** Beyond ten years, an indefinite suspension is the honest record. */
  suspensionMaxDays: 3_650,
} as const;

/**
 * Keyed by the union: a new decision cannot be added without a message key.
 *
 * The values are keys into the `moderation` namespace, so a caller renders a
 * decision with `t(MODERATION_DECISION_MESSAGE_KEYS[decision])`. The record
 * also derives the `z.enum` tuple below, which is what keeps the schema and the
 * domain union from drifting apart.
 */
export const MODERATION_DECISION_MESSAGE_KEYS: Record<ModerationDecision, string> = {
  approve: 'decision.approve',
  reject: 'decision.reject',
  request_changes: 'decision.request_changes',
  remove_content: 'decision.remove_content',
  suspend_account: 'decision.suspend_account',
  dismiss: 'decision.dismiss',
  change_role: 'decision.change_role',
  delete: 'decision.delete',
};

const decisions = Object.keys(MODERATION_DECISION_MESSAGE_KEYS) as [
  ModerationDecision,
  ...ModerationDecision[],
];

/**
 * Decisions that are told to somebody, and which therefore require a reason.
 *
 * Which reader that is differs by queue — the member for a rejection, the
 * moderation trail for a hold — and the form says which before the reason is
 * typed. What is uniform is that none of these may be recorded as a bare
 * verdict.
 */
const NEGATIVE_DECISIONS: ReadonlySet<string> = new Set<ModerationDecision>([
  'reject',
  'request_changes',
  'remove_content',
  'suspend_account',
]);

const REASON_REQUIRED = validationCode('reason.required');

/** A blank field arrives as null, so a null reason is a blank one. */
function hasReason(value: { reason: string | null }): boolean {
  return value.reason !== null;
}

/**
 * The reason field, identical in every queue.
 *
 * Written out rather than built with `optionalText` from `./fields` for the
 * reason the account schemas give: that helper composes its messages from an
 * English label. The behaviour is the same as
 * `optionalText({ label: 'Reason', max: MODERATION_LIMITS.reasonMaxLength })`.
 */
function reasonField() {
  return z.preprocess(
    blankToNull,
    z
      .string({ error: validationCode('reason.text') })
      .trim()
      .max(MODERATION_LIMITS.reasonMaxLength, { error: validationCode('reason.max') })
      .nullable(),
  );
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
    subjectType: choice(MODERATION_SUBJECT_TYPES, validationCode('subjectType.required')),
    subjectId: identifier('Item under review'),
    decision: choice(decisions, validationCode('decision.required')),
    reason: reasonField(),
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
      validationCode('decision.submission'),
    ),
    reason: reasonField(),
    /**
     * How the place is pinned (0033): the point as submitted by default, or
     * coarser for somewhere sensitive. Changeable afterwards from the console.
     */
    pinPrecision: z.enum(PIN_PRECISIONS).default('exact'),
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
      validationCode('decision.report'),
    ),
    reason: reasonField(),
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
      validationCode('decision.upload'),
    ),
    reason: reasonField(),
  })
  .refine((value) => !NEGATIVE_DECISIONS.has(value.decision) || hasReason(value), {
    error: REASON_REQUIRED,
    path: ['reason'],
  });

/** Suspension is always adverse, so the reason is required outright. */
export const suspendAccountSchema = z.object({
  accountId: identifier('Account'),
  reason: z
    .string({ error: validationCode('reason.suspensionRequired') })
    .trim()
    .min(MODERATION_LIMITS.suspensionReasonMinLength, {
      error: validationCode('reason.suspensionMin'),
    })
    .max(MODERATION_LIMITS.reasonMaxLength, { error: validationCode('reason.max') }),
  /** Omitted for an indefinite suspension, which a second moderator reviews. */
  durationDays: z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: validationCode('duration.number') })
      .int({ error: validationCode('duration.whole') })
      .gte(MODERATION_LIMITS.suspensionMinDays, { error: validationCode('duration.min') })
      .lte(MODERATION_LIMITS.suspensionMaxDays, { error: validationCode('duration.max') })
      .nullable(),
  ),
});

export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;
export type SubmissionDecisionInput = z.infer<typeof submissionDecisionSchema>;
export type ReportResolutionInput = z.infer<typeof reportResolutionSchema>;
export type UploadActionInput = z.infer<typeof uploadActionSchema>;
export type SuspendAccountInput = z.infer<typeof suspendAccountSchema>;
