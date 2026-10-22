import { getTranslations } from 'next-intl/server';

import { Chip } from '@/components/ui/Chip';
import { buildDiscoverHref, type DiscoverViewState } from '@/lib/discover-query';
import { taxonomyLabels } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { PHOTO_CATEGORIES, PHOTOGRAPHY_STYLES } from '@/types/domain';

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

/**
 * The style row, under the categories.
 *
 * A second row rather than more chips in the first, because these answer a
 * different question: a category is what the photograph is OF, a style is how
 * it was MADE (0045). Mixing them into one row would have been the conflation
 * `domain.ts` keeps the two axes apart to avoid — and they combine, so a reader
 * can ask for street photography in black and white and get both.
 *
 * Named from `common.photographyStyles`, the same words a photographer puts on
 * their own profile.
 */
export async function StyleFilter({
  query,
  className,
}: {
  query: DiscoverViewState;
  className?: string;
}) {
  const t = await getTranslations('discover');
  const common = await getTranslations('common');

  return (
    <div
      role="group"
      aria-label={t('filters.styleGroupLabel')}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <Chip
        href={buildDiscoverHref(query, { style: null, page: 1 })}
        active={!query.style}
        ariaLabel={t('filters.allStylesLabel')}
      >
        {t('filters.allStyles')}
      </Chip>

      {PHOTOGRAPHY_STYLES.map((style) => (
        <Chip
          key={style}
          href={buildDiscoverHref(query, { style, page: 1 })}
          active={query.style === style}
        >
          {common(`photographyStyles.${style}`)}
        </Chip>
      ))}
    </div>
  );
}
