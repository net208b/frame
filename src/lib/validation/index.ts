import { z } from 'zod';

/**
 * The one way an action validates its input.
 *
 * Every server action in FRAME follows the same order — capability, identity,
 * authorisation, rate limit, validation, write — and this module owns the
 * validation step. Keeping it in one helper means a field error reaches the
 * form the same way whether it came from a sign-up, an upload or a moderation
 * decision, and that no action has to decide for itself what counts as a
 * readable message.
 */

export type FormParseResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** One sentence for a summary or a toast. */
      message: string;
      /**
       * Field path (`capture.iso`) to the first message for that field. An
       * issue that belongs to the submission as a whole is filed under
       * `_form`, which is the key `failFromZod` in @/lib/action-result uses,
       * so a form renders errors the same way whichever path validated them.
       */
      fieldErrors: Record<string, string>;
    };

/** The key a field error is filed under when an issue has no path. */
const FORM_LEVEL_KEY = '_form';

/**
 * Flatten a `FormData` into a plain object a schema can read.
 *
 * Repeated keys and keys written `categories[]` both become arrays, because
 * that is how a checkbox group and a multiple select arrive. `File` values are
 * passed through untouched: the schema decides whether a file belongs there.
 */
function formDataToRecord(formData: FormData): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const [rawKey, value] of formData.entries()) {
    const isExplicitArray = rawKey.endsWith('[]');
    const key = isExplicitArray ? rawKey.slice(0, -2) : rawKey;
    const existing = record[key];

    if (isExplicitArray) {
      record[key] = Array.isArray(existing) ? [...existing, value] : [value];
      continue;
    }

    if (existing === undefined) {
      record[key] = value;
    } else if (Array.isArray(existing)) {
      record[key] = [...existing, value];
    } else {
      record[key] = [existing, value];
    }
  }

  return record;
}

/**
 * Validate an action's input against a schema.
 *
 * Accepts a `FormData` from a progressively-enhanced form or a plain value
 * from a client component, so an action never needs two code paths. Nothing
 * here throws: an invalid submission is an expected outcome, and the caller
 * turns the result into an `ActionResult` with code `validation`.
 */
export function parseForm<Schema extends z.ZodType>(
  input: unknown,
  schema: Schema,
): FormParseResult<z.output<Schema>> {
  const raw = input instanceof FormData ? formDataToRecord(input) : input;
  const result = schema.safeParse(raw);

  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string> = {};

  for (const issue of result.error.issues) {
    const key = issue.path.map((segment) => String(segment)).join('.') || FORM_LEVEL_KEY;
    // The first message for a field is the most specific one zod produced;
    // the rest are usually consequences of it and only add noise.
    if (fieldErrors[key] === undefined) fieldErrors[key] = issue.message;
  }

  const messages = Object.entries(fieldErrors);
  const first = messages[0];

  return {
    ok: false,
    message:
      fieldErrors[FORM_LEVEL_KEY] ??
      (messages.length === 1 && first !== undefined
        ? first[1]
        : 'Some of these details need attention. The form shows what to change.'),
    fieldErrors,
  };
}

export * from './fields';
export * from './auth';
export * from './upload';
export * from './location';
export * from './report';
export * from './collection';
export * from './moderation';
