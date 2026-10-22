import { LayoutGrid, Map } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Chip } from '@/components/ui/Chip';
import { buildDiscoverHref, DISCOVER_VIEWS, type DiscoverViewState } from '@/lib/discover-query';
import { cn } from '@/lib/utils';

/**
 * Gallery or map, for the same filtered set of photographs.
 *
 * Two links, not a switch: the view is in the query string, so a map of
 * "Night, Bangkok" is a shareable address, the back button walks back out of
 * it, and the server renders the view that was asked for rather than revealing
 * it after hydration. The same reasoning as `CommunityTabs` and `SortTabs`.
 *
 * WHY THIS IS NOT A SECOND /map. The map in the nav is the index of every place
 * on FRAME. This is the map *of the filter the reader is already holding* — the
 * same result set the gallery beside it would show, drawn as places. The
 * filters stay where they were, nothing is duplicated, and switching back is
 * one click because neither view clears anything the other set.
 *
 * The label is text, and the icon is decorative: a pair of icons alone would
 * leave the reader guessing which square means what.
 */
export async function ViewToggle({
  query,
  className,
}: {
  query: DiscoverViewState;
  className?: string;
}) {
  const t = await getTranslations('discover');

  const icons = {
    gallery: LayoutGrid,
    map: Map,
  } as const;

  return (
    <div
      role="group"
      aria-label={t('view.groupLabel')}
      className={cn('flex shrink-0 items-center gap-2', className)}
    >
      {DISCOVER_VIEWS.map((view) => {
        const Icon = icons[view];
        return (
          <Chip
            key={view}
            // Paging is a gallery idea, so a view change returns to the first
            // page: coming back from the map onto page four of a filter the
            // reader cannot see any more is disorienting.
            href={buildDiscoverHref(query, { view, page: 1 })}
            active={query.view === view}
          >
            <Icon aria-hidden className="size-3.5" />
            {t(`view.${view}`)}
          </Chip>
        );
      })}
    </div>
  );
}
