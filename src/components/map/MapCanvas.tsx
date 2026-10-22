'use client';

import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  Marker,
} from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useResolvedTheme } from '@/components/system/use-theme';
import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { basemapVariant, type BasemapLanguage } from '@/lib/map/basemap';
import { spreadOffsets } from '@/lib/map/spread';
import { translatedText } from '@/lib/translation/applies';
import { cn } from '@/lib/utils';

import { MapLoadFailure, MapUnavailable } from './MapUnavailable';
import { createPhotoMarkerElement } from './photo-marker';
import {
  clusterLayers,
  glowLayer,
  hoverLayer,
  idFilter,
  MAP_ATTRIBUTION_ENV_VAR,
  MAP_CLUSTER,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FIT_MAX_ZOOM,
  MAP_LAYERS,
  MAP_MOVE_DURATION_MS,
  MAP_SELECTION_ZOOM,
  MAP_SOURCE_ID,
  isAttributionMissing,
  mapAttribution,
  mapStyleUrl,
  pointCollection,
  pointLayer,
  selectionLayer,
} from './map-style';

import 'maplibre-gl/dist/maplibre-gl.css';

import { loadMapLibre } from '@/components/map/load-maplibre';

/**
 * The clustered pin map.
 *
 * MapLibre is imported inside the effect rather than at the top of the module,
 * which keeps roughly a megabyte of WebGL renderer out of the server bundle and
 * off the critical path. Everything that touches the map is guarded on the style
 * having finished loading: calling `addLayer` or `setData` against a half-built
 * style is the usual way this component crashes.
 *
 * A WebGL canvas is not usable by a screen reader at any price, so a map is
 * never the only way to reach this information. The page that renders this
 * also renders the same places as a list.
 */

type Phase = 'loading' | 'ready' | 'failed';

/**
 * A pin is drawn as a photograph when it has one. The flag travels in the
 * GeoJSON because the style has to filter on it — the dot layer draws only the
 * pins no marker covers.
 */
function withImageFlag(pins: readonly MapPin[]) {
  return pins.map((pin) => ({ ...pin, hasImage: pin.recentImageUrls.length > 0 }));
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readPinId(properties: Record<string, unknown> | null | undefined): string | null {
  const value = properties?.id;
  return typeof value === 'string' ? value : null;
}

function pointCoordinates(feature: MapGeoJSONFeature): [number, number] | null {
  if (feature.geometry.type !== 'Point') return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
  return [longitude, latitude];
}

function easeToPoint(instance: MapLibreMap, center: [number, number], zoom: number): void {
  instance.easeTo({
    center,
    zoom,
    duration: prefersReducedMotion() ? 0 : MAP_MOVE_DURATION_MS,
  });
}

/** Frame every pin on first paint, rather than guessing at a world view. */
function fitToPins(instance: MapLibreMap, pins: readonly MapPin[]): void {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;

  for (const pin of pins) {
    west = Math.min(west, pin.longitude);
    east = Math.max(east, pin.longitude);
    south = Math.min(south, pin.latitude);
    north = Math.max(north, pin.latitude);
  }

  if (west > east || south > north) return;

  instance.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 56, maxZoom: MAP_FIT_MAX_ZOOM, duration: 0 },
  );
}

export function MapCanvas({
  pins,
  ownLocationIds,
  initialCenter,
  initialZoom,
  selectedId,
  onSelect,
  onVisibleChange,
  anchored,
  scrollZoom = true,
  className,
  heightClassName = 'h-[70vh]',
}: {
  pins: MapPin[];
  /**
   * Places where the signed-in member has a published photograph. Their
   * markers get the lit ring. Empty, or absent, for a visitor.
   */
  ownLocationIds?: readonly string[];
  initialCenter?: [number, number];
  initialZoom?: number;
  selectedId?: string | null;
  onSelect?: (pin: MapPin | null) => void;
  /**
   * Beyond the shared contract, and optional: reports which pins currently fall
   * inside the viewport so a panel beside the map can list what is in view.
   */
  onVisibleChange?: (visibleIds: string[]) => void;
  /**
   * Whether the wheel zooms the map. Off for a map used as the backdrop of a
   * section: a reader scrolling past a full-width map would otherwise have the
   * page stop under the cursor and the map zoom instead, which reads as the
   * page being broken. Panning, the zoom buttons and keyboard panning stay —
   * the map is still explorable, it just does not capture the scroll.
   */
  /**
   * Something to draw over the map at a point on it — the card for the chosen
   * pin.
   *
   * The content and the point travel together in one object because they can
   * never legitimately disagree: a card anchored to a coordinate that is not
   * its own place's would be worse than no card. The caller supplies the JSX, so
   * the translations, the links and the images stay in the tree that already
   * has them; this component only keeps it in the right place as the map moves.
   */
  anchored?: { lngLat: [number, number]; content: ReactNode } | null;
  scrollZoom?: boolean;
  className?: string;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  const t = useTranslations('map');

  // MapLibre is told its own strings once, when the map is built, so these are
  // read at render and listed in the build effect's dependencies. They are
  // plain strings, which a dependency array compares by value: the same
  // language produces the same strings and the map is never rebuilt. A
  // language change is a navigation, which remounts this component anyway.
  const accessibleName = t('canvas.accessibleName');
  const zoomInLabel = t('canvas.zoomIn');
  const zoomOutLabel = t('canvas.zoomOut');

  // Props the map reads from inside long-lived MapLibre handlers. Keeping them
  // in refs means a new `onSelect` identity never tears the map down.
  const pinsRef = useRef(pins);
  // Read by the marker sync, which is created once: a Set for the lookup, and
  // the label a screen reader hears on a member's own pin. Kept current from
  // an effect, as onSelectRef is below, rather than written during render.
  const locale = useLocale();
  const ownRef = useRef<Set<string>>(new Set(ownLocationIds ?? []));
  const ownLabelRef = useRef(t('canvas.yours'));
  // The marker effect runs with no dependencies and reads what it needs
  // through refs, so the reader's language arrives the same way the "yours"
  // label does rather than by rebuilding every marker on a locale change.
  const localeRef = useRef(locale);
  useEffect(() => {
    ownRef.current = new Set(ownLocationIds ?? []);
    ownLabelRef.current = t('canvas.yours');
    localeRef.current = locale;
  }, [locale, ownLocationIds, t]);
  const onSelectRef = useRef(onSelect);
  const onVisibleChangeRef = useRef(onVisibleChange);
  // The selection is here as well as in the effect below because a rebuilt map
  // starts with a style that has never been told about it: the effect that
  // applies it watches `selectedId`, which has not changed, so without this the
  // ring would be missing until the viewer chose something else.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    pinsRef.current = pins;
    onSelectRef.current = onSelect;
    onVisibleChangeRef.current = onVisibleChange;
    selectedIdRef.current = selectedId;
  });

  // Captured once: these are the *initial* camera, so a parent re-render with a
  // fresh array literal must not rebuild the map.
  const initialViewRef = useRef({
    center: initialCenter ?? MAP_DEFAULT_CENTER,
    zoom: initialZoom ?? MAP_DEFAULT_ZOOM,
    explicit: initialCenter !== undefined,
  });

  // Set once per selection so panning away from a still-selected pin does not
  // snap back every time the filtered pin set changes.
  const lastCameraSelectionRef = useRef<string | null>(null);

  // The basemap follows the page: its palette from the applied theme, its
  // labels from the reader's language. Both are part of the style document
  // rather than of anything paintable afterwards, so a change to either rebuilds
  // the map — see the build effect, which carries the camera across.
  const theme = useResolvedTheme();
  // Narrowed rather than cast: the basemap has a Thai label set and an English
  // one, and a third locale added to the app would have to choose between them
  // here instead of failing at a tile request.
  const language: BasemapLanguage = locale === 'th' ? 'th' : 'en';
  const styleUrl = mapStyleUrl(basemapVariant(theme, language));
  const attribution = mapAttribution();

  /**
   * The DOM markers, by pin id.
   *
   * Only the pins the clustering has left on their own get one: everything else
   * is inside a cluster circle, and a marker for a pin the viewer cannot see is
   * a node the browser lays out for nothing. The set is recomputed from the
   * source after every move, because which pins are clustered is the source's
   * answer and changes with the zoom.
   */
  const markersRef = useRef(new Map<string, { marker: Marker; setSelected: (on: boolean) => void }>());
  /**
   * The loaded MapLibre module. `loadMapLibre()` is a dynamic import, and
   * marker syncing runs from map events where there is nothing to await on; the
   * build effect puts the resolved module here the moment it has it.
   */
  const maplibreRef = useRef<Awaited<ReturnType<typeof loadMapLibre>> | null>(null);

  const syncMarkers = useCallback(
    (instance: MapLibreMap, current: readonly MapPin[]) => {
      if (!instance.getSource(MAP_SOURCE_ID)) return;

      const maplibregl = maplibreRef.current;
      if (!maplibregl) return;

      // `querySourceFeatures` answers from the loaded tiles of the clustering
      // source, so it reports exactly the pins standing outside a cluster right
      // now — which `queryRenderedFeatures` could not, since the dot layer
      // deliberately filters these out and an unrendered feature is not
      // returned.
      const standing = new Set<string>();
      for (const feature of instance.querySourceFeatures(MAP_SOURCE_ID)) {
        if (feature.properties?.point_count !== undefined) continue;
        const id = readPinId(feature.properties);
        if (id) standing.add(id);
      }

      const byId = new Map(current.map((pin) => [pin.id, pin]));
      const markers = markersRef.current;

      for (const [id, entry] of markers) {
        if (standing.has(id) && byId.has(id)) continue;
        entry.marker.remove();
        markers.delete(id);
      }

      for (const id of standing) {
        if (markers.has(id)) continue;
        const pin = byId.get(id);
        if (!pin || pin.recentImageUrls.length === 0) continue;

        const { element, setSelected } = createPhotoMarkerElement(
          pin,
          () => onSelectRef.current?.(pin),
          {
            own: ownRef.current.has(pin.id),
            ownLabel: ownLabelRef.current,
            name: translatedText(pin.name, pin.translations.name, localeRef.current),
          },
        );

        const marker = new maplibregl.Marker({ element })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(instance);

        markers.set(id, { marker, setSelected });
      }

      // Two markers on one point of the screen are pushed a few pixels apart
      // so both can be seen and clicked (lib/map/spread.ts). Screen-space, so
      // it is redone every time the view settles; at a zoom where the two
      // coordinates are far enough apart, both offsets go back to zero.
      const entries = [...markers.values()];
      const offsets = spreadOffsets(
        entries.map((entry) => {
          const { x, y } = instance.project(entry.marker.getLngLat());
          return { x, y };
        }),
      );
      entries.forEach((entry, index) => {
        entry.marker.setOffset(offsets[index] ?? [0, 0]);
      });
    },
    [],
  );

  const reportVisible = useCallback((instance: MapLibreMap, current: readonly MapPin[]) => {
    const report = onVisibleChangeRef.current;
    if (!report) return;
    const bounds = instance.getBounds();
    report(
      current
        .filter((pin) => bounds.contains([pin.longitude, pin.latitude]))
        .map((pin) => pin.id),
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !styleUrl) return;

    let disposed = false;
    let created: MapLibreMap | null = null;

    const build = async () => {
      const maplibregl = await loadMapLibre();
      if (disposed) return;
      maplibreRef.current = maplibregl;

      const instance = new maplibregl.Map({
        container,
        style: styleUrl,
        center: initialViewRef.current.center,
        zoom: initialViewRef.current.zoom,
        attributionControl: { customAttribution: attribution ?? undefined },
        // MapLibre puts role="region", tabindex="0" and this label on the canvas
        // itself, which is the element a keyboard user actually lands on and
        // pans with the arrow keys. Naming it here rather than labelling the
        // wrapper avoids announcing one map as two nested regions.
        //
        // The zoom buttons below are MapLibre's own, and their accessible names
        // come from this same table, so they are translated here too. Anything
        // not listed keeps MapLibre's English default, which only affects
        // controls this map does not add.
        locale: {
          'Map.Title': accessibleName,
          'NavigationControl.ZoomIn': zoomInLabel,
          'NavigationControl.ZoomOut': zoomOutLabel,
        },
        // A published coordinate is rounded to roughly eleven metres, and an
        // approximate one to about a kilometre, so deeper zoom than this would
        // only dramatise precision the data does not have.
        maxZoom: 17,
        // Street photography locations have no use for a rotated horizon, and
        // dropping rotation keeps two-finger panning predictable on a phone.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        scrollZoom,
      });

      created = instance;
      mapRef.current = instance;

      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
        'top-right',
      );

      instance.on('error', (event) => {
        // A missing glyph or one failed tile arrives through the same channel as
        // a style that never loaded, so only a failure before the first paint is
        // treated as fatal. Logging keeps the detail MapLibre would have printed
        // itself had nothing been listening.
        console.error('MapLibre GL error', event.error);
        if (disposed) return;
        setPhase((current) => (current === 'ready' ? current : 'failed'));
      });

      const handleClick = (event: MapMouseEvent) => {
        const map = mapRef.current;
        if (!map) return;

        const layers = [MAP_LAYERS.clusters, MAP_LAYERS.points].filter((id) =>
          Boolean(map.getLayer(id)),
        );
        if (layers.length === 0) return;

        const [hit] = map.queryRenderedFeatures(event.point, { layers });
        if (!hit) {
          onSelectRef.current?.(null);
          return;
        }

        if (hit.layer.id === MAP_LAYERS.clusters) {
          const source = map.getSource<GeoJSONSource>(MAP_SOURCE_ID);
          const clusterId = hit.properties?.cluster_id;
          const centre = pointCoordinates(hit);
          if (!source || typeof clusterId !== 'number' || !centre) return;

          void source.getClusterExpansionZoom(clusterId).then(
            (zoom) => {
              if (!disposed) easeToPoint(map, centre, zoom);
            },
            // The cluster stopped existing because the filtered set changed
            // between the click and the answer. Dropping the click is correct.
            () => undefined,
          );
          return;
        }

        const id = readPinId(hit.properties);
        onSelectRef.current?.(pinsRef.current.find((pin) => pin.id === id) ?? null);
      };

      instance.on('load', () => {
        if (disposed) return;

        instance.addSource(MAP_SOURCE_ID, {
          type: 'geojson',
          data: pointCollection(withImageFlag(pinsRef.current)),
          cluster: true,
          clusterRadius: MAP_CLUSTER.radius,
          clusterMaxZoom: MAP_CLUSTER.maxZoom,
        });

        // Bottom to top: the glow under everything, then the clusters, then the
        // two rings, then the pins themselves on top.
        instance.addLayer(glowLayer(theme));
        for (const layer of clusterLayers(theme)) instance.addLayer(layer);
        instance.addLayer(selectionLayer(theme));
        instance.addLayer(hoverLayer(theme));
        instance.addLayer(pointLayer(theme));

        instance.setFilter(MAP_LAYERS.selection, idFilter(selectedIdRef.current ?? null));

        for (const layerId of [MAP_LAYERS.clusters, MAP_LAYERS.points]) {
          instance.on('mouseenter', layerId, () => {
            instance.getCanvas().style.cursor = 'pointer';
          });
          instance.on('mouseleave', layerId, () => {
            instance.getCanvas().style.cursor = '';
          });
        }

        // Which single pin the pointer is over. Tracked on the map rather than
        // in React state: it changes on every mouse move, and a re-render per
        // frame to repaint one ring is a bad trade.
        instance.on('mousemove', MAP_LAYERS.points, (event) => {
          const [hit] = event.features ?? [];
          instance.setFilter(MAP_LAYERS.hover, idFilter(readPinId(hit?.properties)));
        });
        instance.on('mouseleave', MAP_LAYERS.points, () => {
          instance.setFilter(MAP_LAYERS.hover, idFilter(null));
        });

        instance.on('click', handleClick);
        instance.on('moveend', () => {
          if (disposed) return;
          reportVisible(instance, pinsRef.current);
          syncMarkers(instance, pinsRef.current);
        });
        // The source finishes loading its first tiles after `load`, so the
        // markers cannot all be placed here; this fires again when it does.
        instance.on('sourcedata', (event) => {
          if (disposed || event.sourceId !== MAP_SOURCE_ID || !event.isSourceLoaded) return;
          syncMarkers(instance, pinsRef.current);
        });

        if (!initialViewRef.current.explicit) fitToPins(instance, pinsRef.current);

        setPhase('ready');
        reportVisible(instance, pinsRef.current);
        syncMarkers(instance, pinsRef.current);
      });
    };

    void build();

    const markers = markersRef.current;

    return () => {
      disposed = true;

      // A theme or language change replaces the style document, which means a
      // new map. Carrying the camera over is what keeps that from throwing the
      // viewer back to the world view mid-browse: the rebuild reopens on the
      // same ground, and `explicit` stops it refitting to the pins.
      if (created) {
        const centre = created.getCenter();
        initialViewRef.current = {
          center: [centre.lng, centre.lat],
          zoom: created.getZoom(),
          explicit: true,
        };
      }

      // The markers are children of the map's container; `map.remove()` takes
      // the container's contents with it, but the registry would otherwise keep
      // handles to dead nodes and the next map would not rebuild them. The Map
      // is captured above rather than read here: it is created once and never
      // replaced, so the two are the same object, and the rule about refs in
      // cleanup has no way to know that.
      for (const entry of markers.values()) entry.marker.remove();
      markers.clear();

      created?.remove();
      if (mapRef.current === created) mapRef.current = null;
    };
  }, [
    accessibleName,
    attribution,
    reportVisible,
    scrollZoom,
    styleUrl,
    syncMarkers,
    theme,
    zoomInLabel,
    zoomOutLabel,
  ]);

  /**
   * Keeps the anchored card over its point.
   *
   * The position is written straight onto the element rather than held in state:
   * `move` fires once per frame while a map is being dragged, and a React
   * render per frame to move one card is a bad trade. The card's *content* is
   * ordinary React above; only its transform is imperative.
   */
  useEffect(() => {
    const instance = mapRef.current;
    const element = anchorRef.current;
    if (!instance || !element || !anchored) return;

    const [lng, lat] = anchored.lngLat;

    /**
     * The gap between the pin and the card: enough to clear the marker, plus
     * the few pixels the stacked edges stand proud of the card.
     */
    const GAP = 34;
    /** Keeps the card off the panel's rounded corners. */
    const MARGIN = 8;

    /**
     * Above the pin, below it, or beside it — whichever the map is tall enough
     * for, and clamped into the canvas whatever happens.
     *
     * Above is the default because a card that grows upward from its pin reads
     * as belonging to it. The other two placements are not refinements: the map
     * panel is 512 pixels tall on a laptop and the card is 265, so a pin
     * anywhere near the middle leaves about 214 pixels on each side and *neither*
     * vertical placement fits. The first version of this flipped between the two
     * and was cut off either way.
     */
    const place = () => {
      const point = instance.project([lng, lat]);
      const { width, height } = element.getBoundingClientRect();
      const canvas = instance.getCanvas();
      const limit = {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      };

      const clamp = (value: number, size: number, extent: number) =>
        Math.min(Math.max(value, MARGIN), Math.max(extent - size - MARGIN, MARGIN));

      const roomAbove = point.y - GAP - MARGIN;
      const roomBelow = limit.height - point.y - GAP - MARGIN;

      let x = point.x - width / 2;
      let y: number;

      if (roomAbove >= height) {
        y = point.y - height - GAP;
      } else if (roomBelow >= height) {
        y = point.y + GAP;
      } else {
        // Beside it: vertically centred on the pin, and on whichever side of it
        // has the room. A map is almost always wider than it is tall, so this is
        // the placement that actually fits.
        y = point.y - height / 2;
        const toRight = point.x + GAP;
        const toLeft = point.x - GAP - width;
        x = limit.width - toRight - width >= MARGIN ? toRight : toLeft;
      }

      element.style.transform = `translate(${clamp(x, width, limit.width)}px, ${clamp(
        y,
        height,
        limit.height,
      )}px)`;
    };

    place();
    instance.on('move', place);
    instance.on('zoom', place);

    return () => {
      instance.off('move', place);
      instance.off('zoom', place);
    };
  }, [anchored, phase]);

  // Filter changes replace the source data rather than rebuilding the map.
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || phase !== 'ready') return;
    const source = instance.getSource<GeoJSONSource>(MAP_SOURCE_ID);
    if (!source) return;
    source.setData(pointCollection(withImageFlag(pins)));
    reportVisible(instance, pins);
    syncMarkers(instance, pins);
  }, [phase, pins, reportVisible, syncMarkers]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || phase !== 'ready' || !instance.getLayer(MAP_LAYERS.selection)) return;

    instance.setFilter(MAP_LAYERS.selection, idFilter(selectedId ?? null));

    // A photograph pin is a DOM node, so its selected state is a class rather
    // than a layer filter.
    for (const [id, entry] of markersRef.current) entry.setSelected(id === selectedId);

    if (lastCameraSelectionRef.current === (selectedId ?? null)) return;
    lastCameraSelectionRef.current = selectedId ?? null;
    if (!selectedId) return;

    const pin = pins.find((candidate) => candidate.id === selectedId);
    if (!pin) return;

    // Below the clustering threshold the chosen pin is still inside a cluster,
    // so the selection ring would have nothing to draw around.
    const clustered = instance.getZoom() <= MAP_CLUSTER.maxZoom;
    const offScreen = !instance.getBounds().contains([pin.longitude, pin.latitude]);
    if (!clustered && !offScreen) return;

    easeToPoint(
      instance,
      [pin.longitude, pin.latitude],
      clustered ? MAP_SELECTION_ZOOM : instance.getZoom(),
    );
  }, [phase, pins, selectedId]);

  // No height is forwarded on purpose: the unavailable panel is a message, and
  // stretching it to the map's reserved height adds emptiness, not clarity.
  if (!isMapConfigured()) return <MapUnavailable className={className} />;

  return (
    <div className={cn('relative', className)}>
      <p className="sr-only">{t('canvas.instructions')}</p>

      <div ref={containerRef} className={cn('w-full', heightClassName)} />

      {anchored && phase === 'ready' ? (
        <div
          ref={anchorRef}
          // `left-0 top-0` with everything else done by the transform above, so
          // one write per frame moves it and nothing re-flows.
          className="pointer-events-auto absolute top-0 left-0 z-30 will-change-transform"
        >
          {anchored.content}
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div aria-hidden className="skeleton absolute inset-0 rounded-none" />
      ) : null}

      {phase === 'failed' ? (
        <MapLoadFailure className="absolute inset-0 h-full rounded-none" />
      ) : null}

      <p aria-live="polite" className="sr-only">
        {phase === 'loading' ? t('canvas.statusLoading') : null}
        {phase === 'ready' ? t('canvas.statusReady') : null}
        {phase === 'failed' ? t('canvas.statusFailed') : null}
      </p>

      {isAttributionMissing() ? (
        // Only when a provider's style was configured without their credit
        // beside it. The credit itself is passed through untouched wherever it
        // comes from (it is a licence condition); this is FRAME's own sentence
        // about its absence, so it is translated. The variable name is not.
        <p className="px-3 py-2 text-meta text-muted">
          {t.rich('attribution.missing', {
            variable: MAP_ATTRIBUTION_ENV_VAR,
            code: (chunks) => <code className="font-mono font-semibold">{chunks}</code>,
          })}
        </p>
      ) : null}
    </div>
  );
}
