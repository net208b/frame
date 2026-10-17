import { X } from 'lucide-react';
import Link from 'next/link';

import {
  activeDiscoverFilters,
  buildClearedDiscoverHref,
  buildDiscoverHrefWithout,
} from '@/lib/discover-query';
import { cn } from '@/lib/utils';
import type { DiscoverQuery } from '@/types/domain';

/**
 * The filters currently narrowing the gallery, each one removable.
 *
 * This is the way out of a dead end: a viewer who has stacked a category, a
 * place and a camera and found nothing can drop exactly one of them without
 * reconstructing the whole query. Every pill is a link, so removing a filter
 * works with the keyboard, in a new tab, and with JavaScript unavailable.
 */
export function ActiveFilters({
  query,
  className,
}: {
  query: DiscoverQuery;
  className?: string;
}) {
  const filters = activeDiscoverFilters(query);
  if (filters.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-eyebrow text-muted uppercase">
        {filters.length === 1 ? '1 filter' : `${filters.length} filters`}
      </span>

      {filters.map((filter) => (
        <Link
          key={`${filter.key}:${filter.value}`}
          href={buildDiscoverHrefWithout(query, filter.key)}
          aria-label={`Remove the ${filter.kind.toLowerCase()} filter ${filter.value}`}
          className={cn(
            'group inline-flex items-center gap-2 rounded-pill border border-line bg-surface',
            'py-1.5 pr-2.5 pl-3 text-meta text-ink-soft',
            'transition-colors duration-150 hover:border-line-strong hover:text-ink',
          )}
        >
          <span className="text-muted-soft">{filter.kind}</span>
          <span className="font-semibold">{filter.value}</span>
          <X aria-hidden className="size-3.5 text-muted-soft group-hover:text-ink" />
        </Link>
      ))}

      <Link
        href={buildClearedDiscoverHref(query)}
        className="ml-1 text-meta font-semibold text-ink underline underline-offset-4 transition-opacity duration-150 hover:opacity-65"
      >
        Clear all
      </Link>
    </div>
  );
}
