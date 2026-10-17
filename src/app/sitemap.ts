import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/config';
import {
  getLocationSlugs,
  getPhotographSlugs,
  getPhotographerUsernames,
  getPublicCollectionSlugs,
} from '@/lib/data/repository';

import { LEGAL_DOCUMENTS, LEGAL_LAST_REVIEWED } from './legal/policy';

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
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const [photographs, locations, photographers, collections] = await Promise.all([
    getPhotographSlugs(),
    getLocationSlugs(),
    getPhotographerUsernames(),
    getPublicCollectionSlugs(),
  ]);

  const landing: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/discover`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/map`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/locations`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/collections`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/community`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const legal: MetadataRoute.Sitemap = LEGAL_DOCUMENTS.map((policy) => ({
    url: `${base}/legal/${policy.slug}`,
    lastModified: LEGAL_LAST_REVIEWED,
    changeFrequency: 'yearly',
    priority: 0.2,
  }));

  // A published photograph is the thing people link to, and it changes rarely
  // once it is out: its own page is the highest-value URL on the site, and the
  // least volatile.
  const photographEntries: MetadataRoute.Sitemap = photographs.map((slug) => ({
    url: `${base}/photographs/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const locationEntries: MetadataRoute.Sitemap = locations.map((slug) => ({
    url: `${base}/locations/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const photographerEntries: MetadataRoute.Sitemap = photographers.map((username) => ({
    url: `${base}/photographers/${username}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const collectionEntries: MetadataRoute.Sitemap = collections.map((slug) => ({
    url: `${base}/collections/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [
    ...landing,
    ...photographEntries,
    ...locationEntries,
    ...photographerEntries,
    ...collectionEntries,
    ...legal,
  ];
}
