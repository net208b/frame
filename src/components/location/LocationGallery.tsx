import { getTranslations } from 'next-intl/server';

import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn, formatCount } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * Every published photograph made at this place.
 *
 * The photographer credit stays on each card: a location page is a shared
 * space, and the work in it belongs to the people who made it rather than to
 * the place.
 */
export async function LocationGallery({
  photos,
  locationName,
  locale,
  className,
}: {
  photos: readonly PhotographCard[];
  locationName: string;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'location' });
  const count = photos.length;

  return (
    <section aria-labelledby="location-gallery" className={cn('min-w-0', className)}>
      <SectionHead
        eyebrow={t('gallery.eyebrow')}
        title={<span id="location-gallery">{t('gallery.title')}</span>}
        description={
          count === 0
            ? t('gallery.empty')
            : t('gallery.publishedCount', {
                count,
                value: formatCount(count, INTL_LOCALES[locale]),
              })
        }
      />

      {count === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={t('gallery.emptyTitle')}
            description={t('gallery.emptyBody', { name: locationName })}
            action={
              <Button asChild variant="primary">
                <Link href="/upload">{t('gallery.addPhotograph')}</Link>
              </Button>
            }
          />
          <CapabilityNotice capability="uploads" action={t('gallery.publishAction')} />
        </div>
      ) : (
        // The gallery sits below the masthead and its map, so nothing here is
        // above the fold on any viewport and preloading would compete with the
        // content that is.
        <MasonryGallery photos={photos} priorityCount={0} showPhotographer />
      )}
    </section>
  );
}
