import { Copyright } from 'lucide-react';
import Link from 'next/link';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import type { LocationSlugLookup } from '@/components/moderation/SubmissionQueue';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState, Notice } from '@/components/ui/states';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import {
  REPORT_REASON_LABELS,
  type Report,
  type ReportSubjectType,
} from '@/types/domain';

/**
 * Reported content.
 *
 * Two things shape this queue. A copyright report is not an ordinary report —
 * it starts a takedown process with its own published policy — so it is marked
 * out and the policy is linked from the row rather than assumed to be known.
 * And the reporter is an internal detail: who filed a report tells a moderator
 * how to weigh it, and telling anyone else turns reporting into a risk.
 */

const SUBJECT_LABELS: Record<ReportSubjectType, string> = {
  photograph: 'Photograph',
  location: 'Place',
  profile: 'Profile',
  collection: 'Collection',
};

const DISMISS: DecisionOption = {
  value: 'dismiss',
  label: 'Dismiss the report',
  effect:
    'Closes the report and changes nothing. A reason is optional here and still goes on the record.',
  reasonRequired: false,
  reasonAudience: 'internal',
};

/**
 * Closing a report without touching the content.
 *
 * There is no column on a photograph or a place that holds a moderator's note,
 * and FRAME has no member-facing message channel, so this records the note in
 * the moderation trail and nothing else. Saying it "tells the owner" would be
 * the comfortable description and the wrong one.
 */
const ASK: DecisionOption = {
  value: 'request_changes',
  label: 'Close it without removing anything',
  effect:
    'Closes the report and leaves the content up. Your note goes to the moderation trail only — the owner is not told, so contact them separately if they need to act.',
  reasonRequired: true,
  reasonAudience: 'internal',
};

/** A removed photograph carries `removed_reason`, which its owner can read. */
const REMOVE_PHOTOGRAPH: DecisionOption = {
  value: 'remove_content',
  label: 'Remove the photograph',
  effect:
    'Takes it off the public site and closes the report. The reason is stored on the photograph, so the member reads it.',
  reasonRequired: true,
  reasonAudience: 'member',
  destructive: true,
};

/**
 * A place has no reason column, and an unapproved place is invisible to the
 * member who proposed it, so the reason cannot reach them from here.
 */
const REMOVE_LOCATION: DecisionOption = {
  value: 'remove_content',
  label: 'Remove the place',
  effect:
    'Takes the place off the public site and the map, and closes the report. A place stores no reason, so yours stays in the moderation trail.',
  reasonRequired: true,
  reasonAudience: 'internal',
  destructive: true,
};

const SUSPEND: readonly DecisionOption[] = [
  {
    value: 'suspend_account',
    label: 'Suspend the account',
    effect:
      'Blocks every write by this account until a moderator lifts it by hand. Their published work stays up.',
    reasonRequired: true,
    // Written to the profile row, which its owner keeps read access to.
    reasonAudience: 'member',
    destructive: true,
  },
];

/**
 * Row-level security gives moderators an update policy on photographs and
 * places and none on collections, so "remove the content" is genuinely
 * unavailable for a collection or a profile. The action refuses it too; this
 * only keeps a moderator from reaching for a control that cannot work.
 */
function optionsFor(subjectType: ReportSubjectType): readonly DecisionOption[] {
  if (subjectType === 'photograph') return [DISMISS, ASK, REMOVE_PHOTOGRAPH];
  if (subjectType === 'location') return [DISMISS, ASK, REMOVE_LOCATION];
  return [DISMISS, ASK];
}

/**
 * Where a reported subject can be linked, and where it cannot.
 *
 * A report stores its subject's id plus a readable snapshot of its label — not
 * a slug, because the label has to survive the subject being removed, which is
 * often the outcome. Locations can still be resolved, because the page hands
 * down an id-to-slug lookup. A photograph, profile or collection cannot: the
 * read API offers no lookup by id for them, so those fall back to a search for
 * the label, which is at least a link that works.
 */
function subjectLink(
  report: Report,
  locationSlugById: LocationSlugLookup | undefined,
): { href: string; isDirect: boolean } {
  const slug = report.subjectType === 'location' ? locationSlugById?.[report.subjectId] : undefined;
  if (slug) return { href: `/locations/${slug}`, isDirect: true };
  return { href: `/search?q=${encodeURIComponent(report.subjectLabel)}`, isDirect: false };
}

export function ReportQueue({
  reports,
  locationSlugById,
}: {
  reports: readonly Report[];
  locationSlugById?: LocationSlugLookup;
}) {
  return (
    <section aria-labelledby="queue-reports">
      <SectionHead
        eyebrow="Queue"
        title={<span id="queue-reports">Reported content</span>}
        description="Oldest first. Copyright reports follow the published takedown policy."
      />

      <QueueCapNote shown={reports.length} />

      {reports.length === 0 ? (
        <EmptyState
          title="No open reports"
          description="Every report has been resolved. New ones arrive here oldest first."
        />
      ) : (
        <ul className="border-t border-line">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} locationSlugById={locationSlugById} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportRow({
  report,
  locationSlugById,
}: {
  report: Report;
  locationSlugById?: LocationSlugLookup;
}) {
  const isCopyright = report.reason === 'copyright';
  const filedOn = formatDate(report.createdAt);
  const subjectNoun = SUBJECT_LABELS[report.subjectType].toLowerCase();
  const link = subjectLink(report, locationSlugById);

  return (
    <li
      className={cn(
        'border-b border-line py-7 last:border-b-0',
        isCopyright && 'border-l-2 border-l-danger pl-5',
      )}
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-eyebrow text-muted uppercase">
              {SUBJECT_LABELS[report.subjectType]}
            </span>
            {isCopyright ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-bg px-2.5 py-1 text-eyebrow text-danger uppercase">
                <Copyright className="size-3 shrink-0" aria-hidden />
                Copyright
              </span>
            ) : null}
            {report.status === 'reviewing' ? (
              <span className="rounded-pill bg-info-bg px-2.5 py-1 text-eyebrow text-info uppercase">
                Being reviewed
              </span>
            ) : null}
          </p>

          <h3 className="mt-2.5 text-title font-bold">
            <Link
              href={link.href}
              aria-label={
                link.isDirect
                  ? `Open ${report.subjectLabel}, the reported ${subjectNoun}`
                  : `Search FRAME for ${report.subjectLabel}, the reported ${subjectNoun}`
              }
              className="underline decoration-line-strong underline-offset-[3px] hover:decoration-ink"
            >
              {report.subjectLabel}
            </Link>
            {link.isDirect ? null : (
              <span className="ml-2 align-middle text-meta font-medium text-muted">
                by search — no direct link to a {subjectNoun} is on file
              </span>
            )}
          </h3>

          <p className="mt-2 text-caption font-semibold text-ink-soft">
            {REPORT_REASON_LABELS[report.reason]}
          </p>

          {report.details ? (
            <p className="mt-2.5 border-l-2 border-line-strong pl-3.5 text-caption leading-relaxed text-ink-soft">
              {report.details}
            </p>
          ) : (
            <p className="mt-2.5 text-meta text-muted">The reporter added no further detail.</p>
          )}

          <p className="mt-3 text-meta text-muted">
            Filed{' '}
            <time dateTime={report.createdAt} title={filedOn ?? undefined}>
              {formatRelative(report.createdAt)}
            </time>
          </p>

          {/* Internal, and labelled as internal, so it is never mistaken for
              something the reported member is shown. */}
          <p className="mt-3 text-meta text-muted-soft">
            <span className="font-bold uppercase">Internal</span>{' '}
            {report.reportedBy
              ? `reported by @${report.reportedBy.username}`
              : 'the reporting account is no longer on file'}
            {' · '}
            <span className="font-mono">{report.id.slice(0, 8)}</span>
          </p>

          {isCopyright ? (
            <Notice tone="danger" title="This follows the takedown policy" className="mt-4">
              <p>
                A copyright report is handled as a takedown request: the work comes down while the
                claim is checked, and both the member and the claimant are told what happened.
                Read{' '}
                <Link
                  href="/legal/copyright"
                  className="font-semibold underline decoration-current underline-offset-2"
                >
                  the copyright policy
                </Link>{' '}
                before deciding.
              </p>
            </Notice>
          ) : null}

          {report.subjectType === 'collection' || report.subjectType === 'profile' ? (
            <p className="mt-4 text-meta leading-relaxed text-muted">
              FRAME gives moderators no write path over a {subjectNoun}, so this report cannot be
              closed by removing the content.
              {report.subjectType === 'profile'
                ? ' Suspending the account is the control that exists, below.'
                : ' Close it with a note for the trail, or dismiss it, and take the content up with the owner directly.'}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'report', reportId: report.id }}
            subjectLabel={`${subjectNoun} “${report.subjectLabel}”`}
            options={optionsFor(report.subjectType)}
          />

          {report.subjectType === 'profile' ? null : (
            /* A report names what was reported, not who owns it, so there is no
               account id here to suspend. Offering the control anyway would be
               a button with nothing to act on. */
            <p className="text-meta leading-relaxed text-muted">
              Suspending an account needs that account, and a report carries the reported{' '}
              {subjectNoun} rather than its owner. Open the owner&rsquo;s profile and suspend from a
              report filed against it.
            </p>
          )}

          {report.subjectType === 'profile' ? (
            <div className="border-t border-line pt-5">
              <p className="mb-3 text-meta leading-relaxed text-muted">
                A suspension is a separate decision and does not close the report. Resolve the
                report above as well.
              </p>
              <DecisionForm
                target={{ kind: 'account', accountId: report.subjectId }}
                subjectLabel={`the account behind “${report.subjectLabel}”`}
                options={SUSPEND}
                reasonHint="The member reads this as the explanation for their suspension, so it has to say what they did and what would lift it."
              />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
