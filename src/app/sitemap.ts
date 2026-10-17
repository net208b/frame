import type { MetadataRoute } from 'next';

import { DEFAULT_LOCALE, LOCALES, withLocalePrefix } from '@/i18n/locales';
import { siteUrl } from '@/lib/config';
import {
  getLocationSlugs,
  getPhotographSlugs,
  getPhotographerUsernames,
  getPublicCollectionSlugs,
} from '@/lib/data/repository';

import { LEGAL_DOCUMENTS, LEGAL_LAST_REVIEWED } from './[locale]/legal/policy';

/**
 * The sitemap.
 *
 * Every entry comes from the read API, which means every entry has already been
 * through the same published-and-approved filters the public pages use:
 * `getPhotographSlugs` returns published photographs, `getLocationSlugs`
 * returns approved locations, and `getPublicCollectionSlugs` returns public
 * collections. Nothing here is assembled from a raw table.
 *
 * That matters because of how this file fails. A draft, an unpublished
 * photograph, a pending location or a private collection appearing in this list
 * would not be a ranking mistake — it would be a privacy breach, published in
 * a machine-readable file designed to be crawled. If this ever needs a new
 * source of URLs, the new source has to filter at the repository, not here.
 *
 * Deliberately absent for the same reason: `/search`, which has nothing stable
 * to index, and `/upload`, `/moderation`, `/login`, `/join`, the password-reset
 * pages and every `/auth` route, none of which a crawler should be walking.
 *
 * `lastModified` is set only where the data actually carries a date. The slug
 * lists do not, so photographs, places, profiles and collections are published
 * without one rather than with today's date — a fabricated timestamp tells a
 * crawler that everything changed at once, which is worse than saying nothing.
 *
 * Every page is listed once per language, and each listing carries the
 * `hreflang` alternates for both. The whole set is what tells a crawler that
 * `/en/photographs/x` and `/th/photographs/x` are one photograph in two
 * languages; listing only one of them, or listing both without the alternates,
 * would publish them as rival duplicates. The sitemap itself stays at
 * `/sitemap.xml`, outside the `[locale]` segment, because there is one sitemap
 * for the site rather than one per language.
 *
 * Two languages double the number of URLs in this file, which doubles the cost
 * of getting the filtering wrong — so the filtering is not repeated here. Every
 * entry is still derived from exactly the four repository functions above and
 * the two static lists below, and `expand` only ever adds a prefix to a path
 * that one of them produced. It cannot turn a private URL into a public one,
 * and it cannot invent a path. Anything new belongs in one of those sources,
 * filtered there.
 */

/** A page, written the way the app writes it: without a locale. */
interface LocaleFreeEntry {
  path: string;
  lastModified?: string | Date;
  changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority?: number;
}

/**
 * The `hreflang` set for one page: both languages plus `x-default`.
 *
 * This mirrors `alternateLanguages` in `lib/seo.ts`, which builds the same set
 * for the `<link rel="alternate">` tags on the page itself, and it mirrors it
 * on purpose: Google treats a sitemap's alternates and a page's own as two
 * statements about the same thing, and a page whose two statements disagree is
 * a page whose alternates it may discard entirely. `x-default` points at
 * English, which is the routing decision — a visitor with no language
 * preference lands on `/en`.
 */
function alternateLanguages(base: string, path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = `${base}${withLocalePrefix(path, locale)}`;
  languages['x-default'] = `${base}${withLocalePrefix(path, DEFAULT_LOCALE)}`;
  return languages;
}

function expand(base: string, entries: readonly LocaleFreeEntry[]): MetadataRoute.Sitemap {
  return entries.flatMap(({ path, ...rest }) => {
    const languages = alternateLanguages(base, path);

    return LOCALES.map((locale) => ({
      ...rest,
      url: `${base}${withLocalePrefix(path, locale)}`,
      alternates: { languages },
    }));
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [photographs, locations, photographers, collections] = await Promise.all([
    getPhotographSlugs(),
    getLocationSlugs(),
    getPhotographerUsernames(),
    getPublicCollectionSlugs(),
  ]);

  const landing: LocaleFreeEntry[] = [
    { path: '/', changeFrequency: 'daily', priority: 1 },
    { path: '/discover', changeFrequency: 'daily', priority: 0.9 },
    { path: '/map', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/locations', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/collections', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/community', changeFrequency: 'monthly', priority: 0.5 },
  ];

  const legal: LocaleFreeEntry[] = LEGAL_DOCUMENTS.map((policy) => ({
    path: `/legal/${policy.slug}`,
    lastModified: LEGAL_LAST_REVIEWED,
    changeFrequency: 'yearly',
    priority: 0.2,
  }));

  // A published photograph is the thing people link to, and it changes rarely
  // once it is out: its own page is the highest-value URL on the site, and the
  // least volatile.
  const photographEntries: LocaleFreeEntry[] = photographs.map((slug) => ({
    path: `/photographs/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const locationEntries: LocaleFreeEntry[] = locations.map((slug) => ({
    path: `/locations/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const photographerEntries: LocaleFreeEntry[] = photographers.map((username) => ({
    path: `/photographers/${username}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const collectionEntries: LocaleFreeEntry[] = collections.map((slug) => ({
    path: `/collections/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return expand(base, [
    ...landing,
    ...photographEntries,
    ...locationEntries,
    ...photographerEntries,
    ...collectionEntries,
    ...legal,
  ]);
}
