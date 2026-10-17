import { z } from 'zod';

/**
 * Field primitives shared by every feature schema.
 *
 * Two reasons this is a separate module rather than part of `index.ts`: the
 * feature schemas depend on these primitives and `index.ts` re-exports the
 * feature schemas, so keeping the primitives here leaves the import graph
 * acyclic; and every message in the app that a member can trigger by filling
 * in a form is written once, here, in the same voice.
 *
 * Messages are written for somebody reading a form, not for a log line. They
 * name the field, say what is wrong and say what would be right.
 */

/** An untouched text input, an unselected select and a missing key all mean "not provided". */
function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

/**
 * Preprocessor for a field where "left out" is a legitimate answer. Exported
 * because a schema with a bespoke message still needs the same reading of a
 * blank control as every other field.
 */
export const blankToNull = (value: unknown): unknown => (isBlank(value) ? null : value);

const blankToUndefined = (value: unknown): unknown => (isBlank(value) ? undefined : value);

/** HTML sends `on` for a ticked box and nothing at all for an unticked one. */
const toFlag = (value: unknown): boolean =>
  value === true || value === 'true' || value === 'on' || value === '1';

/* ------------------------------------------------------------------------ */
/* Text                                                                      */
/* ------------------------------------------------------------------------ */

export interface TextRules {
  /** Sentence-case field name, used to build every message for this field. */
  label: string;
  min?: number;
  max: number;
}

/** Trimmed, bounded, required text. */
export function requiredText(rules: TextRules) {
  const min = rules.min ?? 1;
  return z
    .string({ error: `${rules.label} is required.` })
    .trim()
    .min(min, {
      error:
        min === 1
          ? `${rules.label} is required.`
          : `${rules.label} needs at least ${min} characters.`,
    })
    .max(rules.max, { error: `${rules.label} must be ${rules.max} characters or fewer.` });
}

/** Trimmed, bounded text where blank means "the member left it out" — never `''`. */
export function optionalText(rules: TextRules) {
  return z.preprocess(
    blankToNull,
    z
      .string({ error: `${rules.label} must be text.` })
      .trim()
      .max(rules.max, { error: `${rules.label} must be ${rules.max} characters or fewer.` })
      .nullable(),
  );
}

/**
 * A record identifier: a Supabase UUID in a configured deployment, or one of
 * the bundled demo ids. Bounded and charset-checked so an identifier can never
 * carry a path segment or a query string into a storage key or a redirect.
 */
export function identifier(label: string) {
  return z
    .string({ error: `${label} is missing.` })
    .trim()
    .min(1, { error: `${label} is missing.` })
    .max(64, { error: `${label} is not a valid reference.` })
    .regex(/^[A-Za-z0-9_-]+$/, { error: `${label} is not a valid reference.` });
}

/** The same reference, where "none chosen" is a legitimate answer. */
export function optionalIdentifier(label: string) {
  return z.preprocess(blankToNull, identifier(label).nullable());
}

/* ------------------------------------------------------------------------ */
/* Numbers                                                                   */
/* ------------------------------------------------------------------------ */

export interface NumberRules {
  label: string;
  min: number;
  max: number;
  /** Appended to the bound messages, e.g. "mm". */
  unit?: string;
}

function bound(rules: NumberRules, kind: 'min' | 'max'): string {
  const value = kind === 'min' ? rules.min : rules.max;
  const unit = rules.unit ? ` ${rules.unit}` : '';
  const comparison = kind === 'min' ? 'at least' : 'at most';
  return `${rules.label} must be ${comparison} ${value}${unit}.`;
}

/**
 * A number arriving as a form string. Blank means "not provided", which is why
 * the nullable wrapper sits outside the coercion: `Number(null)` is 0, and a
 * silent 0 for an aperture or an ISO would be a fabricated camera setting.
 */
export function optionalDecimal(rules: NumberRules) {
  return z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: `${rules.label} must be a number.` })
      .gte(rules.min, { error: bound(rules, 'min') })
      .lte(rules.max, { error: bound(rules, 'max') })
      .nullable(),
  );
}

export function optionalInteger(rules: NumberRules) {
  return z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: `${rules.label} must be a number.` })
      .int({ error: `${rules.label} must be a whole number.` })
      .gte(rules.min, { error: bound(rules, 'min') })
      .lte(rules.max, { error: bound(rules, 'max') })
      .nullable(),
  );
}

/* ------------------------------------------------------------------------ */
/* Booleans and dates                                                        */
/* ------------------------------------------------------------------------ */

/** A box that must be ticked. The message is the consequence of not ticking it. */
export function consent(error: string) {
  return z.preprocess(toFlag, z.literal(true, { error }));
}

/** A box where either state is valid. */
export function flag() {
  return z.preprocess(toFlag, z.boolean());
}

/** An ISO 8601 instant, as produced by `Date.prototype.toISOString`. */
export function optionalInstant(label: string) {
  return z.preprocess(
    blankToNull,
    z.iso
      .datetime({
        offset: true,
        error: `${label} must be a date and time, for example 2024-03-12T18:40:00Z.`,
      })
      .nullable(),
  );
}

/** A two-letter ISO 3166-1 alpha-2 country code, stored uppercase. */
export function countryCode(label = 'Country code') {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, {
      error: `${label} must be a two-letter ISO country code, for example JP.`,
    });
}

/** A value from a fixed list, with one message for both "missing" and "not on the list". */
export function choice<const T extends readonly [string, ...string[]]>(
  values: T,
  error: string,
) {
  return z.enum(values, { error });
}

/** Blank-tolerant variant of {@link choice}, falling back to a stated default. */
export function choiceWithDefault<const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
  error: string,
) {
  return z.preprocess(blankToUndefined, z.enum(values, { error }).default(fallback));
}
