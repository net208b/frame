import Link from 'next/link';

import { buildDiscoverHref } from '@/lib/discover-query';
import { cn } from '@/lib/utils';
import {
  SORT_EXPLANATIONS,
  SORT_LABELS,
  SORT_OPTIONS,
  type DiscoverQuery,
} from '@/types/domain';

/**
 * The four orderings, with the rule for the current one written underneath.
 *
 * FRAME shows how a ranking is computed rather than presenting it as taste, so
 * the explanation is part of the control, not a tooltip. The active tab is
 * marked by weight and a drawn rule as well as `aria-current`, so the current
 * ordering is never carried by colour alone.
 */
export function SortTabs({
  query,
  className,
}: {
  query: DiscoverQuery;
  className?: string;
}) {
  const explanationId = 'discover-sort-explanation';

  return (
    <div className={cn('min-w-0', className)}>
      <div
        role="group"
        aria-label="Sort photographs"
        aria-describedby={explanationId}
        className="flex flex-wrap items-center gap-x-6 gap-y-2.5"
      >
        {SORT_OPTIONS.map((option) => {
          const active = query.sort === option;

          return (
            <Link
              key={option}
              href={buildDiscoverHref(query, { sort: option, page: 1 })}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'relative text-body whitespace-nowrap transition-colors duration-150',
                active ? 'font-bold text-ink' : 'font-semibold text-muted hover:text-ink',
              )}
            >
              {SORT_LABELS[option]}
              {active && (
                <span aria-hidden className="absolute -bottom-1.5 left-0 h-px w-full bg-ink" />
              )}
            </Link>
          );
        })}
      </div>

      <p id={explanationId} className="mt-4 max-w-prose text-meta text-muted">
        {SORT_EXPLANATIONS[query.sort]}
      </p>
    </div>
  );
}
