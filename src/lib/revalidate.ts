import { revalidatePath } from 'next/cache';

import { LOCALES, withLocalePrefix } from '@/i18n/locales';

/**
 * Invalidate a page in every language.
 *
 * Next identifies a cached page by its real pathname, and since every page now
 * lives under a locale segment, that pathname includes the language:
 * `/en/discover` and `/th/discover` are two cache entries for one view. A bare
 * `revalidatePath('/discover')` matches neither — it does not fail, it simply
 * invalidates nothing, which is the worst possible way for this to be wrong.
 * Every write path therefore goes through here and names the page the way the
 * app writes it, without a locale.
 *
 * `revalidatePath('/[locale]/discover', 'page')` would be shorter, but for a
 * path carrying a slug the equivalent — `'/[locale]/photographs/[slug]'` — can
 * only invalidate every photograph page at once. Listing the locales keeps the
 * invalidation as narrow as it was before.
 *
 * `revalidatePath('/', 'layout')` is still correct as it stands and is left
 * alone: the root layout sits above the locale segment, so it already covers
 * both languages.
 */
export function revalidateLocalisedPath(path: string): void {
  for (const locale of LOCALES) revalidatePath(withLocalePrefix(path, locale));
}
