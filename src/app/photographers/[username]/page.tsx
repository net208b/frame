import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { gearBrandIndex, GearList } from '@/components/photographer/GearList';
import { ProfileCollections } from '@/components/photographer/ProfileCollections';
import { ProfileHeader } from '@/components/photographer/ProfileHeader';
import { ProfileStats } from '@/components/photographer/ProfileStats';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import {
  getCollections,
  getPhotographer,
  getPhotographerUsernames,
  getPortfolio,
} from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { cn, formatCount, truncate } from '@/lib/utils';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

/**
 * `generateMetadata` and the page itself both need the profile, the portfolio
 * and the public collections. `cache` makes that one set of queries per
 * request instead of two.
 */
const loadProfile = cache(async (username: string) => {
  const photographer = await getPhotographer(username);
  if (!photographer) return null;

  const [portfolio, collections] = await Promise.all([
    getPortfolio(photographer.id),
    // No `includePrivate`, so a private collection is never even read here.
    getCollections({ ownerId: photographer.id }),
  ]);

  return { photographer, portfolio, collections };
});

export async function generateStaticParams(): Promise<Array<{ username: string }>> {
  const usernames = await getPhotographerUsernames();
  return usernames.map((username) => ({ username }));
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const loaded = await loadProfile(username);

  if (!loaded) {
    return buildMetadata({
      title: 'Photographer not found',
      description: 'No FRAME member uses this profile address.',
      path: `/photographers/${username}`,
      noIndex: true,
    });
  }

  const { photographer, portfolio } = loaded;
  const lead = portfolio.at(0);
  const based = photographer.basedIn ? `, based in ${photographer.basedIn}` : '';

  return buildMetadata({
    title: `${photographer.displayName} (@${photographer.username})`,
    description: photographer.biography
      ? truncate(photographer.biography, 155)
      : `${photographer.displayName} photographs streets and the places behind them on FRAME${based}.`,
    path: `/photographers/${photographer.username}`,
    // The newest published frame, so the share card shows the member's work
    // rather than their avatar.
    image: lead ? { url: lead.image.displayUrl, alt: lead.altText } : null,
  });
}

export default async function PhotographerProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const loaded = await loadProfile(username);
  if (!loaded) notFound();

  const { photographer, portfolio, collections } = loaded;

  // The portfolio read is capped, so the count under the heading says what is
  // on the page rather than repeating the profile total as if it were shown.
  const shown = portfolio.length;
  const capped = shown < photographer.photographCount;
  const portfolioCount = capped
    ? `${formatCount(shown)} most recent of ${formatCount(photographer.photographCount)}`
    : `${formatCount(shown)} published`;

  // GearList renders nothing when the member left the field blank, so the band
  // drops to one column rather than keeping an empty second one open.
  const hasGear = photographer.usualGear.some((entry) => entry.trim().length > 0);

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <ProfileHeader photographer={photographer} />

      <div
        className={cn(
          'mt-10 grid gap-9 lg:gap-14',
          hasGear && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]',
        )}
      >
        <ProfileStats photographer={photographer} />
        {hasGear ? (
          <GearList gear={photographer.usualGear} brands={gearBrandIndex(portfolio)} />
        ) : null}
      </div>

      <section className="mt-14">
        <SectionHead
          eyebrow="Portfolio"
          title="Published photographs"
          action={
            shown > 0 ? (
              <p className="text-meta text-muted tabular-nums">{portfolioCount}</p>
            ) : null
          }
        />

        {shown > 0 ? (
          <MasonryGallery photos={portfolio} showPhotographer={false} priorityCount={4} />
        ) : (
          <EmptyState
            title="Nothing published yet"
            description={`${photographer.displayName} has not published a photograph. Drafts and uploads still in review are never shown here.`}
          />
        )}
      </section>

      <ProfileCollections
        collections={collections}
        photographerName={photographer.displayName}
        className="mt-16"
      />
    </div>
  );
}
