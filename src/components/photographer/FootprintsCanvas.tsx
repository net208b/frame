'use client';

import { useState } from 'react';

import { MapCanvas } from '@/components/map/MapCanvas';
import { MapPinCard } from '@/components/map/MapPinCard';
import type { MapPin } from '@/lib/data/repository';

/**
 * The map inside a profile's footprints section, and the selection it holds.
 *
 * The same shape as `CityMapCanvas`: `ProfileFootprints` is a Server Component
 * because it reads the message catalogue and groups the places, while a pin
 * that can be clicked has to remember which one was. That much lives here.
 *
 * NO INITIAL CAMERA, on purpose. `MapCanvas` fits itself to the pins it was
 * given when no centre is passed, which is exactly right for this map: the
 * frame of the picture is the member's own range. Somebody who has only
 * photographed one district opens on that district; somebody who has shot on
 * three continents opens on the world. Passing a city or a default view would
 * throw that answer away and make every profile look the same.
 *
 * The selection is not in the URL, as on the home band and unlike /map. A place
 * chosen here is a glance on the way down somebody's profile, not a view worth
 * sharing — and the shareable address for a place already exists, which is where
 * the card links to.
 */
export function FootprintsCanvas({
  pins,
  heightClassName,
}: {
  pins: MapPin[];
  heightClassName: string;
}) {
  const [selected, setSelected] = useState<MapPin | null>(null);

  return (
    <MapCanvas
      pins={pins}
      selectedId={selected?.id ?? null}
      onSelect={setSelected}
      // This map sits in the middle of a profile, so the wheel belongs to the
      // page. The zoom buttons and dragging still work.
      scrollZoom={false}
      heightClassName={heightClassName}
      className="h-full"
      anchored={
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
