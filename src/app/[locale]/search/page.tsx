import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { SearchForm } from '@/components/search/SearchForm';
import { SearchResults, type SearchGroup } from '@/components/search/SearchResults';
import { Chip } from '@/components/ui/Chip';
import { Eyebrow } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
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
 * yet, because no repository function can match one. That sentence is one whole
 * message in each language, because what it promises is the honest scope of the
 * feature and a half-translated version of it would overstate what search does.
 */

/** A search results page has nothing a crawler should index. */
export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);

  // `generateMetadata` runs outside the render that calls `setRequestLocale`,
  // so the locale is passed explicitly rather than read from the request.
  const t = await getTranslations({ locale, namespace: 'search' });

  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/search',
    locale,
    noIndex: true,
  });
}

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
 *
 * These are query strings, not copy, so they are not translated. The place
 * names in the dataset are written in English, and a chip reading โตเกียว would
 * run a search for โตเกียว and come back with nothing — a control that looks
 * real and does nothing. Translating the labels while keeping the queries
 * English would be worse again: the results page echoes the query it ran, so
 * the chip and the heading above the results would disagree.
 */
const SUGGESTED_SEARCHES = ['Tokyo', 'New York', 'Paris', 'Kyoto', 'London', 'Amsterdam'] as const;

const INLINE_LINK =
  'font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink';

/**
 * The serif italic accent word inside the display headline, which is a
 * Latin-only device — see the long note on the same decision in
 * `src/app/[locale]/collections/page.tsx`. Instrument Serif has no Thai glyphs,
 * so `font-serif` on Thai falls through the stack and `italic` is then
 * synthesised, which shears the vowel and tone marks away from the base glyph.
 * Thai takes its accent from weight instead.
 */
function accentClass(locale: Locale): string {
  return locale === 'th' ? 'font-normal not-italic' : 'font-serif font-normal italic';
}

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

async function SearchPrompt({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'search' });

  return (
    <section aria-labelledby="search-prompt" className="mt-12 max-w-2xl">
      <h2 id="search-prompt" className="text-title font-bold">
        {t('prompt.heading')}
      </h2>
      <p className="mt-2.5 text-caption leading-relaxed text-muted">{t('prompt.body')}</p>

      <ul aria-label={t('prompt.suggestionsLabel')} className="mt-5 flex flex-wrap gap-2">
        {SUGGESTED_SEARCHES.map((term) => (
          <li key={term}>
            {/* `lang` on the chip, because these six are English place names on
                a page that may be in Thai: it keeps a screen reader from
                pronouncing them with Thai phonology. */}
            <Chip href={`/search?q=${encodeURIComponent(term)}`}>
              <span lang="en">{term}</span>
            </Chip>
          </li>
        ))}
      </ul>

      {/* One sentence, one message. The three destinations are tags inside it,
          so each language decides where they fall and Thai does not have to
          splice a link into a phrase that needs no space around it. */}
      <p className="mt-7 text-caption leading-relaxed text-muted">
        {t.rich('prompt.elsewhere', {
          discover: (chunks) => (
            <Link href="/discover" className={INLINE_LINK}>
              {chunks}
            </Link>
          ),
          map: (chunks) => (
            <Link href="/map" className={INLINE_LINK}>
              {chunks}
            </Link>
          ),
          locations: (chunks) => (
            <Link href="/locations" className={INLINE_LINK}>
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: SearchParams;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'search' });

  const query = readQuery(resolved.q);
  const outcome = query === '' ? null : await runSearch(query);

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">
          {t.rich('heading', {
            accent: (chunks) => <em className={accentClass(locale)}>{chunks}</em>,
          })}
        </h1>
      </header>

      {/* Remounted per query so the field always shows what the URL says. */}
      <SearchForm key={`q:${query}`} initialQuery={query} className="mt-7" />

      <p className="mt-4 max-w-2xl text-caption leading-relaxed text-muted-soft">{t('scope')}</p>

      {outcome ? (
        <SearchResults
          query={query}
          locale={locale}
          photographs={outcome.photographs}
          places={outcome.places}
          people={outcome.people}
        />
      ) : (
        <SearchPrompt locale={locale} />
      )}
    </div>
  );
}
