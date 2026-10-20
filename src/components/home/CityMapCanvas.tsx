'use client';

import { useState } from 'react';

import { MapCanvas } from '@/components/map/MapCanvas';
import { MapPinCard } from '@/components/map/MapPinCard';
import type { MapPin } from '@/lib/data/repository';

/**
 * The map inside the opening band, and the one piece of state it needs.
 *
 * `CityMap` is a Server Component: it reads the request's geolocation and the
 * message catalogue, neither of which belongs in the browser bundle. But a pin
 * that can be clicked has to remember which one was, so that much lives here,
 * in the smallest client component that can hold it.
 *
 * The selection is deliberately *not* in the URL, which is the opposite of the
 * choice `/map` makes. There, a chosen place is a view worth sharing and worth
 * having a back button for. Here it is a glance at the band on the way down the
 * home page: putting it in the query string would add a history entry to the
 * home page for every pin a reader taps, and a shared link to the home page
 * with a place selected is not a thing anybody wants.
 */
export function CityMapCanvas({
  pins,
  centre,
  zoom,
  heightClassName,
}: {
  pins: MapPin[];
  centre: [number, number];
  zoom: number;
  heightClassName: string;
}) {
  const [selected, setSelected] = useState<MapPin | null>(null);

  return (
    <MapCanvas
      pins={pins}
      initialCenter={centre}
      initialZoom={zoom}
      selectedId={selected?.id ?? null}
      onSelect={setSelected}
      // A reader scrolling past a full-width map must not have the page stop
      // under the cursor while the map zooms instead.
      scrollZoom={false}
      heightClassName={heightClassName}
      className="h-full"
      anchored={
        // Only a place with a frame gets a card; a dot has nothing to put in
        // one. The band has no panel beside it, so for those pins the map is
        // simply a map, and the buttons above lead to the page that lists them.
        selected && selected.recentImageUrls.length > 0
          ? {
              lngLat: [selected.longitude, selected.latitude],
              content: <MapPinCard pin={selected} onDismiss={() => setSelected(null)} />,
            }
          : null
      }
    />
  );
}
