import { CopyCheck, Flag, MapPinned, ScanSearch, ScrollText } from 'lucide-react';
import Link from 'next/link';

import { PAGE_SIZE } from '@/lib/config';
import { cn } from '@/lib/utils';

/**
 * The five queues, as real links.
 *
 * Which queue is open lives in the query string rather than in client state, so
 * a moderator can send a colleague the exact queue they are looking at, the
 * back button works, and the whole dashboard stays a Server Component. That is
 * also why these are anchors and not an ARIA tablist: a tablist with no
 * JavaScript behind it is a worse tablist than a set of links.
 */

export const MODERATION_QUEUES = [
  'submissions',
  'reports',
  'uploads',
  'duplicates',
  'actions',
] as const;

export type QueueKey = (typeof MODERATION_QUEUES)[number];

export const QUEUE_LABELS: Record<QueueKey, string> = {
  submissions: 'Pending places',
  reports: 'Reported content',
  uploads: 'Uploads to review',
  duplicates: 'Possible duplicates',
  actions: 'Recent decisions',
};

/** Keyed by the union so a sixth queue cannot be added without an icon. */
const QUEUE_ICONS: Record<QueueKey, typeof MapPinned> = {
  submissions: MapPinned,
  reports: Flag,
  uploads: ScanSearch,
  duplicates: CopyCheck,
  actions: ScrollText,
};

/** What the number on each tab counts, so it is never an unexplained digit. */
const QUEUE_COUNT_NOUNS: Record<QueueKey, string> = {
  submissions: 'awaiting a decision',
  reports: 'still open',
  uploads: 'awaiting a decision',
  duplicates: 'pairs to look at',
  actions: 'recorded recently',
};

export const DEFAULT_QUEUE: QueueKey = 'submissions';

export function isQueueKey(value: string | undefined): value is QueueKey {
  return value !== undefined && MODERATION_QUEUES.some((queue) => queue === value);
}

export function queueHref(queue: QueueKey): string {
  return `/moderation?queue=${queue}`;
}

/**
 * The note a full queue carries.
 *
 * Every moderation read is capped at `PAGE_SIZE.moderation`, so a page that is
 * exactly full is a page with an unknown amount behind it. There is no paging
 * through these queues yet — the repository takes no page argument — so the
 * honest thing is to say that the list is the front of a queue rather than the
 * whole of one.
 */
export function QueueCapNote({ shown, className }: { shown: number; className?: string }) {
  if (shown < PAGE_SIZE.moderation) return null;

  return (
    <p className={cn('mb-5 text-meta leading-relaxed text-muted', className)}>
      This is the first {PAGE_SIZE.moderation} items only, and there may be more behind them.
      Decide these and reload: the queues are not paged yet.
    </p>
  );
}

export function QueueTabs({
  active,
  counts,
  className,
}: {
  active: QueueKey;
  counts: Record<QueueKey, number>;
  className?: string;
}) {
  return (
    <nav aria-label="Moderation queues" className={cn('border-b border-line', className)}>
      {/* The strip scrolls on a narrow screen; the decision controls inside each
          row never do. */}
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {MODERATION_QUEUES.map((queue) => {
          const Icon = QUEUE_ICONS[queue];
          const isActive = queue === active;
          const count = counts[queue];
          // Every queue is read with a limit, so a full page means "at least
          // this many" rather than "this many". Saying 25 when there are 300
          // waiting would make the backlog invisible.
          const capped = count >= PAGE_SIZE.moderation;

          return (
            <li key={queue} className="shrink-0">
              <Link
                href={queueHref(queue)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-3.5 py-3 text-caption whitespace-nowrap',
                  'transition-colors duration-150',
                  isActive
                    ? 'border-ink font-bold text-ink'
                    : 'border-transparent font-medium text-muted hover:text-ink',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {QUEUE_LABELS[queue]}
                <span
                  className={cn(
                    'rounded-pill px-1.5 py-0.5 text-meta font-bold tabular-nums',
                    isActive ? 'bg-ink text-on-ink' : 'bg-surface-sunken text-muted',
                  )}
                >
                  {capped ? <span className="sr-only">at least </span> : null}
                  {count}
                  {capped ? '+' : ''}
                  <span className="sr-only"> {QUEUE_COUNT_NOUNS[queue]}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
