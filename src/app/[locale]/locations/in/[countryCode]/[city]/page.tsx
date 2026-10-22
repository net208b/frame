import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { LocationCard } from '@/components/location/LocationCard';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { getCityHub, type CityHub } from '@/lib/data/repository';
import { buildDiscoverHref } from '@/lib/discover-query';
import { buildMetadata } from '@/lib/seo';
import { translatedText } from '@/lib/translation/applies';
import { formatCount } from '@/lib/utils';

/**
 * A city, as a page: the approved places in it and the newest frames made at
 * them.
 *
 * WHY THE URL LOOKS LIKE THIS. `/locations/in/[countryCode]/[city]`, not
 * `/locations/[countryCode]/[city]`. App Router allows one dynamic name per
 * path level, and `/locations/[slug]` already owns that level — two differently
 * named slugs there is a build error, not a routing nicety. The static `in`
 * segment gives the city hub a level of its own and reads as an address:
 * `/locations/in/TH/bangkok`.
 *
 * WHY THERE IS NO CITIES TABLE. The city is derived from `locations.city` and
 * `locations.country_code`, which every place has carried since 0002 and which
 * `locations_country_city_idx` indexes together. A curated cities table would
 * add a second name for something the places already name, two things to keep
 * in step, and an editorial job nobody has asked for. If city-scoped editorial
 * ever arrives, that is the moment to reconsider — not before.
 */

/**
 * Rendered on demand, never prerendered: the reads go through the cookie-bound
 * Supabase client, so row-level security answers as whoever is reading. Named
 * in `scripts/assert-dynamic-routes.sh`, whose list is hard-coded.
 */
export const dynamic = 'force-dynamic';

type CityParams = LocaleParams<{ countryCode: string; city: string }>;

export async function generateMetadata({ params }: { params: CityParams }): Promise<Metadata> {
  const { locale, countryCode, city } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'location' });

  const hub = await getCityHub(countryCode, city);
  if (!hub) {
    return buildMetadata({
      locale,
      title: t('city.notFoundMetaTitle'),
      description: t('city.notFoundMetaDescription'),
      path: `/locations/in/${countryCode}/${city}`,
      noIndex: true,
    });
  }

  const lead = hub.photographs.at(0);

  return buildMetadata({
    locale,
    title: t('city.metaTitle', { city: hub.city, country: hub.country }),
    description: t('city.metaDescription', { city: hub.city, country: hub.country }),
    path: cityPath(hub),
    image: lead ? { url: lead.image.displayUrl, alt: lead.altText } : null,
    // A city whose places hold nothing published is a real page that says so,
    // and is not offered to a crawler. `getCitiesWithContent` withholds the same
    // city from the sitemap, so the page and the sitemap agree.
    noIndex: hub.photographCount === 0,
  });
}

/** The canonical address of a hub, from the data rather than from the URL. */
function cityPath(hub: CityHub): string {
  return `/locations/in/${hub.countryCode}/${hub.citySlug}`;
}

export default async function CityPage({ params }: { params: CityParams }) {
  const { locale, countryCode, city } = await readLocaleParams(params);
  setRequestLocale(locale);

  const hub = await getCityHub(countryCode, city);
  if (!hub) notFound();

  const t = await getTranslations({ locale, namespace: 'location' });

  // Both onward links are ordinary Discover addresses: the city's name as a
  // place filter, as a gallery and as a map. Nothing here is a new surface.
  const galleryHref = buildDiscoverHref({ place: hub.city, page: 1 });
  const mapHref = buildDiscoverHref({ place: hub.city, page: 1, view: 'map' });

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>{t('city.eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">{hub.city}</h1>
        <p className="mt-4 text-lead text-muted">
          {t('city.lead', { country: hub.country })}
        </p>
        <p className="mt-3 text-caption tabular-nums text-muted">
          {t('city.summary', {
            places: hub.locations.length,
            formattedPlaces: formatCount(hub.locations.length, locale),
            photographs: hub.photographCount,
            formattedPhotographs: formatCount(hub.photographCount, locale),
          })}
        </p>
      </header>

      {/* The visible h2 SectionHead renders is the section's heading; it needs no
          aria-labelledby, which would only repeat the same words. */}
      <section className="mt-12">
        <SectionHead title={t('city.placesHeading')} />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {hub.locations.map((place) => (
            <LocationCard
              key={place.id}
              location={{
                ...place,
                // The place's name as this reader reads it, where a translation
                // exists (0035) — the same treatment the map pin gets.
                name: translatedText(place.name, place.translations.name, locale),
              }}
            />
          ))}
        </div>
      </section>

      {hub.photographs.length === 0 ? (
        <EmptyState
          className="mt-12"
          title={t('city.emptyTitle')}
          description={t('city.emptyBody')}
          action={
            <Button asChild variant="secondary">
              <Link href="/locations">{t('city.emptyAction')}</Link>
            </Button>
          }
        />
      ) : (
        <section className="mt-14">
          <SectionHead title={t('city.framesHeading')} />
          <MasonryGallery photos={hub.photographs} priorityCount={4} className="mt-6" />

          {/* Paging, ordering and every other filter belong to Discover. */}
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary">
              <Link href={galleryHref}>{t('city.openGallery')}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={mapHref}>{t('city.openMap')}</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
