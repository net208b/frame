'use client';

import { CircleDashed } from 'lucide-react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { isMapConfigured, LOCATION_POLICY } from '@/lib/config';
import { precisionLabel } from '@/lib/geo';
import { cn, formatCoordinates } from '@/lib/utils';

import { MapLoadFailure, MapUnavailable } from './MapUnavailable';
import {
  MAP_ATTRIBUTION_ENV_VAR,
  MAP_SOURCE_ID,
  mapAttribution,
  mapStyleUrl,
  pointCollection,
  pointLayer,
} from './map-style';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * One place, one pin.
 *
 * Used by the photograph and location pages, where the map is a reference
 * rather than a tool: panning and scroll-zoom are off, so the page never
 * swallows a scroll gesture, and the zoom buttons remain real keyboard-
 * reachable controls. An approximate point is drawn and described as the area
 * it actually is, and the zoom ceiling drops with it, because a street-level
 * view of a kilometre-wide guess would be a lie told in pixels.
 */

type Phase = 'loading' | 'ready' | 'failed';

export function StaticLocationMap({
  latitude,
  longitude,
  name,
  isApproximate,
  precisionDecimals,
  zoom,
  heightClassName = 'h-[22rem]',
  className,
}: {
  latitude: number;
  longitude: number;
  name: string;
  isApproximate: boolean;
  precisionDecimals?: number;
  zoom?: number;
  heightClassName?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  const styleUrl = mapStyleUrl();
  const attribution = mapAttribution();

  // Never assume more precision than the caller proved. Without an explicit
  // figure, an approximate point is described at the reduced policy precision.
  const decimals =
    precisionDecimals ??
    (isApproximate
      ? LOCATION_POLICY.reducedCoordinateDecimals
      : LOCATION_POLICY.publicCoordinateDecimals);

  const initialZoom = zoom ?? (isApproximate ? 11 : 14);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !styleUrl) return;

    let disposed = false;
    let created: MapLibreMap | null = null;

    const build = async () => {
      const maplibregl = await import('maplibre-gl');
      if (disposed) return;

      const instance = new maplibregl.Map({
        container,
        style: styleUrl,
        center: [longitude, latitude],
        zoom: initialZoom,
        attributionControl: { customAttribution: attribution ?? undefined },
        // MapLibre labels its own canvas, which is the element that takes focus,
        // so the name belongs here rather than on the wrapper: labelling both
        // would announce one map as two nested regions.
        locale: { 'Map.Title': `Map showing ${name}` },
        maxZoom: isApproximate ? 13 : 17,
        // Reference, not exploration: the zoom buttons are the whole interface.
        dragPan: false,
        dragRotate: false,
        scrollZoom: false,
        boxZoom: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        keyboard: false,
      });

      created = instance;

      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
        'top-right',
      );

      instance.on('error', (event) => {
        console.error('MapLibre GL error', event.error);
        if (disposed) return;
        setPhase((current) => (current === 'ready' ? current : 'failed'));
      });

      instance.on('load', () => {
        if (disposed) return;

        instance.addSource(MAP_SOURCE_ID, {
          type: 'geojson',
          data: pointCollection([{ id: 'location', latitude, longitude, isApproximate }]),
        });
        instance.addLayer(pointLayer());

        setPhase('ready');
      });
    };

    void build();

    return () => {
      disposed = true;
      created?.remove();
    };
  }, [attribution, initialZoom, isApproximate, latitude, longitude, name, styleUrl]);

  if (!isMapConfigured()) return <MapUnavailable className={className} />;

  return (
    <div className={cn('relative', className)}>
      <p className="sr-only">
        {name} on a map at {formatCoordinates(latitude, longitude, decimals)}.
        {isApproximate
          ? ` This position is deliberately approximate, accurate to ${precisionLabel(decimals)}.`
          : null}
      </p>

      <div
        ref={containerRef}
        className={cn('w-full overflow-hidden rounded-media', heightClassName)}
      />

      {phase === 'loading' ? (
        <div aria-hidden className="skeleton absolute inset-0 rounded-media" />
      ) : null}

      {phase === 'failed' ? (
        <MapLoadFailure className="absolute inset-0 h-full rounded-media" />
      ) : null}

      {isApproximate ? (
        <p className="mt-2 flex items-start gap-2 text-meta leading-relaxed text-muted">
          <CircleDashed aria-hidden className="mt-0.5 size-3 shrink-0" />
          <span>
            Approximate position, accurate to {precisionLabel(decimals)}. The exact point is
            withheld because this place is privacy-sensitive.
          </span>
        </p>
      ) : null}

      {attribution ? null : (
        <p className="mt-2 text-meta text-muted">
          No map attribution is configured. Most providers require a credit line: set{' '}
          <code className="font-mono font-semibold">{MAP_ATTRIBUTION_ENV_VAR}</code>.
        </p>
      )}
    </div>
  );
}
