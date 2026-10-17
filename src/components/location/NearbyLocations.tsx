import { LocationCard } from '@/components/location/LocationCard';
import { SectionHead } from '@/components/ui/SectionHead';
import { cn } from '@/lib/utils';
import type { LocationSummary } from '@/types/domain';

type NearbyLocation = LocationSummary & { distanceMetres: number };

/**
 * Other approved places close to this one.
 *
 * Distances are measured between *published* coordinates, so a place whose
 * position has been coarsened cannot have its real point inferred from how far
 * away it is said to be. The section disappears entirely when there is nothing
 * nearby rather than standing there empty.
 */
export function NearbyLocations({
  locations,
  className,
}: {
  locations: readonly NearbyLocation[];
  className?: string;
}) {
  if (locations.length === 0) return null;

  return (
    <section aria-labelledby="nearby-locations" className={cn('min-w-0', className)}>
      <SectionHead
        eyebrow="Within reach"
        title={<span id="nearby-locations">Nearby places</span>}
        description="Distances are straight-line, measured between published points."
      />

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {locations.map((location) => (
          <li key={location.id} className="min-w-0">
            <LocationCard location={location} distanceMetres={location.distanceMetres} />
          </li>
        ))}
      </ul>
    </section>
  );
}
