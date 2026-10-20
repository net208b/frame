'use client';

import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { cn } from '@/lib/utils';

import { MapLoadFailure, MapUnavailable } from './MapUnavailable';
import {
  clusterLayers,
  MAP_ATTRIBUTION_ENV_VAR,
  MAP_CLUSTER,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FIT_MAX_ZOOM,
  MAP_LAYERS,
  MAP_MOVE_DURATION_MS,
  MAP_SELECTION_ZOOM,
  MAP_SOURCE_ID,
  mapAttribution,
  mapStyleUrl,
  pointCollection,
  pointLayer,
  selectionFilter,
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
  initialCenter,
  initialZoom,
  selectedId,
  onSelect,
  onVisibleChange,
  className,
  heightClassName = 'h-[70vh]',
}: {
  pins: MapPin[];
  initialCenter?: [number, number];
  initialZoom?: number;
  selectedId?: string | null;
  onSelect?: (pin: MapPin | null) => void;
  /**
   * Beyond the shared contract, and optional: reports which pins currently fall
   * inside the viewport so a panel beside the map can list what is in view.
   */
  onVisibleChange?: (visibleIds: string[]) => void;
  className?: string;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const onSelectRef = useRef(onSelect);
  const onVisibleChangeRef = useRef(onVisibleChange);
  useEffect(() => {
    pinsRef.current = pins;
    onSelectRef.current = onSelect;
    onVisibleChangeRef.current = onVisibleChange;
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

  const styleUrl = mapStyleUrl();
  const attribution = mapAttribution();

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
          data: pointCollection(pinsRef.current),
          cluster: true,
          clusterRadius: MAP_CLUSTER.radius,
          clusterMaxZoom: MAP_CLUSTER.maxZoom,
        });

        for (const layer of clusterLayers()) instance.addLayer(layer);
        instance.addLayer(selectionLayer());
        instance.addLayer(pointLayer());

        for (const layerId of [MAP_LAYERS.clusters, MAP_LAYERS.points]) {
          instance.on('mouseenter', layerId, () => {
            instance.getCanvas().style.cursor = 'pointer';
          });
          instance.on('mouseleave', layerId, () => {
            instance.getCanvas().style.cursor = '';
          });
        }

        instance.on('click', handleClick);
        instance.on('moveend', () => {
          if (!disposed) reportVisible(instance, pinsRef.current);
        });

        if (!initialViewRef.current.explicit) fitToPins(instance, pinsRef.current);

        setPhase('ready');
        reportVisible(instance, pinsRef.current);
      });
    };

    void build();

    return () => {
      disposed = true;
      created?.remove();
      if (mapRef.current === created) mapRef.current = null;
    };
  }, [accessibleName, attribution, reportVisible, styleUrl, zoomInLabel, zoomOutLabel]);

  // Filter changes replace the source data rather than rebuilding the map.
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || phase !== 'ready') return;
    const source = instance.getSource<GeoJSONSource>(MAP_SOURCE_ID);
    if (!source) return;
    source.setData(pointCollection(pins));
    reportVisible(instance, pins);
  }, [phase, pins, reportVisible]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || phase !== 'ready' || !instance.getLayer(MAP_LAYERS.selection)) return;

    instance.setFilter(MAP_LAYERS.selection, selectionFilter(selectedId ?? null));

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

      {attribution ? null : (
        // The provider's own credit line is passed through untouched (it is a
        // licence condition); this is FRAME's own sentence about its absence,
        // so it is translated. The variable name is not.
        <p className="px-3 py-2 text-meta text-muted">
          {t.rich('attribution.missing', {
            variable: MAP_ATTRIBUTION_ENV_VAR,
            code: (chunks) => <code className="font-mono font-semibold">{chunks}</code>,
          })}
        </p>
      )}
    </div>
  );
}
