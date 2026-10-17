import Link from 'next/link';

import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { MODERATION_DECISION_LABELS } from '@/lib/validation/moderation';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import type { ModerationAction } from '@/types/domain';

/**
 * The audit trail, read-only.
 *
 * `moderation_actions` is append-only in the database — no update or delete
 * privilege is granted to any application role — so there is nothing to edit
 * here and no control that pretends otherwise. A decision that turns out to be
 * wrong is corrected by recording the new one, which is why the trail is read
 * as a sequence rather than a current state.
 */

const SUBJECT_LABELS: Record<ModerationAction['subjectType'], string> = {
  photograph: 'Photograph',
  location: 'Place',
  profile: 'Account',
  collection: 'Collection',
  location_submission: 'Proposed place',
};

/** A quiet tone per outcome. The decision is spelled out either way. */
const DECISION_TONES: Record<ModerationAction['decision'], string> = {
  approve: 'text-success',
  dismiss: 'text-muted',
  request_changes: 'text-warning',
  reject: 'text-danger',
  remove_content: 'text-danger',
  suspend_account: 'text-danger',
};

export function RecentActions({ actions }: { actions: readonly ModerationAction[] }) {
  return (
    <section aria-labelledby="queue-actions">
      <SectionHead
        eyebrow="Record"
        title={<span id="queue-actions">Recent decisions</span>}
        description="Newest first. The trail is append-only, so nothing here can be edited or removed."
      />

      <QueueCapNote shown={actions.length} />

      {actions.length === 0 ? (
        <EmptyState
          title="No decisions recorded yet"
          description="Every decision taken in this dashboard is written here with the moderator who took it."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">
              Moderation decisions, newest first, with the moderator who recorded each one.
            </caption>
            <thead>
              <tr className="border-y border-line">
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  Decision
                </th>
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  Subject
                </th>
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  Reason
                </th>
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  Moderator
                </th>
                <th scope="col" className="py-2.5 text-eyebrow text-muted uppercase">
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.id} className="border-b border-line align-top">
                  <th
                    scope="row"
                    className={cn(
                      'py-3.5 pr-4 text-caption font-bold whitespace-nowrap',
                      DECISION_TONES[action.decision],
                    )}
                  >
                    {MODERATION_DECISION_LABELS[action.decision]}
                  </th>
                  <td className="py-3.5 pr-4 text-caption text-ink-soft">
                    {SUBJECT_LABELS[action.subjectType]}{' '}
                    <span className="font-mono text-meta text-muted" title={action.subjectId}>
                      {action.subjectId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="max-w-[26rem] py-3.5 pr-4 text-caption leading-relaxed text-ink-soft">
                    {action.reason ?? (
                      <span className="text-muted">
                        {action.decision === 'approve' || action.decision === 'dismiss'
                          ? 'None needed'
                          : 'None recorded'}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 pr-4 text-caption whitespace-nowrap">
                    <Link
                      href={`/photographers/${action.moderator.username}`}
                      className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                    >
                      {action.moderator.displayName}
                    </Link>
                  </td>
                  <td className="py-3.5 text-caption whitespace-nowrap text-muted">
                    <time
                      dateTime={action.createdAt}
                      title={formatDate(action.createdAt) ?? undefined}
                    >
                      {formatRelative(action.createdAt)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
