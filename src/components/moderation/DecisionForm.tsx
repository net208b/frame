'use client';

import { useId, useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import {
  actOnUpload,
  decideSubmission,
  recordDuplicateReview,
  resolveReport,
  suspendAccount,
} from '@/server/actions/moderation';
import type { ModerationDecision } from '@/types/domain';

/**
 * The controls for one queue item.
 *
 * Nothing here is optimistic. Every decision in this dashboard changes
 * somebody's photograph, place or account, so showing it as done before the
 * server has agreed would be exactly the lie the brief rules out: the form goes
 * pending, then reports what actually happened, and a failure leaves its real
 * message in the page rather than only in a toast that dismisses itself.
 *
 * The reason field is marked required in the markup when the chosen decision
 * needs one, which is a convenience. The action checks it again, the zod schema
 * checks it again, and two database constraints check it a fourth time, because
 * a member told "rejected" and nothing else has been given a verdict rather
 * than an explanation.
 */

export type DecisionTarget =
  | { kind: 'submission'; submissionId: string }
  | { kind: 'report'; reportId: string }
  | { kind: 'upload'; photographId: string }
  | { kind: 'account'; accountId: string }
  | { kind: 'duplicate'; locationId: string };

/**
 * Who can actually read the reason this decision records.
 *
 * It is a property of the decision, not of the form, because it differs
 * decision by decision: a removal reason lands on the member's own row and they
 * read it, whereas a note attached only to `moderation_actions` is readable by
 * moderators alone — row-level security grants that table no member SELECT. The
 * form prints whichever is true, so a moderator is never told to "write it for
 * the member" about a sentence the member will never see.
 */
export type ReasonAudience = 'member' | 'internal' | 'none';

export interface DecisionOption {
  value: ModerationDecision;
  label: string;
  /** What the decision actually does to the subject, in one line. */
  effect: string;
  reasonRequired: boolean;
  reasonAudience: ReasonAudience;
  /** Takes something away from a member, so it is confirmed by name first. */
  destructive?: boolean;
}

const REASON_HINTS: Record<ReasonAudience, string> = {
  member:
    'The member reads this, so write it for them. It has to stand on its own without this queue next to it.',
  internal:
    'This goes to the moderation trail, which only moderators can read. FRAME sends the member no message, so anything they need to hear has to reach them another way.',
  none: 'This decision keeps no reason, so anything typed here is not stored. Leave it empty.',
};

const NEUTRAL_REASON_HINT =
  'Choose a decision above and this will say who reads the reason you write.';

/** The last line of the confirmation, which must not promise the wrong reader. */
const CONFIRM_REASON_NOTE: Record<ReasonAudience, string> = {
  member:
    'The member is shown your reason, and the decision is written to the audit trail under your name.',
  internal:
    'Your reason goes to the audit trail under your name, where only moderators can read it. The member is not told.',
  none: 'The decision is written to the audit trail under your name. No reason is kept.',
};

interface Status {
  tone: 'pending' | 'success';
  message: string;
}

export function DecisionForm({
  target,
  subjectLabel,
  options,
  reasonHint,
  className,
}: {
  target: DecisionTarget;
  /** Names the subject in the confirmation dialog, so it is never "this item". */
  subjectLabel: string;
  options: readonly DecisionOption[];
  /**
   * An extra sentence appended after the audience line, for a queue that needs
   * to say what the reason should contain. It never replaces the audience line,
   * because who reads the reason is not a caller's opinion.
   */
  reasonHint?: string;
  className?: string;
}) {
  const toast = useToast();
  const groupId = useId();

  // Pre-selected only when there is nothing to choose between.
  const [decision, setDecision] = useState<ModerationDecision | null>(
    options.length === 1 ? (options[0]?.value ?? null) : null,
  );
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [isSensitive, setIsSensitive] = useState(false);
  const [withholdCoordinates, setWithholdCoordinates] = useState(false);

  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [recorded, setRecorded] = useState(false);

  const selected = options.find((option) => option.value === decision) ?? null;

  async function dispatch(value: ModerationDecision): Promise<ActionResult<void>> {
    const trimmed = reason.trim();

    if (target.kind === 'submission') {
      return decideSubmission({
        submissionId: target.submissionId,
        decision: value,
        reason: trimmed,
        isSensitive,
        withholdCoordinates,
      });
    }
    if (target.kind === 'report') {
      return resolveReport({ reportId: target.reportId, decision: value, reason: trimmed });
    }
    if (target.kind === 'upload') {
      return actOnUpload({ photographId: target.photographId, decision: value, reason: trimmed });
    }
    if (target.kind === 'account') {
      return suspendAccount({ accountId: target.accountId, reason: trimmed, durationDays });
    }
    return recordDuplicateReview({
      subjectType: 'location',
      subjectId: target.locationId,
      decision: value,
      reason: trimmed,
    });
  }

  async function send(option: DecisionOption): Promise<void> {
    setPending(true);
    setError(null);
    setFieldErrors({});
    setStatus({ tone: 'pending', message: `Recording ${option.label.toLowerCase()}…` });

    try {
      const result = await dispatch(option.value);

      if (result.ok) {
        const message = result.message ?? 'The decision is recorded.';
        setStatus({ tone: 'success', message });
        setRecorded(true);
        setConfirming(false);
        toast.show(message, 'success');
        return;
      }

      setStatus(null);
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setConfirming(false);
      toast.show(result.error, 'danger');
    } catch {
      // A thrown error here is a transport failure, not a refusal: the action
      // returns every expected refusal as a value. Whether the write landed is
      // genuinely unknown, so say that instead of guessing either way.
      setStatus(null);
      setError(
        'The decision could not be sent, so whether it was recorded is unknown. Reload the queue before deciding again.',
      );
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;

    if (!selected) {
      setError('Choose a decision before recording it.');
      return;
    }

    if (selected.reasonRequired && reason.trim().length === 0) {
      const message = 'This decision is shown to the member, so it needs a reason.';
      setError(message);
      setFieldErrors({ reason: message });
      return;
    }

    if (selected.destructive) {
      setConfirming(true);
      return;
    }

    void send(selected);
  }

  const reasonRequired = selected?.reasonRequired ?? false;

  return (
    <div className={cn('min-w-0', className)}>
      {recorded ? null : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <fieldset className="min-w-0">
            <legend className="text-eyebrow text-muted uppercase">Decision</legend>
            <div className="mt-2.5 flex flex-col gap-2">
              {options.map((option) => {
                const id = `${groupId}-${option.value}`;
                return (
                  <div key={option.value} className="flex items-start gap-2.5">
                    <input
                      id={id}
                      type="radio"
                      name={groupId}
                      value={option.value}
                      required
                      checked={decision === option.value}
                      onChange={() => {
                        setDecision(option.value);
                        setError(null);
                      }}
                      className="mt-1 size-4 shrink-0 cursor-pointer accent-ink"
                    />
                    <label htmlFor={id} className="min-w-0 cursor-pointer">
                      <span className="block text-caption font-semibold text-ink">
                        {option.label}
                      </span>
                      <span className="block text-meta leading-relaxed text-muted">
                        {option.effect}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* Only on an approval: these flags describe how a place is published,
              so offering them beside a rejection would imply they still apply. */}
          {target.kind === 'submission' && decision === 'approve' ? (
            <fieldset className="min-w-0 rounded-card border border-line bg-surface px-4 py-3.5">
              <legend className="px-1 text-eyebrow text-muted uppercase">
                Coordinate privacy
              </legend>
              <p className="text-meta leading-relaxed text-muted">
                Taken once, here. Precision is only ever reduced on publication, never widened
                afterwards, and withholding the point overrides reduced precision.
              </p>
              <div className="mt-3 flex flex-col gap-2.5">
                <CheckboxField
                  label="Publish at reduced precision"
                  description="About a kilometre instead of about eleven metres. For a place where the exact point could expose a person or a private address."
                  checked={isSensitive}
                  onChange={(event) => setIsSensitive(event.currentTarget.checked)}
                />
                <CheckboxField
                  label="Publish no coordinate at all"
                  description="The place is listed and searchable but carries no point on the map."
                  checked={withholdCoordinates}
                  onChange={(event) => setWithholdCoordinates(event.currentTarget.checked)}
                />
              </div>
            </fieldset>
          ) : null}

          {target.kind === 'account' ? (
            <TextField
              label="Suspension length in days"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={durationDays}
              onChange={(event) => setDurationDays(event.currentTarget.value)}
              error={fieldErrors.durationDays ?? null}
              hint="Leave this empty for an indefinite suspension. FRAME has no scheduled job that lifts one, so whatever you enter is recorded in the reason the member reads and a moderator ends the suspension by hand."
            />
          ) : null}

          <TextAreaField
            label="Reason"
            rows={3}
            required={reasonRequired}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            error={fieldErrors.reason ?? null}
            hint={
              selected
                ? `${REASON_HINTS[selected.reasonAudience]}${reasonHint ? ` ${reasonHint}` : ''}`
                : NEUTRAL_REASON_HINT
            }
          />

          {/* A flex row, so the button keeps its natural width inside the column. */}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              size="sm"
              variant={selected?.destructive ? 'danger' : 'primary'}
              loading={pending}
            >
              {selected ? `Record: ${selected.label}` : 'Record decision'}
            </Button>
          </div>
        </form>
      )}

      {/* Always mounted, so a screen reader hears the change rather than the
          arrival of a region that was already populated. */}
      <p
        role="status"
        className={cn(
          'text-meta leading-relaxed',
          status?.tone === 'success' ? 'font-semibold text-success' : 'text-muted',
          status ? 'mt-3' : '',
        )}
      >
        {status?.message ?? ''}
      </p>
      <p role="alert" className={cn('text-meta leading-relaxed text-danger', error ? 'mt-2' : '')}>
        {error ?? ''}
      </p>

      {selected?.destructive ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) => {
            if (!pending) setConfirming(open);
          }}
          title={selected.label}
          body={`${selected.effect} This applies to ${subjectLabel}. ${CONFIRM_REASON_NOTE[selected.reasonAudience]}`}
          confirmLabel={selected.label}
          pending={pending}
          onConfirm={() => void send(selected)}
        />
      ) : null}
    </div>
  );
}
