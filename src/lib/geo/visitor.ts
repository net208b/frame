import { headers } from 'next/headers';

/**
 * Roughly where the person reading this page is, so FRAME can open on their own
 * city instead of on the middle of the Atlantic.
 *
 * WHERE IT COMES FROM. Vercel resolves the request's IP address at the edge and
 * forwards the answer as request headers, so this is a read of headers that are
 * already on the request — no IP lookup service, no third-party call, no
 * `navigator.geolocation` prompt, and nothing asked of the reader. The IP
 * address itself is never read here and never stored; what this returns is a
 * city and a point somewhere inside it.
 *
 * HOW ACCURATE IT IS. City-level at best, and routinely wrong: a mobile
 * carrier's exit node can sit in another province, a VPN puts the reader
 * wherever its server is, and a corporate network often resolves to its
 * headquarters. So this decides *where a map opens*, which is a courtesy that
 * costs nothing when it is wrong — and never anything else. It must not be used
 * to decide what somebody may see or do, to pre-fill a form that attributes a
 * photograph to a place, or to suggest FRAME knows where anyone is.
 *
 * WHAT HAPPENS WITHOUT IT. Local development, a self-hosted deployment, a
 * reader behind an IP the edge cannot place, and most crawlers all arrive with
 * no geolocation at all. That is the `world` case: the map opens on the world
 * view, which is what it did before this existed, and the interface says so
 * rather than naming a city it is guessing at.
 */

/** Vercel's geolocation headers. Names are the platform's, not ours. */
const HEADER = {
  city: 'x-vercel-ip-city',
  countryCode: 'x-vercel-ip-country',
  region: 'x-vercel-ip-country-region',
  latitude: 'x-vercel-ip-latitude',
  longitude: 'x-vercel-ip-longitude',
} as const;

/**
 * The zoom a city opens at: close enough that the street grid and the water
 * read as *this* place, wide enough to hold a metropolitan area.
 *
 * The headers carry a point, never an extent, so a city's real boundary is not
 * available to fit to — Bangkok and Reykjavík therefore open at the same scale
 * even though one is forty times the other. A geocoder would answer this
 * properly and is the obvious follow-up; it is not worth a third-party
 * dependency and a per-request lookup for the opening camera of a map.
 */
export const CITY_ZOOM = 11.2;

export interface VisitorPlace {
  /** The city as the edge spelled it, already percent-decoded. */
  city: string | null;
  /** A state, province or region code — "Bangkok", "CA". Rarely useful alone. */
  region: string | null;
  /** ISO 3166-1 alpha-2, uppercase. */
  countryCode: string | null;
  /** A point inside the city, or the world view's centre when there is none. */
  centre: [longitude: number, latitude: number];
  zoom: number;
  /**
   * `city` when the edge placed the reader and the interface may name it,
   * `country` when it knows only the country, `world` when it knows nothing.
   * Copy keys off this rather than off `city` being null, so a reader the edge
   * placed in a country but not a city is not told they are nowhere.
   */
  precision: 'city' | 'country' | 'world';
}

/** Where the map has always opened when there is nothing better: the whole world. */
const WORLD: VisitorPlace = {
  city: null,
  region: null,
  countryCode: null,
  centre: [8, 26],
  zoom: 1.3,
  precision: 'world',
};

/**
 * `x-vercel-ip-city` is percent-encoded, because a header may not carry
 * anything outside Latin-1 and city names are full of everything else. A value
 * that is not valid encoding comes back as-is rather than throwing: a city name
 * is decoration here, and no header is worth a 500.
 */
function decodeCity(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return value.trim() || null;
  }
}

function coordinate(value: string | null, limit: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
  return parsed;
}

export async function visitorPlace(): Promise<VisitorPlace> {
  const received = await headers();

  const city = decodeCity(received.get(HEADER.city));
  const countryCode = received.get(HEADER.countryCode)?.trim().toUpperCase() || null;
  const latitude = coordinate(received.get(HEADER.latitude), 90);
  const longitude = coordinate(received.get(HEADER.longitude), 180);

  // Without a point there is nothing to centre on, whatever else arrived: a
  // country code alone cannot be turned into a camera without a table of
  // centroids this does not have.
  if (latitude === null || longitude === null) return WORLD;

  // A point the interface cannot name at all is worse than no point: the map
  // would open tight on somewhere the reader is given no reason to recognise.
  // The world view at least explains itself. (The combination barely occurs —
  // the edge that knows a latitude knows a country — so this is a guard, not a
  // case worth designing for.)
  if (!city && !countryCode) return WORLD;

  return {
    city,
    region: received.get(HEADER.region)?.trim() || null,
    countryCode,
    centre: [longitude, latitude],
    zoom: CITY_ZOOM,
    // A point with no city name still opens the map in the right part of the
    // world; it just cannot be captioned with a city.
    precision: city ? 'city' : 'country',
  };
}
