import { getTranslations } from 'next-intl/server';

import { MapCanvas } from '@/components/map/MapCanvas';
import { SectionHead } from '@/components/ui/SectionHead';
import type { MapPin } from '@/lib/data/repository';
import { cn, formatCount } from '@/lib/utils';
import type { Locale } from '@/i18n/locales';

/**
 * The places a collection has saved, drawn together.
 *
 * WHAT THIS IS. The brief asks for "Saved Places" and a "Photo Trip Planner",
 * and both already existed in parts: `collection_items.location_id` has saved a
 * place into a private-by-default collection since 0004, and `MapCanvas` has
 * drawn a set of pins since the map page. What was missing was seeing them
 * together — a list of places you mean to visit is a different thing from the
 * same places on a map of the city.
 *
 * WHAT THIS IS NOT. It is a map OF a collection, not a trip object. There is no
 * route, no ordering, no "day 1 / day 2", and nothing asks a routing provider
 * for directions — FRAME serves its own basemap precisely to stay off metered
 * services, and a multi-stop route would have been a new concept for a reader
 * to learn, a new table to order it, and a drag-to-arrange interface to go with
 * it. A photographer planning a morning out wants to see where the places sit
 * relative to each other; that is a map, and they can read it.
 *
 * The entries themselves stay in the grid below, where each keeps its note,
 * its saved date and the owner's remove control. This section adds no second
 * copy of them — only the view the grid cannot give.
 */
export async function SavedPlaces({
  pins,
  savedCount,
  locale,
  className,
}: {
  pins: MapPin[];
  /** How many places the collection holds, pinnable or not. */
  savedCount: number;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'collections' });

  // A saved place whose coordinates are withheld, or whose place was never
  // approved, has no pin — the pin path decides that, not this component. The
  // difference is said rather than left for the reader to notice that the map
  // is lighter than the list.
  const withheld = Math.max(0, savedCount - pins.length);

  return (
    <section aria-label={t('places.label')} className={cn('min-w-0', className)}>
      <SectionHead
        eyebrow={t('places.eyebrow')}
        title={t('places.title')}
        description={t('places.description')}
      />

      <p role="status" className="text-caption font-semibold text-ink tabular-nums">
        {t('places.summary', {
          count: pins.length,
          formatted: formatCount(pins.length, locale),
        })}
        {withheld > 0 ? ` ${t('places.withheld', { count: withheld })}` : ''}
      </p>

      {pins.length > 0 ? (
        /* Scroll-zoom off: this map is a reference inside a page, and a reader
           scrolling past a full-width map that captured the wheel would read
           the page as broken. Panning, the zoom buttons and keyboard panning
           all stay, so it is still explorable. */
        <MapCanvas
          pins={pins}
          scrollZoom={false}
          heightClassName="h-[22rem] md:h-[28rem]"
          className="mt-6 overflow-hidden rounded-panel border border-line"
        />
      ) : null}
    </section>
  );
}
