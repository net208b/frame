import { geoCentroid } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import { feature as topoFeature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import numericToAlpha2 from './country-numeric-to-alpha2.json';

/**
 * The countries the home page globe draws, and how they are named and found.
 *
 * WHERE THE SHAPES COME FROM. `public/globe/countries-110m.json` is the
 * world-atlas build of Natural Earth's 1:110m countries: 177 polygons, public
 * domain, 38 KB over the wire. It is fetched when the globe mounts rather than
 * bundled, so it is cached by the browser on its own and never weighs on a page
 * that does not draw a globe.
 *
 * HOW A SHAPE GETS A COUNTRY CODE. The atlas keys each polygon by its ISO
 * 3166-1 *numeric* code and carries only an English name. FRAME's places are
 * keyed by the *alpha-2* code (`TH`, `JP`), so a 250-row table generated once
 * from the ISO list turns one into the other. Three polygons in the atlas have
 * no ISO code at all — Northern Cyprus, Somaliland and Kosovo — and so no
 * `code`: they are drawn as land like everywhere else and are simply not
 * selectable, which is the honest outcome for a territory the standard does
 * not name.
 *
 * HOW A COUNTRY IS NAMED. By `Intl.DisplayNames`, which every browser carries
 * and which knows every country in every language FRAME speaks — ไทย, ญี่ปุ่น,
 * สหรัฐอเมริกา — without a translations file to keep in step. The atlas's
 * English name is the fallback for a code the runtime cannot name.
 *
 * SEARCH matches the name in the reader's language and the English name both,
 * so a Thai reader can type either ญี่ปุ่น or Japan and land on the same place.
 */

export interface GlobeCountry {
  /** ISO 3166-1 alpha-2, or null for a territory the standard does not name. */
  code: string | null;
  /** The atlas's English name: the fallback, and the second thing search matches. */
  atlasName: string;
  feature: Feature<Geometry>;
  /** `[longitude, latitude]` of the polygon's centre, where its dot is drawn. */
  centroid: [number, number];
}

const ATLAS_URL = '/globe/countries-110m.json';

interface CountriesTopology extends Topology {
  objects: { countries: GeometryCollection };
}

let cached: Promise<GlobeCountry[]> | null = null;

/** Fetched once per page, however many times it is asked for. */
export function loadGlobeCountries(): Promise<GlobeCountry[]> {
  cached ??= fetch(ATLAS_URL, { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`the world atlas answered HTTP ${response.status}`);
      return (await response.json()) as CountriesTopology;
    })
    .then((topology) => {
      const collection = topoFeature(topology, topology.objects.countries);
      const features = 'features' in collection ? collection.features : [collection];
      const table = numericToAlpha2 as Record<string, string>;

      return features.map((entry): GlobeCountry => {
        const numeric = entry.id === undefined || entry.id === null ? null : String(entry.id);
        const centroid = geoCentroid(entry);
        return {
          code: numeric ? (table[numeric] ?? null) : null,
          atlasName: String((entry.properties as { name?: unknown } | null)?.name ?? ''),
          feature: entry,
          centroid: [centroid[0], centroid[1]],
        };
      });
    })
    .catch((error: unknown) => {
      // A failed fetch must not poison every later attempt on the page.
      cached = null;
      throw error;
    });
  return cached;
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

function namesFor(locale: string): Intl.DisplayNames | null {
  if (!displayNames.has(locale)) {
    try {
      displayNames.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
    } catch {
      displayNames.set(locale, null);
    }
  }
  return displayNames.get(locale) ?? null;
}

/** The country's name as the reader would write it, or the atlas's English one. */
export function countryName(country: Pick<GlobeCountry, 'code' | 'atlasName'>, locale: string): string {
  if (!country.code) return country.atlasName;
  try {
    return namesFor(locale)?.of(country.code) ?? country.atlasName;
  } catch {
    return country.atlasName;
  }
}

/**
 * Countries whose name — in the reader's language or in English — contains
 * what was typed. Only countries with a code: a result that cannot be chosen
 * is not a result.
 */
export function searchCountries(
  countries: readonly GlobeCountry[],
  query: string,
  locale: string,
  limit = 8,
): GlobeCountry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const starts: GlobeCountry[] = [];
  const contains: GlobeCountry[] = [];
  for (const country of countries) {
    if (!country.code) continue;
    const local = countryName(country, locale).toLowerCase();
    const english = country.atlasName.toLowerCase();
    if (local.startsWith(needle) || english.startsWith(needle)) starts.push(country);
    else if (local.includes(needle) || english.includes(needle)) contains.push(country);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** The country with this alpha-2 code, if the atlas draws it. */
export function findCountry(
  countries: readonly GlobeCountry[],
  code: string | null | undefined,
): GlobeCountry | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return countries.find((country) => country.code === upper) ?? null;
}
