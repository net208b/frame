'use client';

import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/Field';
import { cn, formatCount } from '@/lib/utils';
import { CATEGORY_LABELS, type PhotoCategory } from '@/types/domain';

export interface CategoryOption {
  category: PhotoCategory;
  count: number;
}

/**
 * The map's filters: free-text place search and the category chips.
 *
 * The result count sits in a polite live region, because filtering here changes
 * what the map draws, and a change a sighted viewer sees as pins disappearing
 * is otherwise silent. The chips carry their own counts so it is clear in
 * advance that a filter will not empty the map.
 */
export function MapFilterBar({
  query,
  onQueryChange,
  options,
  activeCategories,
  onToggleCategory,
  matchingCount,
  totalCount,
  onReset,
  className,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  options: readonly CategoryOption[];
  activeCategories: readonly PhotoCategory[];
  onToggleCategory: (category: PhotoCategory) => void;
  matchingCount: number;
  totalCount: number;
  onReset: () => void;
  className?: string;
}) {
  const filtered = query.trim().length > 0 || activeCategories.length > 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <TextField
        label="Search places"
        hideLabel
        type="search"
        value={query}
        placeholder="Search by place, city or country"
        onChange={(event) => onQueryChange(event.target.value)}
      />

      {options.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const active = activeCategories.includes(option.category);
            return (
              <li key={option.category}>
                <Chip
                  active={active}
                  count={option.count}
                  onClick={() => onToggleCategory(option.category)}
                  ariaLabel={`${CATEGORY_LABELS[option.category]}, ${formatCount(option.count)} ${
                    option.count === 1 ? 'location' : 'locations'
                  }`}
                >
                  {CATEGORY_LABELS[option.category]}
                </Chip>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-meta text-muted">
          {filtered
            ? `${formatCount(matchingCount)} of ${formatCount(totalCount)} locations match`
            : `${formatCount(totalCount)} ${totalCount === 1 ? 'location' : 'locations'} pinned`}
        </p>

        {filtered ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
