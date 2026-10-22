import { getTranslations } from 'next-intl/server';

import { Chip } from '@/components/ui/Chip';
import { buildDiscoverHref, type DiscoverViewState } from '@/lib/discover-query';
import { taxonomyLabels } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { PHOTO_CATEGORIES } from '@/types/domain';

/**
 * The category row.
 *
 * Every chip is an anchor, so a category is a shareable URL and the back button
 * walks back through the categories a viewer tried. Choosing a category returns
 * to the first page: page four of "Street" is rarely what somebody wanted when
 * they were on page four of everything.
 *
 * The category names come from the shared `taxonomy` namespace rather than from
 * `CATEGORY_LABELS`, so a chip here and the tag on a photograph always read the
 * same words. The URL value stays the English slug — it is an API, and a link
 * to `?category=night` has to open the same gallery in either language.
 */
export async function CategoryFilter({
  query,
  className,
}: {
  query: DiscoverViewState;
  className?: string;
}) {
  const t = await getTranslations('discover');
  const taxonomy = taxonomyLabels(await getTranslations('taxonomy'));

  return (
    <div
      role="group"
      aria-label={t('filters.categoryGroupLabel')}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <Chip
        href={buildDiscoverHref(query, { category: null, page: 1 })}
        active={!query.category}
        ariaLabel={t('filters.allCategoriesLabel')}
      >
        {t('filters.allCategories')}
      </Chip>

      {PHOTO_CATEGORIES.map((category) => (
        <Chip
          key={category}
          href={buildDiscoverHref(query, { category, page: 1 })}
          active={query.category === category}
        >
          {taxonomy.category(category)}
        </Chip>
      ))}
    </div>
  );
}
