import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

import { intlLocaleOf } from '@/components/challenges/format';
import { Link } from '@/i18n/navigation';
import { formatRelative } from '@/lib/utils';
import type { LocationDetail, PhotographDetail } from '@/types/domain';

import { LocationLiveActions, PhotographLiveActions } from './LiveActions';

/**
 * What is live: the latest published photographs and approved places, each
 * with the way to undo it. Where an approval is a decision, this is where
 * the decision can be revisited.
 */
export async function LiveList({
  locale,
  photographs,
  places,
}: {
  locale: string;
  photographs: PhotographDetail[];
  places: LocationDetail[];
}) {
  const t = await getTranslations({ locale, namespace: 'admin.live' });
  const intlLocale = intlLocaleOf(locale);

  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-title font-bold">{t('photographsTitle', { count: photographs.length })}</h2>
        {photographs.length === 0 ? (
          <p className="mt-3 text-body text-muted">{t('photographsEmpty')}</p>
        ) : (
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {photographs.map((photo) => (
              <li key={photo.id} className="grid gap-4 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-start">
                <Image src={photo.image.thumbUrl} alt="" width={64} height={64} sizes="64px" className="size-16 rounded-media object-cover" />
                <div className="min-w-0">
                  <Link href={`/photographs/${photo.slug}`} className="block truncate text-body font-semibold hover:text-accent-strong">
                    {photo.title}
                  </Link>
                  <p className="text-caption text-muted">
                    {photo.photographer.displayName} · {formatRelative(photo.publishedAt, new Date(), intlLocale)}
                    {photo.location ? ` · ${photo.location.name}` : ''}
                  </p>
                </div>
                <PhotographLiveActions photographId={photo.id} title={photo.title} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="text-title font-bold">{t('placesTitle', { count: places.length })}</h2>
        {places.length === 0 ? (
          <p className="mt-3 text-body text-muted">{t('placesEmpty')}</p>
        ) : (
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {places.map((place) => (
              <li key={place.id} className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <Link href={`/locations/${place.slug}`} className="block truncate text-body font-semibold hover:text-accent-strong">
                    {place.name}
                  </Link>
                  <p className="text-caption text-muted">
                    {place.city}, {place.country} · {t('photographCount', { count: place.photographCount })}
                  </p>
                </div>
                <LocationLiveActions
                  locationId={place.id}
                  name={place.name}
                  pinPrecision={place.pinPrecision}
                  // The console redirects anybody who is not an admin before
                  // it renders, so everybody who sees this list is one.
                  canDelete
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
