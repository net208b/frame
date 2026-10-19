'use client';

import { CircleDashed } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LocationCard } from '@/components/location/LocationCard';
import { LOCATION_POLICY } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { cn } from '@/lib/utils';

import { precisionParts } from './precision';

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
  const t = useTranslations('map');

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
            {t('pinPreview.approximate', {
              precision: t(
                'precision',
                precisionParts(LOCATION_POLICY.reducedCoordinateDecimals),
              ),
            })}
          </span>
        </p>
      ) : null}
    </div>
  );
}
