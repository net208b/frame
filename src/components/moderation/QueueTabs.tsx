import { CopyCheck, Flag, MapPinned, ScanSearch, ScrollText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
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

/** Keyed by the union so a sixth queue cannot be added without an icon. */
const QUEUE_ICONS: Record<QueueKey, typeof MapPinned> = {
  submissions: MapPinned,
  reports: Flag,
  uploads: ScanSearch,
  duplicates: CopyCheck,
  actions: ScrollText,
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
export async function QueueCapNote({
  locale,
  shown,
  className,
}: {
  locale: Locale;
  shown: number;
  className?: string;
}) {
  if (shown < PAGE_SIZE.moderation) return null;

  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <p className={cn('mb-5 text-meta leading-relaxed text-muted', className)}>
      {t('queues.capNote', { limit: PAGE_SIZE.moderation })}
    </p>
  );
}

export async function QueueTabs({
  locale,
  active,
  counts,
  className,
}: {
  locale: Locale;
  active: QueueKey;
  counts: Record<QueueKey, number>;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <nav aria-label={t('queues.navLabel')} className={cn('border-b border-line', className)}>
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
                {t(`queues.${queue}.label`)}
                <span
                  className={cn(
                    'rounded-pill px-1.5 py-0.5 text-meta font-bold tabular-nums',
                    isActive ? 'bg-ink text-on-ink' : 'bg-surface-sunken text-muted',
                  )}
                >
                  {/* The digits are the glance; the whole sentence is what is
                      read out, because "25" on its own counts nothing and
                      "at least 25 reports still open" cannot be assembled from
                      fragments in a language with no spaces between words. */}
                  <span aria-hidden>
                    {count}
                    {capped ? '+' : ''}
                  </span>
                  <span className="sr-only">
                    {capped
                      ? t(`queues.${queue}.countCapped`, { count })
                      : t(`queues.${queue}.count`, { count })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
