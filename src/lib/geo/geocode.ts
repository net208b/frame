import { SITE, siteUrl } from '@/lib/config';

/**
 * Turning a point into the name of a place, and a name into a point.
 *
 * WHY IT EXISTS. Proposing a new place used to mean typing a place name, a
 * city, a country, **and the two-letter ISO country code** — four fields, one of
 * which asks a photographer to know that Thailand is `TH`. The pin picker
 * removed the coordinate; this removes the other three. A member drops a pin and
 * the city, country and code fill themselves in; or they type "Wat Arun", press
 * Enter, and the pin goes there with the rest filled in behind it.
 *
 * WHAT IT IS AND IS NOT. A suggestion, into fields the member can still edit,
 * on a proposal a moderator still reads. It is not a source of truth about where
 * anything is: the coordinate is still the member's, the place name is still
 * theirs to choose ("what a photographer would call it, not a postal address"),
 * and the existing checks still run on the result.
 *
 * TWO SERVICES, FOR ONE REASON EACH.
 *
 *  - **Nominatim** answers the point → name direction. It is OpenStreetMap's own
 *    geocoder: no account, no key, and the same ODbL data as the basemap, so the
 *    OpenStreetMap credit already under every FRAME map covers storing the city
 *    and country it returns.
 *  - **Photon** answers the name → point direction. Nominatim's usage policy
 *    forbids autocomplete outright, and Photon exists for exactly that job.
 *
 * Neither is metered, which is why they were chosen over a provider with a free
 * tier: a metered autocomplete is a quota that empties one keystroke at a time,
 * and the public reports of people losing a day's free credits in minutes are
 * all autocomplete. Nothing here fires per keystroke anyway — the search runs
 * when the member asks for it — but a service with no counter cannot be drained
 * by a bug either.
 *
 * WHAT THEY ASK IN RETURN. Nominatim's policy is an absolute maximum of one
 * request per second, a `User-Agent` that identifies the application, and
 * caching on the caller's side. All three are honoured here: the calls go
 * through FRAME's own server rather than from the browser (so there is one
 * identifiable caller instead of one per reader), every response is cached for a
 * day, and the routes that use this are rate limited per member. A browser
 * calling these services directly would be a different, anonymous caller every
 * time, which is how a community service gets its address blocked.
 *
 * SERVER ONLY. Nothing here is imported by a client component; the two routes
 * under `src/app/api/places/` are the whole public surface.
 */

/** Nominatim asks every caller to identify itself, and means it. */
function userAgent(): string {
  return `${SITE.name} (${siteUrl()})`;
}

/**
 * How long each service gets, and they are not the same number because the two
 * services are not the same speed and the two calls are not watched the same
 * way.
 *
 * Measured, not guessed: Nominatim answers a reverse lookup in 0.3–0.7 s, while
 * Photon takes 4.7–5.3 s for a search. A single 4-second budget was the first
 * attempt and it failed every search while passing every reverse lookup —
 * silently, because a failed lookup is indistinguishable from one that found
 * nothing. If Photon gets quicker, this can come down; if it gets slower, a
 * search will fail before a member gives up on it, which is the right way round.
 *
 * The reverse lookup keeps the short budget deliberately. Nobody asked for it —
 * it fires when a pin settles — so it has to be over before it is noticed, and
 * failing quietly costs nothing but an empty field the member can fill in.
 */
const REVERSE_TIMEOUT_MS = 5_000;
const SEARCH_TIMEOUT_MS = 12_000;

/** A day. The name of the city at a coordinate does not change faster than that. */
const CACHE_SECONDS = 86_400;

/**
 * Three decimals, about 110 metres, as the cache key.
 *
 * The URL *is* the cache key for Next's data cache, so rounding here is what
 * makes two members pinning the same street corner cost one request instead of
 * two. It is only the lookup that is rounded — the coordinate the member is
 * proposing keeps all four of its decimals.
 */
function cacheableCoordinate(value: number): string {
  return value.toFixed(3);
}

export interface PlaceGuess {
  city: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, uppercase, as the rest of the form expects it. */
  countryCode: string | null;
}

export interface PlaceMatch extends PlaceGuess {
  /** The provider's name for it. A starting point for the member's own. */
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * The reader's language, for place names. A Thai reader asking about Bangkok
 * should be offered กรุงเทพมหานคร, not Bangkok — the same reasoning as the
 * basemap's two label sets.
 */
type Language = 'en' | 'th';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

/**
 * What counts as "the city".
 *
 * OpenStreetMap does not have one field for it, because the world does not have
 * one idea of it: a frame made in a village in Gotland and one made in Bangkok
 * both need an answer, and they arrive under different keys. The order is from
 * the most specific thing a photographer would name to the least, and `state` is
 * last because naming a province as the city is wrong everywhere except the
 * handful of places that are both.
 */
function cityFrom(address: NominatimAddress | undefined): string | null {
  if (!address) return null;
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.suburb ??
    address.county ??
    address.state ??
    null
  );
}

async function readJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': userAgent(), accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch (error) {
    // Logged rather than swallowed: a lookup that fails looks exactly like one
    // that found nothing, so without this a service that has started timing out
    // on every call is invisible until somebody wonders why the city never
    // fills itself in any more.
    console.warn('Geocoder did not answer', url, error);
    // A timeout, a network error, or a service having a bad day. The caller
    // treats every one of them the same way: no suggestion, and the member
    // types. Nothing about the upload depends on this working.
    return null;
  }
}

/** The point → name direction, through Nominatim. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  language: Language = 'en',
): Promise<PlaceGuess | null> {
  const url =
    'https://nominatim.openstreetmap.org/reverse' +
    `?format=jsonv2&zoom=14&addressdetails=1` +
    `&lat=${cacheableCoordinate(latitude)}&lon=${cacheableCoordinate(longitude)}` +
    `&accept-language=${language}`;

  const payload = await readJson(url, REVERSE_TIMEOUT_MS);
  if (!payload || typeof payload !== 'object') return null;

  const address = (payload as { address?: NominatimAddress }).address;
  const code = address?.country_code?.trim().toUpperCase() || null;

  const guess: PlaceGuess = {
    city: cityFrom(address),
    country: address?.country?.trim() || null,
    countryCode: code && code.length === 2 ? code : null,
  };

  // An answer with nothing in it is not an answer. Returning null rather than a
  // row of empty strings lets the caller leave the fields alone.
  if (!guess.city && !guess.country && !guess.countryCode) return null;
  return guess;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_value?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

/** How many matches a member is offered. More than this is a list, not a choice. */
const MATCH_LIMIT = 5;

/** The name → point direction, through Photon. */
export async function searchPlaces(
  query: string,
  language: Language = 'en',
): Promise<PlaceMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url =
    'https://photon.komoot.io/api/' +
    `?q=${encodeURIComponent(trimmed)}&limit=${MATCH_LIMIT}` +
    // Photon speaks a handful of languages and falls back to the local name for
    // the rest. Thai is not among them, so a Thai reader gets the name as it is
    // written on the ground, which is Thai in Thailand and right everywhere else.
    `&lang=${language === 'th' ? 'default' : language}`;

  const payload = await readJson(url, SEARCH_TIMEOUT_MS);
  const features = (payload as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];

  const matches: PlaceMatch[] = [];
  for (const feature of features) {
    const name = feature.properties?.name?.trim();
    const coordinates = feature.geometry?.coordinates;
    if (!name || !Array.isArray(coordinates)) continue;

    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;

    const code = feature.properties?.countrycode?.trim().toUpperCase() || null;

    matches.push({
      name,
      city:
        feature.properties?.city ??
        feature.properties?.district ??
        feature.properties?.county ??
        feature.properties?.state ??
        null,
      country: feature.properties?.country?.trim() || null,
      countryCode: code && code.length === 2 ? code : null,
      latitude,
      longitude,
    });
  }

  return matches;
}
