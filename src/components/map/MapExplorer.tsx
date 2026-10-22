'use client';

import { ChevronDown, ChevronUp, CircleDashed } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { translatedText } from '@/lib/translation/applies';
import { cn, formatCount } from '@/lib/utils';
import { PHOTO_CATEGORIES, type PhotoCategory } from '@/types/domain';

import { MapCanvas } from './MapCanvas';
import { MapFilterBar, type CategoryOption } from './MapFilterBar';
import { MapPinCard } from './MapPinCard';
import { MapPinPreview } from './MapPinPreview';
import { SELECTED_PARAM } from './map-style';

/**
 * The client shell for the map page: the map, and a panel holding the same
 * places as text.
 *
 * The panel is one element in two layouts rather than two copies, so a screen
 * reader never meets the search box twice. Below `lg` it is a sheet pinned to
 * the bottom of the map that opens from a single summary row; from `lg` up it
 * is a sidebar in the second grid column.
 *
 * The selected pin lives in the query string, which is what makes a view
 * shareable and the back button meaningful. It is written with the native
 * history API that Next.js reads, rather than `router.push`, because a router
 * navigation would re-run the page's query on every pin click. The server
 * supplies the first value, so a shared link renders selected rather than
 * waiting for hydration.
 */

/** Both columns need a definite height so the list scrolls instead of the page. */
const PANEL_HEIGHT = 'lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem]';
const MAP_HEIGHT = `h-[62vh] min-h-[26rem] ${PANEL_HEIGHT}`;

interface Filters {
  query: string;
  categories: PhotoCategory[];
}

const NO_FILTERS: Filters = { query: '', categories: [] };

/** The place's name as this reader reads it, translated where one exists. */
function nameFor(pin: MapPin, locale: string): string {
  return translatedText(pin.name, pin.translations.name, locale);
}

/**
 * Both names are searched, not the one the reader is shown.
  *
  * A place keeps its name as written and may also have a translated one
  * (0035), and either is a reasonable thing to type: a Thai reader looking at
  * "Bang Kapi" in English may still search บางกะปิ, and an English reader who
  * has only ever seen the English name must not come up empty against the
  * Thai. The city and the country are not translatable at all — 0035's CHECK
  * allows a location only `name` and `description` — so they appear once.
  */
function matchesQuery(pin: MapPin, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  const translated = pin.translations.name?.value ?? '';
  return `${pin.name} ${translated} ${pin.city} ${pin.country}`
    .toLowerCase()
    .includes(needle);
}

function matchesFilters(pin: MapPin, filters: Filters): boolean {
  if (!matchesQuery(pin, filters.query)) return false;
  if (filters.categories.length === 0) return true;
  return filters.categories.some((category) => pin.categories.includes(category));
}

export function MapExplorer({
  pins,
  ownLocationIds,
  initialSelectedSlug = null,
  selectionParam = SELECTED_PARAM,
  fallbackCamera,
  nothingToDraw,
  className,
}: {
  pins: MapPin[];
  /** Where the signed-in member has photographed; their pins get the lit ring. */
  ownLocationIds?: readonly string[];
  /** Read from the query string on the server, so a shared link arrives whole. */
  initialSelectedSlug?: string | null;
  /**
   * Which query parameter the selected place is written to.
   *
   * The place index publishes it as `place` and that is the default. A page
   * that already means something else by `place` — Discover, whose `place` is
   * its text filter — passes its own key, or a pin click would write a slug
   * into a filter and the server would read it back as a search term.
   */
  selectionParam?: string;
  /**
   * Where to open when there are no pins to frame — the reader's own city, from
   * `visitorPlace()`.
   *
   * Only then. With pins on the map, fitting to them is what the index of every
   * place should do: a reader in Bangkok opening a map whose places are all in
   * Europe would otherwise be shown an empty Bangkok and would reasonably
   * conclude the map was broken. The opening band on the home page makes the
   * opposite choice for the opposite reason — it is about *here*, not about
   * everything.
   */
  fallbackCamera?: { centre: [number, number]; zoom: number };
  /**
   * What the map says over itself when it has nothing to draw.
   *
   * The /map page's reason is that no place on FRAME has a position that may be
   * published, and that is what it says. It is not the reason on Discover's
   * map, where the places exist and the reader's own filter is what excluded
   * them — so the caller that knows why supplies the words, already translated,
   * and the default stays the place index's own.
   */
  nothingToDraw?: { title: string; description: string };
  className?: string;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const headingId = `${baseId}-heading`;

  const t = useTranslations('map');
  const locale = useLocale();

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSelectedSlug);
  // Null until the map reports a viewport, so the list is complete rather than
  // empty for anyone whose map never loads.
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The last value written to the URL. Held in a ref so the writer stays stable
  // and cannot be called twice for one click.
  const selectionRef = useRef<string | null>(initialSelectedSlug);

  const mapConfigured = isMapConfigured();

  const commitSelection = useCallback((slug: string | null, mode: 'push' | 'replace') => {
    if (slug === selectionRef.current) return;
    selectionRef.current = slug;
    setSelectedSlug(slug);

    const params = new URLSearchParams(window.location.search);
    if (slug) params.set(selectionParam, slug);
    else params.delete(selectionParam);

    const search = params.toString();
    const url = search.length > 0 ? `?${search}` : window.location.pathname;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, [selectionParam]);

  // Back and forward move through selections, which is the whole point of
  // keeping the selection in the URL.
  useEffect(() => {
    const syncFromUrl = () => {
      const value = new URLSearchParams(window.location.search).get(selectionParam);
      selectionRef.current = value;
      setSelectedSlug(value);
    };

    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [selectionParam]);

  const filtered = useMemo(
    () => pins.filter((pin) => matchesFilters(pin, filters)),
    [filters, pins],
  );

  const selectedPin = useMemo(
    () => (selectedSlug ? pins.find((pin) => pin.slug === selectedSlug) ?? null : null),
    [pins, selectedSlug],
  );

  /** Chip counts ignore the category filter itself, so they stay predictive. */
  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const searched = pins.filter((pin) => matchesQuery(pin, filters.query));
    return PHOTO_CATEGORIES.map((category) => ({
      category,
      count: searched.filter((pin) => pin.categories.includes(category)).length,
    })).filter((option) => option.count > 0);
  }, [filters.query, pins]);

  const applyFilters = useCallback(
    (next: Filters) => {
      setFilters(next);
      // A selection the new filters exclude would leave a preview on screen for
      // a pin the map no longer draws, so it is dropped — without a history
      // entry, because the viewer filtered rather than navigated.
      const stillShown = pins.some(
        (pin) => pin.slug === selectionRef.current && matchesFilters(pin, next),
      );
      if (selectionRef.current && !stillShown) commitSelection(null, 'replace');
    },
    [commitSelection, pins],
  );

  const handleSelect = useCallback(
    (pin: MapPin | null) => {
      commitSelection(pin?.slug ?? null, 'push');
      // On a phone the preview lives in the sheet, so selecting a pin has to
      // open it or the tap appears to have done nothing.
      if (pin) setSheetOpen(true);
    },
    [commitSelection],
  );

  const handleVisibleChange = useCallback((ids: string[]) => setVisibleIds(ids), []);

  const inView = useMemo(() => {
    if (!visibleIds) return filtered;
    const visible = new Set(visibleIds);
    return filtered.filter((pin) => visible.has(pin.id));
  }, [filtered, visibleIds]);

  const listed = useMemo(() => {
    // Sorted by the name the reader actually sees, so the list is in their
    // alphabet rather than in the one each place was proposed in.
    const sorted = [...inView].sort(
      (a, b) =>
        b.photographCount - a.photographCount ||
        nameFor(a, locale).localeCompare(nameFor(b, locale), locale),
    );
    // A selected pin stays reachable even after the viewer has panned past it.
    if (!selectedPin || sorted.some((pin) => pin.id === selectedPin.id)) return sorted;
    return [selectedPin, ...sorted];
  }, [inView, locale, selectedPin]);

  // "In view" is only true once the map has reported a viewport. The scope is
  // two whole messages rather than one sentence with a word swapped into it:
  // the Thai for "in view" is not a word that can be dropped into the Thai for
  // "N locations pinned" and still read as a sentence.
  const scopeLabel = visibleIds ? t('explorer.scopeInView') : t('explorer.scopePinned');
  const summaryCount = { count: listed.length, formatted: formatCount(listed.length, locale) };
  const summaryLabel = selectedPin
    ? nameFor(selectedPin, locale)
    : visibleIds
      ? t('explorer.summaryInView', summaryCount)
      : t('explorer.summaryPinned', summaryCount);

  return (
    <div
      className={cn(
        mapConfigured
          ? 'relative lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]'
          : 'space-y-6',
        className,
      )}
    >
      <div
        className={cn(
          'relative',
          mapConfigured && 'overflow-hidden rounded-panel border border-line bg-surface-sunken',
        )}
      >
        <MapCanvas
          pins={filtered}
          ownLocationIds={ownLocationIds}
          initialCenter={pins.length === 0 ? fallbackCamera?.centre : undefined}
          initialZoom={pins.length === 0 ? fallbackCamera?.zoom : undefined}
          selectedId={selectedPin?.id ?? null}
          onSelect={handleSelect}
          onVisibleChange={handleVisibleChange}
          heightClassName={MAP_HEIGHT}
          anchored={
            // The card is drawn on the map only for a place that has a frame to
            // show. A pin with no photograph is a dot, and a card hanging off it
            // would be a panel with a hole where the picture goes; the panel
            // beside the map carries that place as text instead.
            selectedPin && selectedPin.recentImageUrls.length > 0
              ? {
                  lngLat: [selectedPin.longitude, selectedPin.latitude],
                  content: (
                    <MapPinCard pin={selectedPin} onDismiss={() => handleSelect(null)} />
                  ),
                }
              : null
          }
        />
        {mapConfigured ? <PinLegend /> : null}
        {mapConfigured && pins.length === 0 ? <NothingPinned copy={nothingToDraw} /> : null}
      </div>

      <aside
        aria-labelledby={headingId}
        className={cn(
          'flex flex-col',
          mapConfigured && [
            'absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-hidden',
            'rounded-t-panel border border-b-0 border-line bg-paper shadow-popover',
            'lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-0',
            'lg:bg-transparent lg:shadow-none',
            PANEL_HEIGHT,
          ],
        )}
      >
        {/* Names the panel and keeps the page's headings in order, since the
            cards below it start at h3. The eyebrow carries the visible label. */}
        <h2 id={headingId} className="sr-only">
          {t('explorer.listHeading')}
        </h2>

        {mapConfigured ? (
          <button
            type="button"
            onClick={() => setSheetOpen((open) => !open)}
            aria-expanded={sheetOpen}
            aria-controls={panelId}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left lg:hidden"
          >
            <span className="min-w-0">
              <span className="block truncate text-body font-bold">{summaryLabel}</span>
              <span className="block truncate text-meta text-muted">
                {selectedPin
                  ? `${selectedPin.city}, ${selectedPin.country}`
                  : t('explorer.sheetHint')}
              </span>
              <span className="sr-only">
                {sheetOpen ? t('explorer.hideList') : t('explorer.showList')}
              </span>
            </span>
            {sheetOpen ? (
              <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
            ) : (
              <ChevronUp aria-hidden className="size-4 shrink-0 text-muted" />
            )}
          </button>
        ) : null}

        <div
          id={panelId}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            mapConfigured && !sheetOpen && 'hidden lg:block',
          )}
        >
          <Eyebrow className="hidden px-4 pt-1 lg:flex lg:px-0">{scopeLabel}</Eyebrow>

          <MapFilterBar
            query={filters.query}
            onQueryChange={(query) => applyFilters({ ...filters, query })}
            options={categoryOptions}
            activeCategories={filters.categories}
            onToggleCategory={(category) =>
              applyFilters({
                ...filters,
                categories: filters.categories.includes(category)
                  ? filters.categories.filter((current) => current !== category)
                  : [...filters.categories, category],
              })
            }
            matchingCount={filtered.length}
            totalCount={pins.length}
            onReset={() => applyFilters(NO_FILTERS)}
            className={mapConfigured ? 'bg-paper px-4 pt-2 pb-4 lg:px-0' : 'pb-4'}
          />

          <PanelList
            pins={listed}
            selectedId={selectedPin?.id ?? null}
            onSelect={(slug) => commitSelection(slug, 'push')}
            onClear={() => commitSelection(null, 'push')}
            emptyBecauseOfFilters={filtered.length === 0}
            onReset={() => applyFilters(NO_FILTERS)}
            className={mapConfigured ? 'px-4 pb-4 lg:px-0' : undefined}
          />
        </div>
      </aside>
    </div>
  );
}

/** Size and density, not colour alone, separate an exact pin from a vague one. */
/**
 * Said on the map, not instead of it.
 *
 * With nothing approved anywhere, this page used to render an empty-state panel
 * where the map goes, so the one page about places showed no places and no map
 * either. The map is worth drawing on its own — it opens on the reader's own
 * city — and the fact that nothing is pinned yet is a note on top of it.
 *
 * The copy is the same pair the panel used, so this is a change of where it is
 * said rather than of what it says.
 */
function NothingPinned({ copy }: { copy?: { title: string; description: string } }) {
  const t = useTranslations('map');

  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-5">
      <div className="w-[min(26rem,100%)] rounded-panel border border-line bg-surface p-5 text-center shadow-popover">
        <p className="text-body font-semibold">{copy?.title ?? t('page.emptyTitle')}</p>
        <p className="mt-1.5 text-meta leading-relaxed text-muted">
          {copy?.description ?? t('page.emptyDescription')}
        </p>
      </div>
    </div>
  );
}

function PinLegend() {
  const t = useTranslations('map');

  return (
    <ul className="pointer-events-none absolute top-3 left-3 z-10 space-y-2 rounded-card border border-line bg-surface/92 px-3 py-2.5 text-meta text-ink-soft">
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-accent ring-2 ring-surface" />
        {t('explorer.legendExact')}
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-full bg-accent/30 ring-1 ring-accent-strong"
        />
        {t('explorer.legendApproximate')}
      </li>
    </ul>
  );
}

function PanelList({
  pins,
  selectedId,
  onSelect,
  onClear,
  emptyBecauseOfFilters,
  onReset,
  className,
}: {
  pins: readonly MapPin[];
  selectedId: string | null;
  onSelect: (slug: string) => void;
  onClear: () => void;
  emptyBecauseOfFilters: boolean;
  onReset: () => void;
  className?: string;
}) {
  const t = useTranslations('map');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  if (pins.length === 0) {
    return (
      <div className={className}>
        {emptyBecauseOfFilters ? (
          <EmptyState
            title={t('panel.noMatchTitle')}
            description={t('panel.noMatchDescription')}
            action={
              <Button variant="secondary" size="sm" onClick={onReset}>
                {t('actions.clearFilters')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('panel.outOfViewTitle')}
            description={t('panel.outOfViewDescription')}
          />
        )}
      </div>
    );
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {pins.map((pin) => {
        const selected = pin.id === selectedId;

        return (
          <li key={pin.id} aria-current={selected ? 'true' : undefined}>
            {selected ? (
              <>
                <MapPinPreview pin={pin} />
                <Button variant="ghost" size="sm" onClick={onClear} className="mt-1">
                  {t('actions.clearSelection')}
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(pin.slug)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-left',
                  'transition-colors duration-150 hover:border-line-strong',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">
                    {nameFor(pin, locale)}
                  </span>
                  <span className="block truncate text-meta text-muted">
                    {pin.city}, {pin.country}
                  </span>
                </span>

                {pin.isApproximate ? (
                  <span className="shrink-0 text-muted-soft">
                    <CircleDashed aria-hidden className="size-3.5" />
                    <span className="sr-only">{t('panel.approximate')}</span>
                  </span>
                ) : null}

                {/* The compact figure is for the eye and the full sentence for
                    assistive tech, rather than a noun stitched onto a number:
                    in Thai the noun comes first and the classifier last, so
                    "1.2k" + " photographs" cannot be assembled that way. */}
                <span className="shrink-0 text-meta tabular-nums text-muted-soft">
                  <span aria-hidden>{formatCount(pin.photographCount, locale)}</span>
                  <span className="sr-only">
                    {tCommon('photographCount', { count: pin.photographCount })}
                  </span>
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
