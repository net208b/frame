'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { isDemoMode } from '@/lib/config';
import { submitReport } from '@/server/actions/reports';
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportSubjectType,
} from '@/types/domain';

/**
 * The report dialog, shared by the photograph, location, profile and
 * collection pages.
 *
 * A visitor without an account can file a report, because the person who
 * recognises their own stolen photograph is often not a member. Nothing here
 * claims more than it can deliver: a failed submission keeps the dialog open
 * with the real reason beside the form, and in a deployment with no database
 * the dialog says so instead of collecting a report it cannot store.
 */

/** Matches `optionalText({ label: 'Details', max: 1_200 })` in the schema. */
const DETAILS_MAX_LENGTH = 1_200;

export function ReportDialog({
  subjectType,
  subjectId,
  subjectLabel,
  triggerLabel = 'Report',
  triggerVariant = 'ghost',
  className,
}: {
  subjectType: ReportSubjectType;
  subjectId: string;
  subjectLabel: string;
  triggerLabel?: string;
  triggerVariant?: 'ghost' | 'secondary';
  className?: string;
}) {
  const toast = useToast();
  const formId = useId();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const configured = !isDemoMode();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) return;
    // Closing discards the draft, so reopening never shows a stale error about
    // a submission the reader has already walked away from.
    setReason('');
    setDetails('');
    setError(null);
    setFieldErrors({});
    setPending(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !configured) return;

    setPending(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await submitReport({
        subjectType,
        subjectId,
        reason,
        details,
      });

      if (result.ok) {
        onOpenChange(false);
        toast.show(result.message ?? 'Report filed. A moderator will review it.', 'success');
        return;
      }

      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    } catch {
      setError(
        'Your report could not be sent. Check your connection and try again — nothing has been filed.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className={className}>
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Report this item"
        description={`You are reporting ${subjectLabel}.`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            {configured ? (
              <Button type="submit" form={formId} loading={pending}>
                Send report
              </Button>
            ) : null}
          </>
        }
      >
        {configured ? null : (
          <Notice tone="warning" title="Reports cannot be filed in this build" className="mb-5">
            <p>
              No database is configured, so there is no moderation queue to file into and nothing
              typed here would be stored. See{' '}
              <code className="font-mono text-[0.95em] font-semibold">docs/ENVIRONMENT.md</code>{' '}
              for the environment variables that connect one.
            </p>
          </Notice>
        )}

        <form id={formId} onSubmit={onSubmit} className="space-y-4">
          <SelectField
            label="Reason"
            required
            disabled={!configured || pending}
            value={reason}
            error={fieldErrors.reason}
            onChange={(event) => setReason(event.target.value as ReportReason | '')}
            hint="Pick the closest match — the detail you add below matters more than the category."
          >
            <option value="">Choose a reason</option>
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {REPORT_REASON_LABELS[value]}
              </option>
            ))}
          </SelectField>

          <TextAreaField
            label="Details"
            value={details}
            disabled={!configured || pending}
            // The schema refuses "something else" without an explanation, so
            // the form asks for it rather than letting the server say no.
            required={reason === 'other'}
            maxLength={DETAILS_MAX_LENGTH}
            error={fieldErrors.details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Anything that would help a moderator see what you are seeing."
            hint={`Optional, unless the reason is “something else”. ${
              DETAILS_MAX_LENGTH - details.length
            } characters left.`}
          />

          <div className="rounded-card bg-surface-sunken px-4 py-3 text-meta leading-relaxed text-muted">
            <p>
              A moderator reviews each report by hand. Nothing is removed automatically, and the
              person you are reporting is not shown who filed it.
            </p>
            <p className="mt-1.5">
              A copyright claim is handled under the takedown policy rather than this queue, so read{' '}
              <Link
                href="/legal/copyright"
                className="font-semibold text-ink-soft underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
              >
                the copyright and takedown policy
              </Link>{' '}
              before filing one — it sets out what a claim has to contain.
            </p>
          </div>

          {/* The dialog keeps the failure, because a toast that has already
              dismissed itself is no record of what went wrong. */}
          <div aria-live="polite">
            {error ? (
              <Notice tone="danger" title="This report was not filed">
                {error}
              </Notice>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
