import Link from 'next/link';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { SignalBadge, SUBMISSION_SIGNAL_LABELS } from '@/components/moderation/SignalBadge';
import { Avatar } from '@/components/photographer/Avatar';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { precisionLabel } from '@/lib/geo';
import { formatCoordinates, formatDate, formatRelative } from '@/lib/utils';
import type { LocationSubmission } from '@/types/domain';

/**
 * Proposed places waiting for a human.
 *
 * Nothing in FRAME approves a place automatically. The checks on each row can
 * say a point sits outside its country's bounding box or within a hundred
 * metres of a place already on the map; none of them can say the place exists,
 * is reachable, or is safe to publish the exact position of. That last question
 * is answered on this screen, which is why the coordinate-privacy controls sit
 * inside the decision rather than somewhere a moderator might not look.
 */

const OPTIONS: readonly DecisionOption[] = [
  {
    value: 'approve',
    label: 'Approve',
    effect:
      'Publishes the place, credits the member, and puts it on the map at the precision chosen below. An approval records no reason.',
    reasonRequired: false,
    // approve_location_submission() writes its own audit row with a null
    // reason, so a sentence typed here would go nowhere at all.
    reasonAudience: 'none',
  },
  {
    value: 'request_changes',
    label: 'Ask for changes',
    effect:
      'Leaves the place unpublished and shows the member your reason, so they can send a corrected proposal.',
    reasonRequired: true,
    // Stored on the submission row, which its submitter can read.
    reasonAudience: 'member',
  },
  {
    value: 'reject',
    label: 'Reject',
    effect: 'Closes the proposal for good. The member reads your reason.',
    reasonRequired: true,
    reasonAudience: 'member',
    destructive: true,
  },
];

/**
 * Approved places keyed by id.
 *
 * A duplicate signal carries the id of the place it matched, and a location
 * page is addressed by slug, so without this lookup the only link available is
 * a search for the label. Built once by the page from the map pins.
 */
export type LocationSlugLookup = Readonly<Record<string, string>>;

export function SubmissionQueue({
  submissions,
  locationSlugById,
}: {
  submissions: readonly LocationSubmission[];
  locationSlugById?: LocationSlugLookup;
}) {
  return (
    <section aria-labelledby="queue-submissions">
      <SectionHead
        eyebrow="Queue"
        title={<span id="queue-submissions">Pending places</span>}
        description="Oldest first. A place is only ever published by a person, never by a check."
      />

      <QueueCapNote shown={submissions.length} />

      {submissions.length === 0 ? (
        <EmptyState
          title="No places are waiting"
          description="Every proposal has been decided. New submissions arrive here oldest first."
        />
      ) : (
        <ul className="border-t border-line">
          {submissions.map((submission) => (
            <SubmissionRow
              key={submission.id}
              submission={submission}
              locationSlugById={locationSlugById}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SubmissionRow({
  submission,
  locationSlugById,
}: {
  submission: LocationSubmission;
  locationSlugById?: LocationSlugLookup;
}) {
  const submittedOn = formatDate(submission.createdAt);
  const place = [submission.city, submission.country].filter(Boolean).join(', ');

  return (
    <li className="border-b border-line py-7 last:border-b-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="min-w-0">
          <h3 className="text-title font-bold">{submission.proposedName}</h3>

          <dl className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-meta text-muted">
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Place</dt>
              <dd className="text-ink-soft">
                {place || 'No city or country given'}
                {submission.countryCode ? ` (${submission.countryCode})` : ''}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Submitted coordinates</dt>
              <dd className="font-mono tabular-nums text-ink-soft">
                {formatCoordinates(
                  submission.latitude,
                  submission.longitude,
                  LOCATION_POLICY.publicCoordinateDecimals,
                )}
                <span className="ml-1.5 font-sans text-muted">
                  ({precisionLabel(LOCATION_POLICY.publicCoordinateDecimals)})
                </span>
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Waiting</dt>
              <dd>
                <time dateTime={submission.createdAt} title={submittedOn ?? undefined}>
                  {formatRelative(submission.createdAt)}
                </time>
              </dd>
            </div>
          </dl>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-muted">
            <Avatar
              src={submission.submittedBy.avatarUrl}
              name={submission.submittedBy.displayName}
              size={24}
              decorative
            />
            <span>
              Proposed by{' '}
              <Link
                href={`/photographers/${submission.submittedBy.username}`}
                className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
              >
                {submission.submittedBy.displayName}
              </Link>
            </span>
          </p>

          {submission.note ? (
            <p className="mt-3 border-l-2 border-line-strong pl-3.5 text-caption leading-relaxed text-ink-soft">
              {submission.note}
            </p>
          ) : null}

          {submission.signals.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {submission.signals.map((signal, index) => (
                <SignalBadge
                  // Signals are a derived list with no ids of their own, so the
                  // kind plus its position is the only stable key available.
                  key={`${signal.kind}-${index}`}
                  severity={signal.severity}
                  label={SUBMISSION_SIGNAL_LABELS[signal.kind]}
                  message={signal.message}
                >
                  {signal.kind === 'possible-duplicate' && signal.relatedLabel ? (
                    <DuplicateSignalLink
                      label={signal.relatedLabel}
                      slug={
                        signal.relatedId === undefined
                          ? undefined
                          : locationSlugById?.[signal.relatedId]
                      }
                      distanceMetres={signal.distanceMetres}
                    />
                  ) : null}
                </SignalBadge>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-meta text-muted">
              No automated check flagged this proposal, which is not the same as it being right.
            </p>
          )}
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'submission', submissionId: submission.id }}
            subjectLabel={`${submission.proposedName}${place ? `, ${place}` : ''}`}
            options={OPTIONS}
          />
        </div>
      </div>
    </li>
  );
}

const LINK_CLASSES =
  'font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

/**
 * The place a submission may duplicate.
 *
 * It links straight to the location page when the slug could be resolved. When
 * it could not — a place that withholds its coordinates has no map pin and so
 * is not in the lookup — it falls back to a search for the label and says so,
 * rather than guessing a URL that would 404.
 */
function DuplicateSignalLink({
  label,
  slug,
  distanceMetres,
}: {
  label: string;
  slug: string | undefined;
  distanceMetres: number | undefined;
}) {
  return (
    <span className="text-meta text-muted">
      <Link href={slug ? `/locations/${slug}` : `/search?q=${encodeURIComponent(label)}`} className={LINK_CLASSES}>
        {label}
      </Link>
      {slug ? null : <span> (by search — this place publishes no map point)</span>}
      {distanceMetres === undefined ? null : ` · ${distanceMetres} m away`}
    </span>
  );
}
