import { Chip } from '@/components/ui/Chip';
import { buildDiscoverHref } from '@/lib/discover-query';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, PHOTO_CATEGORIES, type DiscoverQuery } from '@/types/domain';

/**
 * The category row.
 *
 * Every chip is an anchor, so a category is a shareable URL and the back button
 * walks back through the categories a viewer tried. Choosing a category returns
 * to the first page: page four of "Street" is rarely what somebody wanted when
 * they were on page four of everything.
 */
export function CategoryFilter({
  query,
  className,
}: {
  query: DiscoverQuery;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by category"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <Chip
        href={buildDiscoverHref(query, { category: null, page: 1 })}
        active={!query.category}
        ariaLabel="All categories"
      >
        All frames
      </Chip>

      {PHOTO_CATEGORIES.map((category) => (
        <Chip
          key={category}
          href={buildDiscoverHref(query, { category, page: 1 })}
          active={query.category === category}
        >
          {CATEGORY_LABELS[category]}
        </Chip>
      ))}
    </div>
  );
}
