/**
 * How precise a coordinate actually is, as a figure and a unit rather than as a
 * finished English phrase.
 *
 * `precisionLabel` in `src/lib/geo.ts` does this arithmetic and returns
 * "about 1.1 km". That string cannot be dropped into a Thai sentence: the word
 * order differs, "about" belongs to the host sentence rather than to the
 * measurement, and `กม.` is not `km`. `geo.ts` is imported by nine components
 * across five features and has no request to read a locale from, so the maths
 * is mirrored here instead of being changed there, and the map's sentences
 * state the measurement through the `map.precision` message.
 *
 * THE TWO MUST STAY IN STEP. The constant and both thresholds below are copied
 * from `precisionLabel`; a change to one is a change to both. Collapsing them
 * into a single locale-aware helper in `geo.ts` is the follow-up.
 */

/** Metres per degree of latitude, as `lib/geo.ts` has it. */
const METRES_PER_DEGREE = 111_320;

/**
 * A `type` rather than an `interface` deliberately: it is handed straight to
 * next-intl as the message's values, and only a type alias of an object type
 * gets the implicit index signature that `TranslationValues`
 * (`Record<string, string | number | Date>`) requires. An interface would have
 * to be spread at every call site.
 */
export type PrecisionParts = {
  /** Chooses the branch of the `map.precision` message. */
  unit: 'km' | 'm';
  /** Already rounded the way `precisionLabel` rounds it. */
  value: number;
};

export function precisionParts(decimals: number): PrecisionParts {
  const metres = METRES_PER_DEGREE / 10 ** decimals;
  if (metres >= 1000) return { unit: 'km', value: Math.round(metres / 100) / 10 };
  return { unit: 'm', value: Math.round(metres) };
}
