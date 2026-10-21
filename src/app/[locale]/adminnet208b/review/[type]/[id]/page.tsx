import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AdminShell } from '@/components/admin/AdminShell';
import { intlLocaleOf } from '@/components/challenges/format';
import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { SignalBadge } from '@/components/moderation/SignalBadge';
import { withLocalePrefix } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer, isAdmin } from '@/lib/auth';
import { getModerationQueues } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { formatRelative } from '@/lib/utils';
import { REPORT_REASON_LABELS } from '@/types/domain';

/**
 * One item, everything about it, and the decision. The decision form is the
 * moderation desk's own, so approving, refusing and asking for changes go
 * through the same actions and the same audit trail — this page only lays
 * the item out more plainly.
 */
export const dynamic = 'force-dynamic';

type ReviewType = 'upload' | 'place' | 'report';
const REVIEW_TYPES: readonly ReviewType[] = ['upload', 'place', 'report'];

interface PageProps {
  params: LocaleParams<{ type: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'admin' });
  return buildMetadata({ title: t('review.title'), description: t('inbox.lead'), path: '/adminnet208b', locale, noIndex: true });
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function uploadOptions(t: Translator): readonly DecisionOption[] {
  return [
    { value: 'approve', label: t('decisions.approve'), effect: t('decisions.approveUploadEffect'), reasonRequired: false, reasonAudience: 'internal' },
    { value: 'request_changes', label: t('decisions.askToFix'), effect: t('decisions.askToFixEffect'), reasonRequired: true, reasonAudience: 'member' },
    { value: 'remove_content', label: t('decisions.reject'), effect: t('decisions.rejectUploadEffect'), reasonRequired: true, reasonAudience: 'member', destructive: true },
  ];
}

function placeOptions(t: Translator): readonly DecisionOption[] {
  return [
    { value: 'approve', label: t('decisions.approve'), effect: t('decisions.approvePlaceEffect'), reasonRequired: false, reasonAudience: 'none' },
    { value: 'reject', label: t('decisions.reject'), effect: t('decisions.rejectPlaceEffect'), reasonRequired: true, reasonAudience: 'member', destructive: true },
  ];
}

function reportOptions(t: Translator, removable: boolean): readonly DecisionOption[] {
  const options: DecisionOption[] = [
    { value: 'dismiss', label: t('decisions.dismiss'), effect: t('decisions.dismissEffect'), reasonRequired: false, reasonAudience: 'internal' },
  ];
  if (removable) {
    options.push({ value: 'remove_content', label: t('decisions.removeReported'), effect: t('decisions.removeReportedEffect'), reasonRequired: true, reasonAudience: 'member', destructive: true });
  }
  return options;
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2 text-body">
      <dt className="text-eyebrow text-muted uppercase">{label}</dt>
      <dd className="whitespace-pre-line break-words">{String(value)}</dd>
    </div>
  );
}

export default async function AdminReviewPage({ params }: PageProps) {
  const { locale, type, id } = await readLocaleParams(params);
  setRequestLocale(locale);
  if (!isAdmin(await getViewer())) redirect(withLocalePrefix('/adminnet208b/login', locale));
  if (!REVIEW_TYPES.includes(type as ReviewType)) notFound();

  const [t, queues] = await Promise.all([
    getTranslations({ locale, namespace: 'admin' }),
    getModerationQueues(),
  ]);
  const intlLocale = intlLocaleOf(locale);
  const back = (
    <Link href="/adminnet208b" className="text-caption font-semibold text-muted hover:text-ink">
      ← {t('review.back')}
    </Link>
  );

  if (type === 'upload') {
    const upload = queues.suspiciousUploads.find((entry) => entry.photographId === id);
    if (!upload) notFound();
    const d = upload.details;
    return (
      <AdminShell locale={locale}>
        {back}
        <h1 className="mt-3 text-section font-bold">{upload.title}</h1>
        <p className="mt-1 text-caption text-muted">
          {t('inbox.by', { name: upload.uploader.displayName })} · {formatRelative(upload.createdAt, new Date(), intlLocale)}
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            {d?.displayUrl ? (
              <Image src={d.displayUrl} alt={d.altText ?? ''} width={d.width ?? 1800} height={d.height ?? 1200} sizes="(min-width: 1024px) 60vw, 100vw" className="h-auto w-full rounded-media" />
            ) : (
              <Image src={upload.thumbUrl} alt="" width={320} height={320} className="rounded-media" />
            )}
          </div>
          <div className="min-w-0">
            {upload.signals.length > 0 ? (
              <ul className="mb-5 space-y-2">
                {upload.signals.map((signal, index) => (
                  <li key={index}><SignalBadge locale={locale} severity={signal.severity} label={signal.message} /></li>
                ))}
              </ul>
            ) : null}
            <dl className="divide-y divide-line border-y border-line">
              <Row label={t('review.description')} value={d?.description} />
              <Row label={t('review.altText')} value={d?.altText} />
              <Row label={t('review.category')} value={d?.category} />
              <Row label={t('review.place')} value={d?.location?.name} />
              <Row label={t('review.camera')} value={[d?.camera, d?.lens].filter(Boolean).join(' · ')} />
              <Row label={t('review.exposure')} value={[d?.focalLengthMm ? `${d.focalLengthMm} mm` : null, d?.aperture ? `f/${d.aperture}` : null, d?.shutterSpeed, d?.iso ? `ISO ${d.iso}` : null].filter(Boolean).join(' · ')} />
              <Row label={t('review.capturedAt')} value={d?.capturedAt} />
              <Row label={t('review.editing')} value={[d?.editingSoftware, d?.editingNotes].filter(Boolean).join(' — ')} />
            </dl>
            <div className="mt-6">
              <DecisionForm target={{ kind: 'upload', photographId: upload.photographId }} subjectLabel={upload.title} options={uploadOptions(t)} />
            </div>
          </div>
        </div>
      </AdminShell>
    );
  }

  if (type === 'place') {
    const submission = queues.submissions.find((entry) => entry.id === id);
    if (!submission) notFound();
    const mapHref = `https://www.openstreetmap.org/?mlat=${submission.latitude}&mlon=${submission.longitude}#map=17/${submission.latitude}/${submission.longitude}`;
    return (
      <AdminShell locale={locale}>
        {back}
        <h1 className="mt-3 text-section font-bold">{submission.proposedName}</h1>
        <p className="mt-1 text-caption text-muted">
          {t('inbox.by', { name: submission.submittedBy.displayName })} · {formatRelative(submission.createdAt, new Date(), intlLocale)}
        </p>
        <div className="mt-6 max-w-2xl">
          {submission.signals.length > 0 ? (
            <ul className="mb-5 space-y-2">
              {submission.signals.map((signal, index) => (
                <li key={index}><SignalBadge locale={locale} severity={signal.severity} label={signal.message} /></li>
              ))}
            </ul>
          ) : null}
          <dl className="divide-y divide-line border-y border-line">
            <Row label={t('review.city')} value={`${submission.city}, ${submission.country} (${submission.countryCode})`} />
            <Row label={t('review.coordinates')} value={`${submission.latitude.toFixed(5)}, ${submission.longitude.toFixed(5)}`} />
            <Row label={t('review.note')} value={submission.note} />
          </dl>
          <a href={mapHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-caption font-semibold underline underline-offset-2 hover:text-ink">
            {t('review.openMap')}
          </a>
          <div className="mt-6">
            <DecisionForm target={{ kind: 'submission', submissionId: submission.id }} subjectLabel={submission.proposedName} options={placeOptions(t)} />
          </div>
        </div>
      </AdminShell>
    );
  }

  const report = queues.reports.find((entry) => entry.id === id);
  if (!report) notFound();
  const removable = report.subjectType === 'photograph' || report.subjectType === 'location';
  return (
    <AdminShell locale={locale}>
      {back}
      <h1 className="mt-3 text-section font-bold">{report.subjectLabel}</h1>
      <p className="mt-1 text-caption text-muted">
        {report.reportedBy ? t('inbox.by', { name: report.reportedBy.displayName }) : t('review.anonymousReport')} · {formatRelative(report.createdAt, new Date(), intlLocale)}
      </p>
      <div className="mt-6 max-w-2xl">
        <dl className="divide-y divide-line border-y border-line">
          <Row label={t('review.reportedWhat')} value={report.subjectType} />
          <Row label={t('review.reportReason')} value={REPORT_REASON_LABELS[report.reason]} />
          <Row label={t('review.reportDetails')} value={report.details} />
        </dl>
        <p className="mt-3 text-caption text-muted">{t('review.reportFullDesk')}{' '}
          <Link href="/moderation?queue=reports" className="font-semibold underline underline-offset-2 hover:text-ink">{t('nav.fullDesk')}</Link>
        </p>
        <div className="mt-6">
          <DecisionForm target={{ kind: 'report', reportId: report.id }} subjectLabel={report.subjectLabel} options={reportOptions(t, removable)} />
        </div>
      </div>
    </AdminShell>
  );
}
