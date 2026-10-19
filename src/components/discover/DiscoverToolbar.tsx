import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { ActiveFilters } from '@/components/discover/ActiveFilters';
import { CategoryFilter } from '@/components/discover/CategoryFilter';
import { GearFilter } from '@/components/discover/GearFilter';
import { PlaceSearchField } from '@/components/discover/PlaceSearchField';
import { SortTabs } from '@/components/discover/SortTabs';
import { activeDiscoverFilterCount, activeGearFilterCount } from '@/lib/discover-query';
import { cn } from '@/lib/utils';
import type { DiscoverQuery, GearFacets } from '@/types/domain';

/**
 * The Discover controls.
 *
 * Kept deliberately thin: categories and ordering are always visible because
 * they are what most viewers want, place search sits beside them, and the gear
 * filters — useful to a few people, noise to everyone else — stay behind one
 * disclosure that says how many of them are on. Finding a photograph should not
 * start with reading a control panel.
 */
export async function DiscoverToolbar({
  query,
  facets,
  className,
}: {
  query: DiscoverQuery;
  facets: GearFacets;
  className?: string;
}) {
  const t = await getTranslations('discover');
  const gearCount = activeGearFilterCount(query);
  const hasFilters = activeDiscoverFilterCount(query) > 0;

  return (
    <section
      aria-label={t('filters.sectionLabel')}
      className={cn('border-y border-line py-6', className)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <CategoryFilter query={query} className="lg:flex-1" />
        <PlaceSearchField query={query} className="w-full lg:w-[19rem] lg:shrink-0" />
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <SortTabs query={query} />

        {/* A details element rather than a popover: it opens with the keyboard,
            survives a page without JavaScript, and stays open while a gear
            filter is applied so the viewer can see what is narrowing the view. */}
        <details open={gearCount > 0} className="group mt-6">
          <summary
            className={cn(
              'inline-flex list-none cursor-pointer items-center gap-2.5 rounded-pill',
              'text-caption font-semibold text-ink-soft transition-colors duration-150',
              'hover:text-ink [&::-webkit-details-marker]:hidden',
            )}
          >
            <span>{t('gear.summary')}</span>
            <span
              className={cn(
                'rounded-pill px-2 py-0.5 text-meta font-bold',
                gearCount > 0 ? 'bg-ink text-on-ink' : 'bg-surface-sunken text-muted',
              )}
            >
              {gearCount > 0 ? t('gear.badgeActive', { count: gearCount }) : t('gear.badgeOff')}
            </span>
            {/* The badge above is two words at most, so the count is also said
                in full for anyone who cannot see how it is styled. */}
            <span className="sr-only">{t('gear.appliedCount', { count: gearCount })}</span>
            <ChevronDown
              aria-hidden
              className="size-3.5 text-muted-soft transition-transform duration-150 group-open:rotate-180"
            />
          </summary>

          <div className="mt-5 rounded-panel border border-line bg-surface p-5">
            <GearFilter query={query} facets={facets} />
          </div>
        </details>
      </div>

      {hasFilters ? (
        <div className="mt-6 border-t border-line pt-5">
          <ActiveFilters query={query} />
        </div>
      ) : null}
    </section>
  );
}
