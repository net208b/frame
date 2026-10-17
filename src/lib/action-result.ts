/**
 * The result contract every server action in FRAME returns.
 *
 * Two rules sit behind this module, both from the product brief:
 *
 * 1. An expected failure is a value, not an exception. A refusal because the
 *    viewer is signed out, rate limited, or because no database is configured
 *    is a normal outcome, so it travels back as data the form can render next
 *    to the field that caused it.
 * 2. Nothing may report success for something that did not happen. `ok()` is
 *    only ever constructed after a write has actually been made, which is why
 *    there is no "optimistic" variant here.
 */

export type ActionCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'rate_limited'
  | 'validation'
  | 'not_configured'
  | 'conflict'
  | 'not_found'
  | 'unknown';

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: ActionCode; fieldErrors?: Record<string, string> };

/**
 * A successful outcome.
 *
 * An action with no payload returns `ok(undefined)`, which satisfies
 * `ActionResult<void>` without needing a second constructor.
 */
export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(
  error: string,
  code: ActionCode = 'unknown',
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error, code, fieldErrors };
}

/** The single sentence shown whenever a write is attempted in demo mode. */
export const NOT_CONFIGURED_MESSAGE =
  'This action needs a database and none is configured, so nothing was saved — see docs/ENVIRONMENT.md for the environment variables that connect one.';

/* ------------------------------------------------------------------------ */
/* Zod                                                                       */
/* ------------------------------------------------------------------------ */

interface IssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

/**
 * Recognise a `ZodError` by its shape rather than by `instanceof`.
 *
 * A structural check keeps this module free of a Zod import, and it works for
 * the error on a `safeParse` result as well as for one that was thrown — both
 * carry the same `issues` array.
 */
function issuesOf(error: unknown): IssueLike[] | null {
  if (typeof error !== 'object' || error === null) return null;
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return null;

  const parsed: IssueLike[] = [];
  for (const issue of issues) {
    if (typeof issue !== 'object' || issue === null) continue;
    const candidate = issue as { path?: unknown; message?: unknown };
    if (typeof candidate.message !== 'string') continue;
    parsed.push({
      path: Array.isArray(candidate.path) ? (candidate.path as PropertyKey[]) : [],
      message: candidate.message,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

/** The key a field error is filed under when an issue has no path. */
const FORM_LEVEL_KEY = '_form';

/**
 * Flatten a `ZodError` into `fieldErrors`, keyed by the dotted path of the
 * field that failed, so a form can show each message beside its own input.
 *
 * The first message per field wins: later issues on the same field are usually
 * consequences of the first and showing all of them only adds noise.
 */
export function failFromZod(error: unknown): ActionResult<never> {
  const issues = issuesOf(error);
  if (!issues) {
    return fail('That submission could not be validated.', 'validation');
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map((segment) => String(segment)).join('.') || FORM_LEVEL_KEY;
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }

  const summary =
    fieldErrors[FORM_LEVEL_KEY] ??
    (issues.length === 1
      ? (issues[0]?.message ?? 'Please check the form and try again.')
      : `Please correct ${issues.length} fields and try again.`);

  return fail(summary, 'validation', fieldErrors);
}
