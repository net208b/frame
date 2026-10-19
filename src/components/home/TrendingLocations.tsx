import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { LocationCard } from '@/components/location/LocationCard';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { LocationDetail } from '@/types/domain';

/**
 * The places holding the most published work.
 *
 * The ordering is stated in the section description rather than left for the
 * reader to infer, which is the same commitment the Discover sorts make — and
 * it is stated in both languages, because an unexplained ranking is no more
 * acceptable in Thai than in English.
 */
export async function TrendingLocations({
  locations,
  previewImageByLocationId,
  locale,
  className,
}: {
  locations: readonly LocationDetail[];
  /** Thumbnails already resolved by the map-pin read, keyed by location id. */
  previewImageByLocationId?: Readonly<Record<string, string | null>>;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section className={cn('mt-14', className)}>
      <SectionHead
        eyebrow={t('locations.eyebrow')}
        title={t('locations.title')}
        description={t('locations.description')}
        action={
          <Link
            href="/locations"
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
          >
            {t('locations.all')}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      />

      {locations.length > 0 ? (
        <ul className="grid gap-4 min-[900px]:grid-cols-3">
          {locations.map((location) => (
            <li key={location.id}>
              {/* Three tags at most, so every card in the row stays one height. */}
              <LocationCard
                location={location}
                previewImageUrl={previewImageByLocationId?.[location.id]}
                categories={location.categories.slice(0, 3)}
                className="h-full"
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t('locations.emptyTitle')}
          description={t('locations.emptyDescription')}
        />
      )}
    </section>
  );
}
