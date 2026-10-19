'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { isDemoMode } from '@/lib/config';
import { submitReport } from '@/server/actions/reports';
import {
  REPORT_REASONS,
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
 *
 * The reasons are translated under `report.reason.*`, keyed by the same literal
 * values as `REPORT_REASONS` in `types/domain.ts`. That constant and
 * `REPORT_REASON_LABELS` stay as they are: the value is what is written to the
 * moderation queue and what a moderator reads, and translating the stored
 * reason would make two reports of the same thing look like two different
 * things. Only the words in this form change language.
 *
 * `subjectLabel` arrives already written by the page that opened the dialog,
 * for the same reason the subject of a report is quoted rather than described.
 */

/** Matches `optionalText({ label: 'Details', max: 1_200 })` in the schema. */
const DETAILS_MAX_LENGTH = 1_200;

export function ReportDialog({
  subjectType,
  subjectId,
  subjectLabel,
  triggerLabel,
  triggerVariant = 'ghost',
  className,
}: {
  subjectType: ReportSubjectType;
  subjectId: string;
  subjectLabel: string;
  /** Overrides the generic "Report" on a page that can be more specific. */
  triggerLabel?: string;
  triggerVariant?: 'ghost' | 'secondary';
  className?: string;
}) {
  const t = useTranslations('report');
  // "Cancel" is already translated once, for every dialog in FRAME.
  const common = useTranslations('common');
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
        // The translated sentence, not `result.message`. `submitReport` returns
        // one fixed English success line, and letting it through would answer a
        // Thai form in English. A failure still shows `result.error`, because
        // that one really does vary — see the follow-ups.
        toast.show(t('filed'), 'success');
        return;
      }

      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    } catch {
      setError(t('failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className={className}>
          {triggerLabel ?? t('trigger')}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={t('title')}
        description={t('describeSubject', { subject: subjectLabel })}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{common('cancel')}</Button>
            </DialogClose>
            {configured ? (
              <Button type="submit" form={formId} loading={pending}>
                {t('submit')}
              </Button>
            ) : null}
          </>
        }
      >
        {configured ? null : (
          <Notice tone="warning" title={t('demo.title')} className="mb-5">
            <p>
              {t.rich('demo.body', {
                file: (chunks) => (
                  <code className="font-mono text-[0.95em] font-semibold">{chunks}</code>
                ),
              })}
            </p>
          </Notice>
        )}

        <form id={formId} onSubmit={onSubmit} className="space-y-4">
          <SelectField
            label={t('reasonLabel')}
            required
            disabled={!configured || pending}
            value={reason}
            error={fieldErrors.reason}
            onChange={(event) => setReason(event.target.value as ReportReason | '')}
            hint={t('reasonHint')}
          >
            <option value="">{t('reasonPlaceholder')}</option>
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`reason.${value}`)}
              </option>
            ))}
          </SelectField>

          <TextAreaField
            label={t('detailsLabel')}
            value={details}
            disabled={!configured || pending}
            // The schema refuses "something else" without an explanation, so
            // the form asks for it rather than letting the server say no.
            required={reason === 'other'}
            maxLength={DETAILS_MAX_LENGTH}
            error={fieldErrors.details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={t('detailsPlaceholder')}
            hint={t('detailsHint', {
              reason: t('reason.other'),
              remaining: DETAILS_MAX_LENGTH - details.length,
            })}
          />

          <div className="rounded-card bg-surface-sunken px-4 py-3 text-meta leading-relaxed text-muted">
            <p>{t('byHand')}</p>
            <p className="mt-1.5">
              {t.rich('copyright', {
                policy: (chunks) => (
                  <Link
                    href="/legal/copyright"
                    className="font-semibold text-ink-soft underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>

          {/* The dialog keeps the failure, because a toast that has already
              dismissed itself is no record of what went wrong. */}
          <div aria-live="polite">
            {error ? (
              <Notice tone="danger" title={t('errorTitle')}>
                {error}
              </Notice>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
