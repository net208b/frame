import { X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import {
  activeDiscoverFilters,
  buildClearedDiscoverHref,
  buildDiscoverHrefWithout,
} from '@/lib/discover-query';
import { Link } from '@/i18n/navigation';
import { taxonomyLabels } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import type { DiscoverQuery } from '@/types/domain';

/**
 * The filters currently narrowing the gallery, each one removable.
 *
 * This is the way out of a dead end: a viewer who has stacked a category, a
 * place and a camera and found nothing can drop exactly one of them without
 * reconstructing the whole query. Every pill is a link, so removing a filter
 * works with the keyboard, in a new tab, and with JavaScript unavailable.
 *
 * The accessible name of a pill is a whole sentence per filter kind rather than
 * one sentence with the kind slotted in. "Remove the camera filter Fujifilm"
 * and "ลบตัวกรองกล้อง Fujifilm" put the words in different orders, and the
 * English version needs the kind in lower case while Thai has no case at all —
 * so the kind is part of the message, not a variable inside it.
 */
export async function ActiveFilters({
  query,
  className,
}: {
  query: DiscoverQuery;
  className?: string;
}) {
  const filters = activeDiscoverFilters(query);
  if (filters.length === 0) return null;

  // Both read the locale this request has already settled, which the page
  // declared with `setRequestLocale` before rendering the toolbar.
  const t = await getTranslations('discover');
  const taxonomy = taxonomyLabels(await getTranslations('taxonomy'));

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-eyebrow text-muted uppercase">
        {t('active.count', { count: filters.length })}
      </span>

      {filters.map((filter) => {
        // A category is named from the shared vocabulary; everything else is
        // the viewer's own text and is shown back to them as they gave it.
        const value =
          filter.key === 'category' ? taxonomy.category(filter.category) : filter.value;

        return (
          <Link
            key={`${filter.key}:${value}`}
            href={buildDiscoverHrefWithout(query, filter.key)}
            aria-label={t(`active.remove.${filter.key}`, { value })}
            className={cn(
              'group inline-flex items-center gap-2 rounded-pill border border-line bg-surface',
              'py-1.5 pr-2.5 pl-3 text-meta text-ink-soft',
              'transition-colors duration-150 hover:border-line-strong hover:text-ink',
            )}
          >
            <span className="text-muted-soft">{t(`active.kind.${filter.key}`)}</span>
            <span className="font-semibold">{value}</span>
            <X aria-hidden className="size-3.5 text-muted-soft group-hover:text-ink" />
          </Link>
        );
      })}

      <Link
        href={buildClearedDiscoverHref(query)}
        className="ml-1 text-meta font-semibold text-ink underline underline-offset-4 transition-opacity duration-150 hover:opacity-65"
      >
        {t('active.clearAll')}
      </Link>
    </div>
  );
}
