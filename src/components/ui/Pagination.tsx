import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Paging as real anchors.
 *
 * A Server Component on purpose: every page of a gallery stays a shareable,
 * back-button-friendly URL instead of client state that disappears on reload.
 * Edges with nowhere to go are rendered as plain text, so a keyboard user never
 * lands on a link that does nothing.
 */

type PageItem = number | 'gap-start' | 'gap-end';

/** First page, last page, and a one-page window either side of the current one. */
function paginationItems(current: number, totalPages: number): PageItem[] {
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(totalPages - 1, current + 1);

  const items: PageItem[] = [1];
  if (windowStart > 2) items.push('gap-start');
  for (let page = windowStart; page <= windowEnd; page += 1) items.push(page);
  if (windowEnd < totalPages - 1) items.push('gap-end');
  if (totalPages > 1) items.push(totalPages);

  return items;
}

const ITEM_BASE =
  'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-pill px-3 text-caption font-semibold';
const LINK =
  'border border-line text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink';
const CURRENT = 'border border-ink bg-ink text-on-ink';
const DISABLED = 'text-muted-soft';

export function Pagination({
  page,
  hasMore,
  totalCount,
  pageSize,
  buildHref,
  className,
}: {
  page: number;
  hasMore: boolean;
  totalCount: number | null;
  pageSize: number;
  buildHref: (page: number) => string;
  className?: string;
}) {
  const current = Math.max(1, Math.floor(page));
  const perPage = Math.max(1, Math.floor(pageSize));
  const totalPages =
    totalCount === null ? null : Math.max(1, Math.ceil(Math.max(0, totalCount) / perPage));

  const hasPrevious = current > 1;
  const hasNext = totalPages === null ? hasMore : current < totalPages;

  // Nothing to page through, so the control would be decoration.
  if (!hasPrevious && !hasNext) return null;

  const items = totalPages === null ? [] : paginationItems(current, totalPages);

  const firstItem = (current - 1) * perPage + 1;
  const summary =
    totalCount === null
      ? `Page ${current}`
      : totalCount === 0
        ? 'Nothing to show'
        : `Showing ${firstItem} to ${Math.min(current * perPage, totalCount)} of ${totalCount}`;

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-col items-center gap-3 border-t border-line pt-6', className)}
    >
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        <li>
          {hasPrevious ? (
            <Link href={buildHref(current - 1)} rel="prev" className={cn(ITEM_BASE, LINK)}>
              <ChevronLeft aria-hidden className="size-3.5" />
              Previous
            </Link>
          ) : (
            <span className={cn(ITEM_BASE, DISABLED)}>
              <ChevronLeft aria-hidden className="size-3.5" />
              Previous
            </span>
          )}
        </li>

        {items.map((item) =>
          typeof item === 'number' ? (
            <li key={item}>
              {item === current ? (
                <span aria-current="page" className={cn(ITEM_BASE, CURRENT)}>
                  {item}
                  <span className="sr-only"> (current page)</span>
                </span>
              ) : (
                <Link
                  href={buildHref(item)}
                  aria-label={`Page ${item}`}
                  className={cn(ITEM_BASE, LINK)}
                >
                  {item}
                </Link>
              )}
            </li>
          ) : (
            <li key={item} aria-hidden className={cn(ITEM_BASE, DISABLED, 'px-1')}>
              &hellip;
            </li>
          ),
        )}

        <li>
          {hasNext ? (
            <Link href={buildHref(current + 1)} rel="next" className={cn(ITEM_BASE, LINK)}>
              Next
              <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          ) : (
            <span className={cn(ITEM_BASE, DISABLED)}>
              Next
              <ChevronRight aria-hidden className="size-3.5" />
            </span>
          )}
        </li>
      </ul>

      <p className="text-meta text-muted-soft tabular-nums">{summary}</p>
    </nav>
  );
}
