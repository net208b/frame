import type { PhotographDetail } from '@/types/domain';

/**
 * Filtering one member's frames by the gear they were shot on.
 *
 * Everything here works on the portfolio the profile page has already loaded:
 * the facets are counted from the published photographs' own EXIF, the key in
 * `?gear=` is matched against those facets, and the filter is a plain array
 * filter. No query, no table, no new column. That is what makes this the first
 * phase of the gear locker rather than the last.
 *
 * WHY THE KEY IS DERIVED, NOT STORED. `camera-sony-a7-iv` is built from the
 * brand and model exactly as the EXIF spells them, so the same camera always
 * gets the same key and a link somebody pasted keeps working. It is also why a
 * key is only ever honoured when it names a facet that has frames behind it:
 * a key that matches nothing is treated as no filter at all, never as an
 * empty gallery.
 */

export type GearKind = 'camera' | 'lens';

export interface GearFacet {
  /** The value that goes in `?gear=`, e.g. `camera-sony-a7-iv`. */
  key: string;
  kind: GearKind;
  brand: string;
  model: string | null;
  /** "Sony A7 IV", or just "Sony" when EXIF carried no model. */
  label: string;
  count: number;
}

/** The longest value `?gear=` is read at; anything past it is cut, not refused. */
export const MAX_GEAR_KEY_LENGTH = 96;

/** Lower-case, ASCII-ish slug: "Sony A7 IV" → "sony-a7-iv". */
export function gearSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function facetKey(kind: GearKind, brand: string, model: string | null): string {
  const body = gearSlug(model ? `${brand} ${model}` : brand);
  return `${kind}-${body}`;
}

/**
 * Every camera and lens that appears in the portfolio, with how many frames
 * each one has. Most-used first, then by name, so the chips read as a ranking
 * and not as the order the EXIF happened to come in.
 */
export function gearFacets(photographs: readonly PhotographDetail[]): GearFacet[] {
  const byKey = new Map<string, GearFacet>();

  const add = (kind: GearKind, brandRaw: string | null, modelRaw: string | null) => {
    const brand = brandRaw?.trim();
    if (!brand) return;
    const model = modelRaw?.trim() || null;
    const key = facetKey(kind, brand, model);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    byKey.set(key, {
      key,
      kind,
      brand,
      model,
      label: model ? `${brand} ${model}` : brand,
      count: 1,
    });
  };

  for (const photograph of photographs) {
    add('camera', photograph.capture.cameraBrand, photograph.capture.cameraModel);
    add('lens', photograph.capture.lensBrand, photograph.capture.lensModel);
  }

  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/** `?gear=` as typed, or null; the caller still checks it names a real facet. */
export function readGearKey(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const trimmed = first.trim().slice(0, MAX_GEAR_KEY_LENGTH);
  // Only a key this module could have produced is worth looking up.
  return /^(camera|lens)-[a-z0-9-]+$/.test(trimmed) ? trimmed : null;
}

/** The facet a key names, or null — which the page reads as "no filter". */
export function activeGearFacet(
  facets: readonly GearFacet[],
  key: string | null,
): GearFacet | null {
  if (!key) return null;
  return facets.find((facet) => facet.key === key) ?? null;
}

/** The frames shot on one facet's gear, in the portfolio's own order. */
export function filterByGear(
  photographs: readonly PhotographDetail[],
  facet: GearFacet,
): PhotographDetail[] {
  return photographs.filter((photograph) => {
    const brand =
      facet.kind === 'camera' ? photograph.capture.cameraBrand : photograph.capture.lensBrand;
    const model =
      facet.kind === 'camera' ? photograph.capture.cameraModel : photograph.capture.lensModel;
    return facetKey(facet.kind, brand?.trim() ?? '', model?.trim() || null) === facet.key;
  });
}

/**
 * The profile address with (or without) a gear filter. The default view is the
 * bare address, as `ProfileTabs` already insists; a filter is only ever on the
 * frames view, so no `view=` travels with it.
 */
export function buildProfileGearHref(username: string, key: string | null): string {
  const base = `/photographers/${username}`;
  return key ? `${base}?gear=${encodeURIComponent(key)}` : base;
}

/**
 * The facet a member-written gear line refers to, if any. "Ricoh GR IIIx" and
 * "ricoh gr iiix (street)" both resolve to the `camera-ricoh-gr-iiix` facet;
 * a line whose camera has no frames on the profile resolves to nothing, so it
 * stays plain text rather than linking to an empty gallery. Model-level only:
 * a bare brand could name several bodies, and guessing one would be wrong
 * half the time.
 */
export function facetForGearLine(
  line: string,
  facets: readonly GearFacet[],
): GearFacet | null {
  const needle = gearSlug(line);
  if (!needle) return null;
  let best: GearFacet | null = null;
  for (const facet of facets) {
    if (!facet.model) continue;
    const body = gearSlug(facet.label);
    // The facet has to appear in the line on slug boundaries, so "gr-iii"
    // does not claim a line about the "gr-iiix".
    const at = needle.indexOf(body);
    if (at === -1) continue;
    const before = at === 0 ? '' : needle.charAt(at - 1);
    const after = needle.charAt(at + body.length);
    if ((before && before !== '-') || (after && after !== '-')) continue;
    if (!best || body.length > gearSlug(best.label).length) best = facet;
  }
  return best;
}
