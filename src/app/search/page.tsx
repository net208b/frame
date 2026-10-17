import Link from 'next/link';

import { SearchForm } from '@/components/search/SearchForm';
import { SearchResults, type SearchGroup } from '@/components/search/SearchResults';
import { Chip } from '@/components/ui/Chip';
import { Eyebrow } from '@/components/ui/SectionHead';
import {
  getDiscoverFeed,
  getFeaturedPhotographers,
  getLocations,
  getPhotographer,
  getPhotographerUsernames,
  normaliseDiscoverQuery,
} from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import type { LocationDetail, PhotographCard, PhotographerProfile } from '@/types/domain';

/**
 * Cross-entity search.
 *
 * One query parameter, `q`, and three answers built from the read API the rest
 * of the UI uses: the discover feed filtered by place, the location index and a
 * name match over photographers. There is deliberately no bespoke query here —
 * a search that reached past the repository would also reach past the
 * published-and-approved filters every one of those functions applies.
 *
 * What that means for the viewer is stated on the page rather than implied:
 * place names, cities, countries and photographer names are matched, and
 * nothing else is. In particular a photograph's own title is not searchable
 * yet, because no repository function can match one.
 */

/** A search results page has nothing a crawler should index. */
export const metadata = buildMetadata({
  title: 'Search',
  description:
    'Search FRAME for places, the photographs pinned to them and the photographers who made them.',
  path: '/search',
  noIndex: true,
});

const MAX_QUERY_LENGTH = 120;
const PHOTOGRAPH_LIMIT = 12;
const PLACE_LIMIT = 6;
const PEOPLE_LIMIT = 6;
/** How far into the photographer list a display-name match is looked for. */
const PEOPLE_POOL = 24;

/**
 * Cities that exist in the seeded dataset, offered as a starting point. They
 * are not "popular searches": FRAME keeps no record of what anyone searches
 * for, so there is no popularity to report.
 */
const SUGGESTED_SEARCHES = ['Tokyo', 'New York', 'Paris', 'Kyoto', 'London', 'Amsterdam'] as const;

const INLINE_LINK =
  'font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readQuery(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  return first.trim().slice(0, MAX_QUERY_LENGTH);
}

function matchesName(person: PhotographerProfile, needle: string): boolean {
  return (
    person.username.toLowerCase().includes(needle) ||
    person.displayName.toLowerCase().includes(needle)
  );
}

/**
 * People search without a dedicated query: usernames are matched across the
 * whole list the repository will hand out, and display names across the
 * most-appreciated photographers. The limit is therefore a real limit, which is
 * why the caller reports the count as inexact once it is reached.
 */
async function findPhotographers(needle: string): Promise<PhotographerProfile[]> {
  const [usernames, pool] = await Promise.all([
    getPhotographerUsernames(),
    getFeaturedPhotographers(PEOPLE_POOL),
  ]);

  const found = new Map<string, PhotographerProfile>();
  const seenUsernames = new Set<string>();

  for (const person of pool) {
    if (!matchesName(person, needle)) continue;
    found.set(person.id, person);
    seenUsernames.add(person.username);
  }

  const outstanding = usernames
    .filter((username) => username.toLowerCase().includes(needle))
    .filter((username) => !seenUsernames.has(username))
    .slice(0, PEOPLE_LIMIT);

  const profiles = await Promise.all(outstanding.map((username) => getPhotographer(username)));
  for (const profile of profiles) {
    if (profile) found.set(profile.id, profile);
  }

  return [...found.values()].slice(0, PEOPLE_LIMIT);
}

interface SearchOutcome {
  photographs: SearchGroup<PhotographCard>;
  places: SearchGroup<LocationDetail>;
  people: SearchGroup<PhotographerProfile>;
}

async function runSearch(query: string): Promise<SearchOutcome> {
  const [feed, locationPage, people] = await Promise.all([
    getDiscoverFeed(normaliseDiscoverQuery({ place: query, pageSize: PHOTOGRAPH_LIMIT })),
    getLocations({ search: query }),
    findPhotographers(query.toLowerCase()),
  ]);

  const places = locationPage.items.slice(0, PLACE_LIMIT);
  const peopleCapped = people.length >= PEOPLE_LIMIT;

  return {
    photographs: {
      items: feed.items,
      totalCount: feed.totalCount,
      hasMore: feed.hasMore,
    },
    places: {
      items: places,
      totalCount: locationPage.totalCount,
      hasMore: locationPage.hasMore || places.length < locationPage.items.length,
    },
    people: {
      items: people,
      // Exact below the cap; unknown at it, because the search stopped looking.
      totalCount: peopleCapped ? null : people.length,
      hasMore: peopleCapped,
    },
  };
}

function SearchPrompt() {
  return (
    <section aria-labelledby="search-prompt" className="mt-12 max-w-2xl">
      <h2 id="search-prompt" className="text-title font-bold">
        Start with a city
      </h2>
      <p className="mt-2.5 text-caption leading-relaxed text-muted">
        A city name finds the places photographers have pinned there and the frames they brought
        back from them. These are starting points rather than popular searches: FRAME keeps no
        record of what anyone searches for.
      </p>

      <ul className="mt-5 flex flex-wrap gap-2">
        {SUGGESTED_SEARCHES.map((term) => (
          <li key={term}>
            <Chip href={`/search?q=${encodeURIComponent(term)}`}>{term}</Chip>
          </li>
        ))}
      </ul>

      <p className="mt-7 text-caption leading-relaxed text-muted">
        Or browse{' '}
        <Link href="/discover" className={INLINE_LINK}>
          Discover
        </Link>
        , open the{' '}
        <Link href="/map" className={INLINE_LINK}>
          map
        </Link>{' '}
        or read the{' '}
        <Link href="/locations" className={INLINE_LINK}>
          location index
        </Link>
        .
      </p>
    </section>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = readQuery(params.q);
  const outcome = query === '' ? null : await runSearch(query);

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>Search</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">
          Find a place, a frame, a{' '}
          <em className="font-serif font-normal italic">photographer.</em>
        </h1>
      </header>

      {/* Remounted per query so the field always shows what the URL says. */}
      <SearchForm key={`q:${query}`} initialQuery={query} className="mt-7" />

      <p className="mt-4 max-w-2xl text-caption leading-relaxed text-muted-soft">
        Search matches place names, cities and countries, and photographer names and usernames — not
        photograph titles, and never the content of the photographs themselves.
      </p>

      {outcome ? (
        <SearchResults
          query={query}
          photographs={outcome.photographs}
          places={outcome.places}
          people={outcome.people}
        />
      ) : (
        <SearchPrompt />
      )}
    </div>
  );
}
