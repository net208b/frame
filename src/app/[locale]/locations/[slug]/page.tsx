import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { LocationGallery } from '@/components/location/LocationGallery';
import { LocationHeader } from '@/components/location/LocationHeader';
import { NearbyLocations } from '@/components/location/NearbyLocations';
import { RestrictionList } from '@/components/location/RestrictionList';
import { ShootingNotes } from '@/components/location/ShootingNotes';
import { LOCALES, type Locale } from '@/i18n/locales';
import {
  getLocation,
  getLocationSlugs,
  getNearbyLocations,
  getPhotographsAt,
} from '@/lib/data/repository';
import { buildMetadata, placeJsonLd } from '@/lib/seo';
import { truncate } from '@/lib/utils';

/** Every approved location in every language. */
export async function generateStaticParams(): Promise<Array<{ locale: Locale; slug: string }>> {
  const slugs = await getLocationSlugs();
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: LocaleParams<{ slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'location' });
  const location = await getLocation(slug);

  if (!location) {
    return buildMetadata({
      title: t('detail.notFoundMetaTitle'),
      description: t('detail.notFoundMetaDescription'),
      path: `/locations/${slug}`,
      locale,
      noIndex: true,
    });
  }

  const photographs = await getPhotographsAt(location.id);
  const lead = photographs.at(0);

  return buildMetadata({
    title: t('detail.metaTitle', { name: location.name, city: location.city }),
    // A member-written description is used as stored, in whatever language it
    // was written in; the fallback sentence is the one that gets translated.
    description: location.description
      ? truncate(location.description, 155)
      : t('detail.metaDescription', {
          name: location.name,
          city: location.city,
          country: location.country,
        }),
    path: `/locations/${location.slug}`,
    locale,
    image: lead ? { url: lead.image.displayUrl, alt: lead.altText } : null,
  });
}

export default async function LocationDetailPage({
  params,
}: {
  params: LocaleParams<{ slug: string }>;
}) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);

  const location = await getLocation(slug);
  if (!location) notFound();

  const [photographs, nearby] = await Promise.all([
    getPhotographsAt(location.id),
    getNearbyLocations(location),
  ]);

  // `placeJsonLd` emits `geo` only when a coordinate was actually published, so
  // the structured data cannot leak a point the location policy withheld.
  const jsonLd = JSON.stringify(placeJsonLd(location, locale)).replace(/</g, '\\u003c');

  return (
    <article className="pb-20">
      <script
        type="application/ld+json"
        // Serialised above with `<` escaped, so no field can close this tag.
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <LocationHeader location={location} locale={locale} />

      <div className="site-container grid gap-12 border-b border-line py-12 lg:grid-cols-2 lg:gap-16">
        <ShootingNotes notes={location.shootingNotes} locale={locale} />
        <RestrictionList restrictions={location.restrictions} locale={locale} />
      </div>

      <div className="site-container py-14">
        <LocationGallery photos={photographs} locationName={location.name} locale={locale} />
      </div>

      <NearbyLocations locations={nearby} locale={locale} className="site-container" />
    </article>
  );
}
