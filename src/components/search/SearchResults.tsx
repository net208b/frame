import Link from 'next/link';
import type { ReactNode } from 'react';

import { LocationCard } from '@/components/location/LocationCard';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { formatCount, truncate } from '@/lib/utils';
import type { LocationDetail, PhotographCard, PhotographerProfile } from '@/types/domain';

/**
 * The three result groups, always presented as three groups.
 *
 * Every search looks in all three places, so all three report back even when
 * one found nothing: a silent group would read as "we did not look there". The
 * counts are only ever as exact as the repository can be — a group whose total
 * cannot be computed cheaply says "or more" rather than passing off the page
 * length as a total.
 */

export interface SearchGroup<T> {
  items: readonly T[];
  /** Null when an exact total would cost more than it is worth. */
  totalCount: number | null;
  hasMore: boolean;
}

const MORE_LINK =
  'text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink';

function countHeading(group: SearchGroup<unknown>, singular: string, plural: string): string {
  if (group.totalCount !== null) {
    return `${formatCount(group.totalCount)} ${group.totalCount === 1 ? singular : plural}`;
  }

  const shown = group.items.length;
  if (group.hasMore) return `${formatCount(shown)} or more ${plural}`;
  return `${formatCount(shown)} ${shown === 1 ? singular : plural}`;
}

function ResultSection({
  label,
  heading,
  action,
  children,
}: {
  label: string;
  heading: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <SectionHead eyebrow={label} title={heading} action={action} />
      {children}
    </section>
  );
}

function NothingHere({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted">{children}</p>;
}

export function SearchResults({
  query,
  photographs,
  places,
  people,
}: {
  query: string;
  photographs: SearchGroup<PhotographCard>;
  places: SearchGroup<LocationDetail>;
  people: SearchGroup<PhotographerProfile>;
}) {
  const found = photographs.items.length + places.items.length + people.items.length;
  // React escapes this on the way out, so a query full of angle brackets is
  // rendered as the text somebody typed rather than parsed as markup.
  const echoed = truncate(query, 60);

  if (found === 0) {
    return (
      <EmptyState
        className="mt-12"
        title={`Nothing matches “${echoed}”`}
        description="No place name, city, country or photographer name matched those words. A shorter search, or just the city, usually finds more."
        action={
          <Button asChild variant="secondary">
            <Link href="/discover">Browse everything instead</Link>
          </Button>
        }
      />
    );
  }

  const placeSearch = `/locations?search=${encodeURIComponent(query)}`;

  return (
    <div className="mt-12 space-y-16 animate-fade-in">
      <ResultSection
        label="Photographs"
        heading={countHeading(photographs, 'photograph', 'photographs')}
        action={
          photographs.items.length > 0 ? (
            <Link href={`/discover?place=${encodeURIComponent(query)}`} className={MORE_LINK}>
              Open this search in Discover
            </Link>
          ) : null
        }
      >
        {photographs.items.length > 0 ? (
          <MasonryGallery photos={photographs.items} priorityCount={3} />
        ) : (
          <NothingHere>
            No published photograph is pinned to a place matching {`“${echoed}”`}.
          </NothingHere>
        )}
      </ResultSection>

      <ResultSection
        label="Places"
        heading={countHeading(places, 'place', 'places')}
        action={
          places.hasMore ? (
            <Link href={placeSearch} className={MORE_LINK}>
              All matching places
            </Link>
          ) : null
        }
      >
        {places.items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {places.items.map((place) => (
              <li key={place.id}>
                <LocationCard location={place} categories={place.categories} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <NothingHere>No approved location matches those words yet.</NothingHere>
        )}
      </ResultSection>

      <ResultSection
        label="Photographers"
        heading={countHeading(people, 'photographer', 'photographers')}
      >
        {people.items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {people.items.map((person) => (
              <li key={person.id}>
                <PhotographerCard photographer={person} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <NothingHere>
            No photographer name or username matches those words. Names are matched as written, so a
            partial surname works better than a full one spelled differently.
          </NothingHere>
        )}
      </ResultSection>
    </div>
  );
}
