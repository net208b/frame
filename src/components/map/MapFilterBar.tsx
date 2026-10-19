'use client';

import { RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/Field';
import { taxonomyLabels } from '@/lib/taxonomy';
import { cn, formatCount } from '@/lib/utils';
import { type PhotoCategory } from '@/types/domain';

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
 *
 * The category names come from `lib/taxonomy.ts` rather than from this file, so
 * a category reads identically here, on Discover, on a photograph and in the
 * upload steps.
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
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const taxonomy = taxonomyLabels(useTranslations('taxonomy'));
  const locale = useLocale();

  const filtered = query.trim().length > 0 || activeCategories.length > 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <TextField
        label={t('filters.searchLabel')}
        hideLabel
        type="search"
        value={query}
        placeholder={t('filters.searchPlaceholder')}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      {options.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const active = activeCategories.includes(option.category);
            const label = taxonomy.category(option.category);

            return (
              <li key={option.category}>
                <Chip
                  active={active}
                  count={option.count}
                  onClick={() => onToggleCategory(option.category)}
                  // The visible chip is a name and a bare number side by side;
                  // the accessible name says what the number counts, as one
                  // sentence rather than a word stitched onto a figure.
                  ariaLabel={t('filters.categoryOption', {
                    category: label,
                    count: option.count,
                  })}
                >
                  {label}
                </Chip>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-meta text-muted">
          {filtered
            ? t('filters.matching', {
                count: matchingCount,
                matching: formatCount(matchingCount, locale),
                total: formatCount(totalCount, locale),
              })
            : t('filters.pinned', {
                count: totalCount,
                formatted: formatCount(totalCount, locale),
              })}
        </p>

        {filtered ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden className="size-3.5" />
            {tCommon('clear')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
