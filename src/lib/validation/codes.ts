/**
 * How a schema says what is wrong in a language it cannot know.
 *
 * THE PATTERN, established here for every validation module to follow.
 *
 * A schema runs on the server, inside a server action, where there is no React
 * tree and therefore no `useTranslations`. It also runs before anything knows
 * which form the submission came from. So a schema does not produce a sentence:
 * it produces a *message key*, and the form that renders the failure turns that
 * key into a sentence with its own translator.
 *
 *     // src/lib/validation/auth.ts
 *     .min(10, { error: validationCode('password.min') })   // "validation.password.min"
 *
 *     // src/components/auth/AuthStatus.tsx
 *     const t = useTranslations('auth');
 *     t('validation.password.min')                           // → the sentence
 *
 * The key is relative to the feature's own message namespace, so the upload
 * schemas emit `validation.title.max` and the upload form resolves it against
 * `upload`. Nothing has to be registered anywhere: the schema and the form agree
 * on one string, and `src/messages/{en,th}.json` holds the copy under
 * `<namespace>.validation.…`.
 *
 * WHY THIS AND NOT A TRANSLATOR PASSED INTO THE SCHEMA. Building the schema from
 * a translator — `signUpSchema(t)` — was the other option in the brief. It was
 * rejected for three reasons. The schemas are module-level constants that
 * `parseForm` consumes directly, so making them factories would change every
 * call site in `src/server/actions/**` and rebuild the schema on each request.
 * The server would have to resolve the reader's language before validating,
 * which is one more thing that can be wrong in a security-sensitive path. And
 * the message would then be chosen on the server while the page is rendered on
 * the client, so a form that re-renders after a locale change would show a
 * sentence in the previous language. Resolving in the component keeps the
 * message in exactly the language the reader is looking at.
 *
 * THE RULE ABOUT NUMBERS. A code carries no values, because the generic resolver
 * has none to pass. Where a bound appears in the copy — "at least 10 characters"
 * — it is written into both catalogues as a literal, which is honest because the
 * bound is a constant of the schema, not a runtime value. A message that needs a
 * genuine runtime number is not a validation message: it belongs to the action
 * that knows the number, and is translated there.
 */

/**
 * The marker that tells a resolver "this is a key, not a sentence".
 *
 * It has to be distinguishable, because the same `fieldErrors` map also carries
 * real sentences: an action can file a message against a field after the
 * identity service refuses something a schema could not have known about.
 */
export const VALIDATION_CODE_PREFIX = 'validation.';

/** The key a schema puts in a zod `error`, for example `validation.email.invalid`. */
export function validationCode(key: string): string {
  return `${VALIDATION_CODE_PREFIX}${key}`;
}

/** Whether a message from a schema or an action is a key that needs resolving. */
export function isValidationCode(value: string): boolean {
  return value.startsWith(VALIDATION_CODE_PREFIX);
}
