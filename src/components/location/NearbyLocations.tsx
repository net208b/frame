import { getTranslations } from 'next-intl/server';

import { LocationCard } from '@/components/location/LocationCard';
import { SectionHead } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
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
 *
 * The distances themselves are formatted inside `LocationCard`, which reads the
 * active locale itself because it is also rendered from Client Components.
 */
export async function NearbyLocations({
  locations,
  locale,
  className,
}: {
  locations: readonly NearbyLocation[];
  locale: Locale;
  className?: string;
}) {
  if (locations.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'location' });

  return (
    <section aria-labelledby="nearby-locations" className={cn('min-w-0', className)}>
      <SectionHead
        eyebrow={t('nearby.eyebrow')}
        title={<span id="nearby-locations">{t('nearby.title')}</span>}
        description={t('nearby.description')}
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
