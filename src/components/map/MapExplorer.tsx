'use client';

import { ChevronDown, ChevronUp, CircleDashed } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { cn, formatCount } from '@/lib/utils';
import { PHOTO_CATEGORIES, type PhotoCategory } from '@/types/domain';

import { MapCanvas } from './MapCanvas';
import { MapFilterBar, type CategoryOption } from './MapFilterBar';
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

function matchesQuery(pin: MapPin, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return `${pin.name} ${pin.city} ${pin.country}`.toLowerCase().includes(needle);
}

function matchesFilters(pin: MapPin, filters: Filters): boolean {
  if (!matchesQuery(pin, filters.query)) return false;
  if (filters.categories.length === 0) return true;
  return filters.categories.some((category) => pin.categories.includes(category));
}

export function MapExplorer({
  pins,
  initialSelectedSlug = null,
  className,
}: {
  pins: MapPin[];
  /** Read from the query string on the server, so a shared link arrives whole. */
  initialSelectedSlug?: string | null;
  className?: string;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const headingId = `${baseId}-heading`;

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
    if (slug) params.set(SELECTED_PARAM, slug);
    else params.delete(SELECTED_PARAM);

    const search = params.toString();
    const url = search.length > 0 ? `?${search}` : window.location.pathname;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, []);

  // Back and forward move through selections, which is the whole point of
  // keeping the selection in the URL.
  useEffect(() => {
    const syncFromUrl = () => {
      const value = new URLSearchParams(window.location.search).get(SELECTED_PARAM);
      selectionRef.current = value;
      setSelectedSlug(value);
    };

    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

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
    const sorted = [...inView].sort(
      (a, b) => b.photographCount - a.photographCount || a.name.localeCompare(b.name),
    );
    // A selected pin stays reachable even after the viewer has panned past it.
    if (!selectedPin || sorted.some((pin) => pin.id === selectedPin.id)) return sorted;
    return [selectedPin, ...sorted];
  }, [inView, selectedPin]);

  // "In view" is only true once the map has reported a viewport.
  const scopeWord = visibleIds ? 'in view' : 'pinned';
  const summaryLabel = selectedPin
    ? selectedPin.name
    : `${formatCount(listed.length)} ${listed.length === 1 ? 'location' : 'locations'} ${scopeWord}`;

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
          selectedId={selectedPin?.id ?? null}
          onSelect={handleSelect}
          onVisibleChange={handleVisibleChange}
          heightClassName={MAP_HEIGHT}
        />
        {mapConfigured ? <PinLegend /> : null}
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
          Locations on the map
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
                  : 'Search and filter the places on the map'}
              </span>
              <span className="sr-only">
                {sheetOpen ? 'Hide the list of locations' : 'Show the list of locations'}
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
          <Eyebrow className="hidden px-4 pt-1 lg:flex lg:px-0">{scopeWord}</Eyebrow>

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
function PinLegend() {
  return (
    <ul className="pointer-events-none absolute top-3 left-3 z-10 space-y-2 rounded-card border border-line bg-surface/92 px-3 py-2.5 text-meta text-ink-soft">
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-accent ring-2 ring-surface" />
        Exact position
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-full bg-accent/30 ring-1 ring-accent-strong"
        />
        Approximate, withheld for privacy
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
  if (pins.length === 0) {
    return (
      <div className={className}>
        {emptyBecauseOfFilters ? (
          <EmptyState
            title="No places match those filters"
            description="Try a shorter search, or clear the filters to see every pinned location again."
            action={
              <Button variant="secondary" size="sm" onClick={onReset}>
                Clear the filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nothing in this view"
            description="Zoom out or drag the map to bring pinned locations back into view."
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
                  Clear selection
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
                  <span className="block truncate text-body font-semibold">{pin.name}</span>
                  <span className="block truncate text-meta text-muted">
                    {pin.city}, {pin.country}
                  </span>
                </span>

                {pin.isApproximate ? (
                  <span className="shrink-0 text-muted-soft">
                    <CircleDashed aria-hidden className="size-3.5" />
                    <span className="sr-only">Approximate position.</span>
                  </span>
                ) : null}

                <span className="shrink-0 text-meta tabular-nums text-muted-soft">
                  {formatCount(pin.photographCount)}
                  <span className="sr-only">
                    {pin.photographCount === 1 ? ' photograph' : ' photographs'}
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
