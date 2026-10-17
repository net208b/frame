import { LOCATION_POLICY } from '@/lib/config';
import type { Coordinates, SubmissionSignal } from '@/types/domain';

/**
 * Geographic helpers, plus the coordinate-privacy policy.
 *
 * Two rules drive this file:
 *
 * 1. A coordinate is a privacy decision, not just a number. Publishing the
 *    exact position of someone's doorway, a shelter, or a place of worship
 *    under surveillance can cause real harm, so sensitive places are published
 *    at reduced precision or not at all.
 * 2. Reverse geocoding proves nothing. A provider returning "Kyoto" for a pair
 *    of coordinates says the point falls inside a polygon labelled Kyoto. It
 *    does not confirm the place exists, that it is accessible, or that the
 *    photograph was taken there. Every check here produces a *signal* for a
 *    human moderator, never an automatic approval.
 */

const EARTH_RADIUS_METRES = 6_371_008.8;

/** Great-circle distance in metres. */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Null Island and exact-integer pairs are almost always placeholder data. */
export function looksLikePlaceholder(latitude: number, longitude: number): boolean {
  if (latitude === 0 && longitude === 0) return true;
  return Number.isInteger(latitude) && Number.isInteger(longitude);
}

/** Truncate toward fewer decimals, which widens the area rather than moving it. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Apply the publication policy to a stored coordinate.
 *
 * `isSensitive` is a moderator-set flag on the location row. When it is set we
 * either coarsen the point to roughly a kilometre or withhold it entirely.
 */
export function publishableCoordinates(
  latitude: number,
  longitude: number,
  options: { isSensitive?: boolean; withhold?: boolean } = {},
): Coordinates | null {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  if (options.withhold) return null;

  const decimals = options.isSensitive
    ? LOCATION_POLICY.reducedCoordinateDecimals
    : LOCATION_POLICY.publicCoordinateDecimals;

  return {
    latitude: roundTo(latitude, decimals),
    longitude: roundTo(longitude, decimals),
    precisionDecimals: decimals,
    isApproximate: Boolean(options.isSensitive),
  };
}

/** Approximate ground resolution of a given decimal precision, for the UI. */
export function precisionLabel(decimals: number): string {
  const metres = 111_320 / 10 ** decimals;
  if (metres >= 1000) return `about ${Math.round(metres / 100) / 10} km`;
  return `about ${Math.round(metres)} m`;
}

/* ------------------------------------------------------------------------ */
/* Country bounding boxes — a cheap sanity check, not a verification         */
/* ------------------------------------------------------------------------ */

/**
 * Rough [west, south, east, north] boxes for the countries present in the
 * seeded demo data. A point outside its country's box is certainly wrong; a
 * point inside it is merely *not obviously* wrong. Expanding this table is a
 * known follow-up; see docs/LIMITATIONS.md.
 */
const COUNTRY_BOXES: Record<string, [number, number, number, number]> = {
  JP: [122.9, 24.0, 153.99, 45.56],
  TH: [97.34, 5.61, 105.64, 20.47],
  DK: [8.07, 54.55, 15.2, 57.75],
  US: [-125.0, 24.4, -66.93, 49.39],
  GB: [-8.65, 49.86, 1.77, 60.86],
  FR: [-5.14, 41.33, 9.56, 51.09],
  DE: [5.86, 47.27, 15.04, 55.1],
  IT: [6.63, 35.49, 18.52, 47.09],
  ES: [-9.3, 35.95, 3.32, 43.79],
  PT: [-9.53, 36.96, -6.19, 42.15],
  NL: [3.36, 50.75, 7.23, 53.56],
  KR: [125.07, 33.11, 129.58, 38.61],
  TW: [119.53, 21.9, 122.0, 25.3],
  HK: [113.83, 22.15, 114.44, 22.56],
  SG: [103.6, 1.16, 104.09, 1.47],
  VN: [102.14, 8.18, 109.46, 23.39],
  IN: [68.17, 6.75, 97.4, 35.5],
  MX: [-118.4, 14.53, -86.71, 32.72],
  BR: [-73.99, -33.75, -34.79, 5.27],
  AR: [-73.58, -55.06, -53.64, -21.78],
  AU: [112.92, -43.74, 153.64, -10.06],
  NZ: [166.51, -47.29, 178.52, -34.39],
  CA: [-141.0, 41.68, -52.62, 83.11],
  MA: [-13.17, 27.66, -0.99, 35.93],
  ZA: [16.46, -34.83, 32.89, -22.13],
  EG: [24.7, 22.0, 36.9, 31.67],
  TR: [25.67, 35.82, 44.82, 42.11],
  GR: [19.37, 34.8, 29.65, 41.75],
  CZ: [12.09, 48.55, 18.86, 51.06],
  PL: [14.12, 49.0, 24.15, 54.84],
  SE: [11.11, 55.34, 24.15, 69.06],
  NO: [4.65, 57.98, 31.29, 71.19],
  FI: [20.55, 59.81, 31.58, 70.09],
  CH: [5.96, 45.82, 10.49, 47.81],
  AT: [9.53, 46.37, 17.16, 49.02],
  BE: [2.51, 49.5, 6.4, 51.5],
  IE: [-10.48, 51.42, -5.99, 55.39],
  IS: [-24.55, 63.39, -13.5, 66.57],
  AE: [51.58, 22.63, 56.4, 26.08],
  ID: [95.29, -11.01, 141.03, 6.08],
  MY: [99.64, 0.85, 119.27, 7.36],
  PH: [116.93, 4.64, 126.6, 21.12],
  CN: [73.56, 18.16, 134.77, 53.56],
  CL: [-75.64, -55.98, -66.42, -17.51],
  PE: [-81.33, -18.35, -68.67, -0.04],
  CO: [-79.0, -4.23, -66.87, 12.44],
};

export function countryBoxFor(countryCode: string): [number, number, number, number] | null {
  return COUNTRY_BOXES[countryCode.toUpperCase()] ?? null;
}

/**
 * Run the automated checks for a proposed location.
 *
 * Returns signals only. Approval always requires a moderator, because none of
 * these checks can establish that a place exists or is safe to publish.
 */
export function evaluateLocationSubmission(input: {
  latitude: number;
  longitude: number;
  countryCode: string;
  existingNearby?: Array<{ id: string; label: string; latitude: number; longitude: number }>;
}): SubmissionSignal[] {
  const signals: SubmissionSignal[] = [];
  const { latitude, longitude, countryCode } = input;

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    signals.push({
      kind: 'coordinate-out-of-range',
      severity: 'high',
      message: 'Coordinates fall outside the valid latitude/longitude range.',
    });
    return signals;
  }

  if (looksLikePlaceholder(latitude, longitude)) {
    signals.push({
      kind: 'low-precision',
      severity: 'warn',
      message:
        'Coordinates look like placeholder values (whole degrees or 0,0). Ask for a precise point.',
    });
  }

  const box = countryBoxFor(countryCode);
  if (box) {
    const [west, south, east, north] = box;
    const inside =
      longitude >= west && longitude <= east && latitude >= south && latitude <= north;
    if (!inside) {
      signals.push({
        kind: 'coordinate-country-mismatch',
        severity: 'high',
        message: `The point does not fall within the bounding box of ${countryCode.toUpperCase()}.`,
      });
    }
  } else {
    signals.push({
      kind: 'coordinate-country-mismatch',
      severity: 'info',
      message: `No bounding box on file for ${countryCode.toUpperCase()}, so the country could not be cross-checked.`,
    });
  }

  for (const candidate of input.existingNearby ?? []) {
    const metres = distanceMetres({ latitude, longitude }, candidate);
    if (metres <= LOCATION_POLICY.duplicateRadiusMetres) {
      signals.push({
        kind: 'possible-duplicate',
        severity: 'warn',
        message: `Within ${Math.round(metres)} m of an existing location.`,
        relatedId: candidate.id,
        relatedLabel: candidate.label,
        distanceMetres: Math.round(metres),
      });
    }
  }

  return signals;
}

/** A square bounding box around a point, for "nearby" queries without PostGIS. */
export function boundingBoxAround(
  latitude: number,
  longitude: number,
  radiusMetres: number,
): { west: number; south: number; east: number; north: number } {
  const latDelta = (radiusMetres / EARTH_RADIUS_METRES) * (180 / Math.PI);
  const lonDelta = latDelta / Math.max(0.01, Math.cos((latitude * Math.PI) / 180));
  return {
    west: longitude - lonDelta,
    south: latitude - latDelta,
    east: longitude + lonDelta,
    north: latitude + latDelta,
  };
}
