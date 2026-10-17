import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LocationGallery } from '@/components/location/LocationGallery';
import { LocationHeader } from '@/components/location/LocationHeader';
import { NearbyLocations } from '@/components/location/NearbyLocations';
import { RestrictionList } from '@/components/location/RestrictionList';
import { ShootingNotes } from '@/components/location/ShootingNotes';
import {
  getLocation,
  getLocationSlugs,
  getNearbyLocations,
  getPhotographsAt,
} from '@/lib/data/repository';
import { buildMetadata, placeJsonLd } from '@/lib/seo';
import { truncate } from '@/lib/utils';

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const slugs = await getLocationSlugs();
  return slugs.map((slug) => ({ slug }));
}

function describe(name: string, city: string, country: string): string {
  return `${name} in ${city}, ${country}. Shooting notes from members, the access restrictions on record, and every photograph published at the place.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const location = await getLocation(slug);

  if (!location) {
    return buildMetadata({
      title: 'Location not found',
      description: 'This location is not published on FRAME.',
      path: `/locations/${slug}`,
      noIndex: true,
    });
  }

  const photographs = await getPhotographsAt(location.id);
  const lead = photographs.at(0);

  return buildMetadata({
    title: `${location.name}, ${location.city}`,
    description: location.description
      ? truncate(location.description, 155)
      : describe(location.name, location.city, location.country),
    path: `/locations/${location.slug}`,
    image: lead ? { url: lead.image.displayUrl, alt: lead.altText } : null,
  });
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const location = await getLocation(slug);
  if (!location) notFound();

  const [photographs, nearby] = await Promise.all([
    getPhotographsAt(location.id),
    getNearbyLocations(location),
  ]);

  // `placeJsonLd` emits `geo` only when a coordinate was actually published, so
  // the structured data cannot leak a point the location policy withheld.
  const jsonLd = JSON.stringify(placeJsonLd(location)).replace(/</g, '\\u003c');

  return (
    <article className="pb-20">
      <script
        type="application/ld+json"
        // Serialised above with `<` escaped, so no field can close this tag.
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <LocationHeader location={location} />

      <div className="site-container grid gap-12 border-b border-line py-12 lg:grid-cols-2 lg:gap-16">
        <ShootingNotes notes={location.shootingNotes} />
        <RestrictionList restrictions={location.restrictions} />
      </div>

      <div className="site-container py-14">
        <LocationGallery photos={photographs} locationName={location.name} />
      </div>

      <NearbyLocations locations={nearby} className="site-container" />
    </article>
  );
}
