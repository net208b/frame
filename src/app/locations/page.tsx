import type { Metadata } from 'next';
import Link from 'next/link';

import { LocationCard } from '@/components/location/LocationCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { getLocations, getMapPins } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Locations',
  description:
    'Places street photographers have worked, each one submitted by a member and approved by a moderator, with the shooting notes and access restrictions recorded for it.',
  path: '/locations',
});

type SearchParams = Record<string, string | string[] | undefined>;

/** A query string can repeat a key; the first value wins. */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.at(0) ?? '';
  return value ?? '';
}

function parsePage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function locationsHref(page: number, search: string): string {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/locations?${query}` : '/locations';
}

export default async function LocationsIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const search = firstValue(resolved.search).trim();
  const page = parsePage(firstValue(resolved.page));

  // `LocationSummary` carries no image, and asking for one photograph per card
  // would be eighteen extra queries. The map pin set is a single read that
  // already includes a preview for every place with a publishable point, so a
  // card without one is simply a place whose position is withheld.
  const [result, pins] = await Promise.all([
    getLocations({ search: search || undefined, page }),
    getMapPins(),
  ]);

  const previews = new Map(pins.map((pin) => [pin.id, pin.previewImageUrl]));
  const matched = result.totalCount ?? result.items.length;

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <Eyebrow>Explore by place</Eyebrow>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <h1 className="text-display-fluid max-w-[16ch]">Where the work was made.</h1>
        <Button asChild variant="accent">
          <Link href="/map">Open the map</Link>
        </Button>
      </div>

      <p className="mt-6 max-w-[62ch] text-lead leading-relaxed text-muted">
        Every place here was submitted by a photographer and approved by a moderator. Each one
        carries what the community has worked out about it: what the light does, when to go, and
        what you are not permitted to do once you arrive.
      </p>

      <form
        method="get"
        action="/locations"
        role="search"
        className="mt-10 border-y border-line py-7"
      >
        <TextField
          label="Search places"
          name="search"
          type="search"
          autoComplete="off"
          defaultValue={search}
          placeholder="Place name, city or country"
          hint="Matches the place name, the city and the country."
          wrapperClassName="max-w-md"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit">Search</Button>
          {search ? (
            <Button asChild variant="secondary">
              <Link href="/locations">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <SectionHead
        className="mt-12"
        title={search ? `Results for “${search}”` : 'All places'}
        description={
          search
            ? `${matched} ${matched === 1 ? 'place matches' : 'places match'} this search.`
            : 'Ordered by how many photographs have been published at each place.'
        }
      />

      {result.items.length === 0 ? (
        search ? (
          <EmptyState
            title="No places match that search"
            description="Try a city or a country rather than a street, or clear the search to see everything that has been approved."
            action={
              <Button asChild variant="secondary">
                <Link href="/locations">Clear the search</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No places have been approved yet"
            description="Locations appear here once a moderator has approved a submission. Nothing has reached that point."
            action={
              <Button asChild variant="secondary">
                <Link href="/upload">Submit a place</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((location) => (
              <li key={location.id} className="min-w-0">
                <LocationCard
                  location={location}
                  previewImageUrl={previews.get(location.id) ?? null}
                  categories={location.categories}
                />
              </li>
            ))}
          </ul>

          <Pagination
            className="mt-12"
            page={result.page}
            hasMore={result.hasMore}
            totalCount={result.totalCount}
            pageSize={result.pageSize}
            buildHref={(nextPage) => locationsHref(nextPage, search)}
          />
        </>
      )}
    </div>
  );
}
