'use client';

import { CircleDashed } from 'lucide-react';

import { LocationCard } from '@/components/location/LocationCard';
import { LOCATION_POLICY } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { precisionLabel } from '@/lib/geo';
import { cn } from '@/lib/utils';

/**
 * The expanded card for the pin a viewer has selected.
 *
 * It is the same {@link LocationCard} the location index uses, so a place looks
 * like itself wherever it appears, with two additions the map needs: a heavier
 * border marking the selection, and the privacy disclosure for a pin whose
 * position is deliberately imprecise. The pin on the map cannot say that on its
 * own, and leaving it unsaid would let a soft circle pass for a street address.
 */
export function MapPinPreview({ pin, className }: { pin: MapPin; className?: string }) {
  return (
    <div className={cn('animate-fade-in', className)}>
      <LocationCard
        location={pin}
        previewImageUrl={pin.previewImageUrl}
        categories={pin.categories}
        className="border-line-strong"
      />

      {pin.isApproximate ? (
        <p className="mt-2 flex items-start gap-2 text-meta leading-relaxed text-muted">
          <CircleDashed aria-hidden className="mt-0.5 size-3 shrink-0" />
          <span>
            This pin is deliberately approximate, accurate to{' '}
            {precisionLabel(LOCATION_POLICY.reducedCoordinateDecimals)}, because the place is
            privacy-sensitive.
          </span>
        </p>
      ) : null}
    </div>
  );
}
