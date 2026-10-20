'use client';

import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { loadMapLibre } from '@/components/map/load-maplibre';
import { useResolvedTheme } from '@/components/system/use-theme';
import { isMapConfigured, LOCATION_POLICY } from '@/lib/config';
import { basemapVariant, type BasemapLanguage } from '@/lib/map/basemap';
import { cn } from '@/lib/utils';

import { mapAttribution, mapStyleUrl, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from './map-style';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * A map you put a pin on, to answer "where did you stand".
 *
 * WHY IT EXISTS. The upload form used to ask for a latitude and a longitude as
 * two text fields and nothing else. The database has always stored an approved
 * place to four decimals — about eleven metres — so the precision was never the
 * problem; the problem was that almost nobody knows their latitude to four
 * decimals, and a form that asks for one in a box gets either a rounded guess
 * or an empty field. Dropping a pin is the only input that matches what the
 * member actually knows: the corner they were standing on.
 *
 * THE FIELDS STAY. They are not a legacy fallback kept out of caution — they
 * are the only way to enter a coordinate read off a GPS receiver, a camera, or
 * somebody else's map, and the only way this step works at all for a member
 * whose browser cannot run WebGL. The two are one value in two
 * representations, so they are kept in step in both directions: dragging writes
 * the fields, typing moves the pin.
 *
 * WHAT IT DOES NOT DO. It never asks the browser where the member is.
 * `navigator.geolocation` would be the obvious way to open the map on the right
 * street and it is not used here, because a permission prompt in the middle of
 * an upload form asks for a great deal to save a little scrolling. The map
 * opens on the city the request's own address resolved to instead (see
 * `visitorPlace()`), which costs the member nothing and is usually the same
 * answer.
 *
 * It also decides nothing about the place. The checks under the form still run
 * on whatever coordinate comes out of here, approval is still a moderator's
 * decision, and a pin dropped in the right country is not evidence of anything.
 */

/**
 * Four decimals, the precision an approved place is published at. Writing more
 * than this into the field would be theatre — the value is rounded on the way
 * into the database anyway — and writing less would trip the form's own
 * low-precision check.
 */
const DECIMALS = LOCATION_POLICY.publicCoordinateDecimals;

/** Close enough to read a street, which is the scale this question is asked at. */
const PLACED_ZOOM = 16;

function format(value: number): string {
  return value.toFixed(DECIMALS);
}

export interface CoordinatePickerView {
  centre: [number, number];
  zoom: number;
}

export function CoordinatePicker({
  latitude,
  longitude,
  onChange,
  defaultView,
  className,
}: {
  /** The field's own string, so an empty or half-typed value is not a number. */
  latitude: string;
  longitude: string;
  onChange: (next: { latitude: string; longitude: string }) => void;
  /** Where to open when nothing has been picked yet — the reader's own city. */
  defaultView?: CoordinatePickerView | null;
  className?: string;
}) {
  const t = useTranslations('upload');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  const theme = useResolvedTheme();
  const language: BasemapLanguage = useLocale() === 'th' ? 'th' : 'en';
  const styleUrl = mapStyleUrl(basemapVariant(theme, language));
  const attribution = mapAttribution();

  // The parsed point, or null while the fields are empty or mid-edit. Both
  // halves have to be a number for there to be a pin at all: a latitude with no
  // longitude is not half a place.
  const parsed = (() => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (latitude.trim() === '' || longitude.trim() === '') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  })();

  // Read from handlers that outlive the render that created them.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /**
   * Set when the change came from this map — a click on it or a drag of its pin.
   *
   * It is what tells the camera effect below to stay where it is. A coordinate
   * the member produced by pointing at the map is already on their screen, at
   * the zoom they chose; flying to it would move the ground under the gesture
   * they just made. A coordinate from anywhere else — typed, copied from the
   * file's own GPS, or picked from the place search — is somewhere they have
   * not looked yet, and the map should go there.
   */
  const fromMapRef = useRef(false);

  const write = useCallback((lng: number, lat: number) => {
    fromMapRef.current = true;
    onChangeRef.current({ latitude: format(lat), longitude: format(lng) });
  }, []);

  const labels = {
    accessibleName: t('place.pickerMapLabel'),
    zoomIn: t('place.pickerZoomIn'),
    zoomOut: t('place.pickerZoomOut'),
    cooperative: t('place.pickerCooperativeGesture'),
    cooperativeTouch: t('place.pickerCooperativeTouch'),
  };

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
        center: defaultView?.centre ?? MAP_DEFAULT_CENTER,
        zoom: defaultView?.zoom ?? MAP_DEFAULT_ZOOM,
        attributionControl: { customAttribution: attribution ?? undefined },
        locale: {
          'Map.Title': labels.accessibleName,
          'NavigationControl.ZoomIn': labels.zoomIn,
          'NavigationControl.ZoomOut': labels.zoomOut,
          'CooperativeGesturesHandler.WindowsHelpText': labels.cooperative,
          'CooperativeGesturesHandler.MacHelpText': labels.cooperative,
          'CooperativeGesturesHandler.MobileHelpText': labels.cooperativeTouch,
        },
        // This map sits in the middle of a long form, and a wheel over it would
        // otherwise stop the page and zoom the map instead. Cooperative
        // gestures ask for a modifier first and say so on the map, which is the
        // one place a reader will look for the explanation.
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // Past this the basemap is being stretched rather than drawn, and the
        // extra zoom would suggest a precision the published point will not have.
        maxZoom: 18,
      });

      created = instance;
      mapRef.current = instance;

      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
        'top-right',
      );

      instance.on('error', (event) => {
        console.error('MapLibre GL error', event.error);
      });

      // Clicking bare map puts the pin there. This is the gesture that does the
      // work — dragging only adjusts what the click placed.
      instance.on('click', (event) => {
        if (disposed) return;
        write(event.lngLat.lng, event.lngLat.lat);
      });

      instance.on('load', () => {
        if (disposed) return;
        setReady(true);
      });
    };

    void build();

    return () => {
      disposed = true;
      markerRef.current = null;
      created?.remove();
      if (mapRef.current === created) mapRef.current = null;
      setReady(false);
    };
    // `labels` and `defaultView` are read once, when the map is built: a new
    // object identity for either must not tear the map down mid-edit. The style
    // URL and theme do rebuild it, because a style cannot be recoloured in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attribution, styleUrl, theme, write]);

  /** The pin follows the value, however the value was set. */
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !ready) return;

    if (!parsed) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const existing = markerRef.current;
    if (existing) {
      existing.setLngLat([parsed.lng, parsed.lat]);
      return;
    }

    void loadMapLibre().then((maplibregl) => {
      if (!mapRef.current || markerRef.current) return;

      const element = document.createElement('div');
      element.className = [
        'size-6 rounded-pill border-[3px] border-surface bg-accent',
        'shadow-popover ring-1 ring-ink/10',
      ].join(' ');

      const marker = new maplibregl.Marker({ element, draggable: true })
        .setLngLat([parsed.lng, parsed.lat])
        .addTo(mapRef.current);

      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        write(lng, lat);
      });

      markerRef.current = marker;
    });
  }, [parsed, ready, write]);

  /**
   * Follows the value with the camera, for every value the member did not
   * produce by pointing at this map — see `fromMapRef`.
   *
   * Being inside the current viewport is not enough to stay put: picking
   * "Wat Arun" from the search while looking at the whole world leaves the pin
   * technically on screen and four pixels wide, which is not an answer to "is
   * this the right spot?". So the camera goes to it and zooms in far enough to
   * read the street.
   */
  const lastCentredRef = useRef<string | null>(null);
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !ready || !parsed) return;

    const key = `${parsed.lat},${parsed.lng}`;
    if (lastCentredRef.current === key) return;
    const first = lastCentredRef.current === null;
    lastCentredRef.current = key;

    if (fromMapRef.current) {
      fromMapRef.current = false;
      return;
    }

    instance.easeTo({
      center: [parsed.lng, parsed.lat],
      zoom: Math.max(instance.getZoom(), PLACED_ZOOM),
      duration: first ? 0 : 420,
    });
  }, [parsed, ready]);

  if (!isMapConfigured()) {
    // Maps are switched off for this deployment. The fields below are the whole
    // input then, which is exactly why they were kept.
    return null;
  }

  return (
    <div className={cn('overflow-hidden rounded-card border border-line', className)}>
      <div ref={containerRef} className="h-[20rem] w-full bg-surface-sunken" />

      <p className="border-t border-line bg-surface px-4 py-3 text-meta leading-relaxed text-muted">
        {parsed
          ? t('place.pickerChosen', {
              latitude: format(parsed.lat),
              longitude: format(parsed.lng),
            })
          : t('place.pickerIdle')}
      </p>
    </div>
  );
}
