'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { TextAreaField, TextField } from '@/components/ui/Field';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { isValidationCode } from '@/lib/validation/codes';
import { MODERATION_LIMITS } from '@/lib/validation/moderation';
import {
  actOnUpload,
  decideSubmission,
  recordDuplicateReview,
  resolveReport,
  suspendAccount,
} from '@/server/actions/moderation';
import { PIN_PRECISIONS, type ModerationDecision, type PinPrecision } from '@/types/domain';

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
 *
 * LANGUAGE. The decisions themselves arrive already translated: each queue is a
 * Server Component and writes its own `DecisionOption` list with its own
 * translator, because what a decision does is queue-specific prose and this
 * component has no business holding five queues' worth of it. What this
 * component translates is its own furniture — the legend, the reason hint, the
 * confirmation — and the refusals that come back from the server. Those arrive
 * as validation codes (see `src/lib/validation/codes.ts`), which are resolved
 * here, in the language the moderator is actually reading.
 */

export type DecisionTarget =
  | { kind: 'submission'; submissionId: string }
  | { kind: 'report'; reportId: string }
  | { kind: 'upload'; photographId: string }
  | { kind: 'account'; accountId: string }
  | { kind: 'duplicate'; locationId: string; otherLocationId: string };

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
  /** Already translated by the queue that offers it. */
  label: string;
  /** What the decision actually does to the subject, in one line. Translated. */
  effect: string;
  reasonRequired: boolean;
  reasonAudience: ReasonAudience;
  /**
   * Tells two options with the same decision apart — the duplicate queue
   * offers `merge` in both directions. Defaults to the decision value, which
   * is unique everywhere else.
   */
  id?: string;
  /**
   * Fields the option itself decides, sent with the decision. The duplicate
   * queue uses it to say which of two places survives a merge (0039): the
   * form has one target, and the direction is the option's to choose.
   */
  extra?: Record<string, string>;
  /** Takes something away from a member, so it is confirmed by name first. */
  destructive?: boolean;
}

interface Status {
  tone: 'pending' | 'success';
  message: string;
}

/** A whole-number day count, or null for "left blank", or false for "not a number". */
function parseDays(raw: string): number | null | false {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : false;
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
  const t = useTranslations('moderation');
  const toast = useToast();
  const groupId = useId();

  /**
   * One refusal from the server, in the reader's language.
   *
   * A schema emits a key; an action can also file a sentence it wrote itself,
   * which is passed through. `t.has` is checked first so a key with no copy
   * behind it shows a plain sentence rather than printing
   * `validation.reason.required` at a moderator.
   */
  function resolve(message: string): string {
    if (!isValidationCode(message)) return message;
    return t.has(message) ? t(message) : t('validation.fallback');
  }

  // Pre-selected only when there is nothing to choose between.
  // The key of the chosen option — its id, or its decision value where that
  // is unique. Pre-selected only when there is nothing to choose between.
  const [decision, setDecision] = useState<string | null>(
    options.length === 1 ? (options[0] ? (options[0].id ?? options[0].value) : null) : null,
  );
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [pinPrecision, setPinPrecision] = useState<PinPrecision>('exact');

  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [recorded, setRecorded] = useState(false);

  const optionKey = (option: DecisionOption): string => option.id ?? option.value;
  const selected = options.find((option) => optionKey(option) === decision) ?? null;

  async function dispatch(option: DecisionOption): Promise<ActionResult<void>> {
    const value = option.value;
    const trimmed = reason.trim();

    if (target.kind === 'submission') {
      return decideSubmission({
        submissionId: target.submissionId,
        decision: value,
        reason: trimmed,
        pinPrecision,
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
      ...(option.extra ?? {}),
    });
  }

  async function send(option: DecisionOption): Promise<void> {
    setPending(true);
    setError(null);
    setFieldErrors({});
    setStatus({ tone: 'pending', message: t('form.recording', { decision: option.label }) });

    try {
      const result = await dispatch(option);

      if (result.ok) {
        // The action's own sentence, not one written here: several of these say
        // something specific about what was published or taken down, and a
        // generic replacement would claim less than happened.
        const message = result.message ?? t('form.recorded');
        setStatus({ tone: 'success', message });
        setRecorded(true);
        setConfirming(false);
        toast.show(message, 'success');
        return;
      }

      const resolvedFields: Record<string, string> = {};
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        resolvedFields[field] = resolve(message);
      }

      /*
       * `parseForm` builds its summary from the issues it found, so for a single
       * failed field that summary is the field's own code, which resolves. When
       * several failed it is a sentence written in English in
       * `src/lib/validation/index.ts`, which this namespace does not own — so
       * the count is recomputed and the summary taken from here instead.
       */
      const fieldCount = Object.keys(resolvedFields).length;
      const summary =
        result.code === 'validation' && fieldCount > 1
          ? t('validation.fallback')
          : resolve(result.error);

      setStatus(null);
      setError(summary);
      setFieldErrors(resolvedFields);
      setConfirming(false);
      toast.show(summary, 'danger');
    } catch {
      // A thrown error here is a transport failure, not a refusal: the action
      // returns every expected refusal as a value. Whether the write landed is
      // genuinely unknown, so say that instead of guessing either way.
      setStatus(null);
      setError(t('form.transportFailure'));
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  /**
   * The checks the form makes before it sends anything.
   *
   * Each one tests a rule the schema also tests, and says so with the same
   * message the schema would have produced — the shared ones by resolving the
   * schema's own key. A moderator therefore reads the same sentence whether the
   * form caught it or the server did.
   */
  function fail(message: string, field?: string): void {
    setError(message);
    setFieldErrors(field ? { [field]: message } : {});
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;

    if (!selected) {
      fail(t('form.chooseDecision'));
      return;
    }

    const trimmedReason = reason.trim();

    if (selected.reasonRequired && trimmedReason.length === 0) {
      fail(
        selected.reasonAudience === 'member'
          ? t('form.reasonRequired.member')
          : t('form.reasonRequired.internal'),
        'reason',
      );
      return;
    }

    if (target.kind === 'account') {
      if (trimmedReason.length < MODERATION_LIMITS.suspensionReasonMinLength) {
        fail(t('validation.reason.suspensionMin'), 'reason');
        return;
      }

      const days = parseDays(durationDays);
      if (days === false) {
        fail(t('validation.duration.number'), 'durationDays');
        return;
      }
      if (days !== null) {
        if (!Number.isInteger(days)) {
          fail(t('validation.duration.whole'), 'durationDays');
          return;
        }
        if (days < MODERATION_LIMITS.suspensionMinDays) {
          fail(t('validation.duration.min'), 'durationDays');
          return;
        }
        if (days > MODERATION_LIMITS.suspensionMaxDays) {
          fail(t('validation.duration.max'), 'durationDays');
          return;
        }
      }
    }

    setError(null);
    setFieldErrors({});

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
            <legend className="text-eyebrow text-muted uppercase">
              {t('form.decisionLegend')}
            </legend>
            <div className="mt-2.5 flex flex-col gap-2">
              {options.map((option) => {
                const id = `${groupId}-${optionKey(option)}`;
                return (
                  <div key={optionKey(option)} className="flex items-start gap-2.5">
                    <input
                      id={id}
                      type="radio"
                      name={groupId}
                      value={option.value}
                      required
                      checked={decision === optionKey(option)}
                      onChange={() => {
                        setDecision(optionKey(option));
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
                {t('form.coordinatePrivacy.legend')}
              </legend>
              <p className="text-meta leading-relaxed text-muted">
                {t('form.coordinatePrivacy.intro')}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {PIN_PRECISIONS.map((option) => (
                  <label key={option} className="flex cursor-pointer items-start gap-3 rounded-card border border-line p-3 has-[:checked]:border-ink">
                    <input
                      type="radio"
                      name={`${groupId}-precision`}
                      value={option}
                      checked={pinPrecision === option}
                      onChange={() => setPinPrecision(option)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-body font-semibold">{t(`form.coordinatePrivacy.options.${option}.label`)}</span>
                      <span className="block text-meta text-muted">{t(`form.coordinatePrivacy.options.${option}.description`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {target.kind === 'account' ? (
            <TextField
              label={t('form.suspension.label')}
              type="number"
              inputMode="numeric"
              min={MODERATION_LIMITS.suspensionMinDays}
              max={MODERATION_LIMITS.suspensionMaxDays}
              value={durationDays}
              onChange={(event) => setDurationDays(event.currentTarget.value)}
              error={fieldErrors.durationDays ?? null}
              hint={t('form.suspension.hint')}
            />
          ) : null}

          <TextAreaField
            label={t('form.reasonLabel')}
            rows={3}
            required={reasonRequired}
            maxLength={MODERATION_LIMITS.reasonMaxLength}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            error={fieldErrors.reason ?? null}
            hint={
              selected
                ? `${t(`form.reasonHint.${selected.reasonAudience}`)}${reasonHint ? ` ${reasonHint}` : ''}`
                : t('form.reasonHint.neutral')
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
              {selected
                ? t('form.submitWithDecision', { decision: selected.label })
                : t('form.submit')}
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
          body={t('form.confirmBody', {
            effect: selected.effect,
            subject: subjectLabel,
            note: t(`form.confirmNote.${selected.reasonAudience}`),
          })}
          confirmLabel={selected.label}
          pending={pending}
          onConfirm={() => void send(selected)}
        />
      ) : null}
    </div>
  );
}
