import type { ContentTranslation } from '@/types/domain';

/**
 * Two pure questions about a translation, asked from both sides of the
 * server/client boundary.
 *
 * THEY LIVE HERE RATHER THAN BESIDE THE COMPONENT because the component is a
 * client component, and a plain function exported from a `'use client'` module
 * cannot be called by a server component — React replaces it with a reference
 * and the call fails at request time with "attempted to call … from the
 * server". `PhotoHeadline`, `LocationHeader` and `ProfileHeader` are all
 * server components that need to decide whether a translation is worth
 * showing before they render anything, so the decision belongs in a module
 * with no directive on it at all.
 */

/** Whether this translation is worth showing to a reader in `locale`. */
export function translationApplies(
  translation: ContentTranslation | undefined,
  locale: string,
): translation is ContentTranslation {
  if (!translation) return false;
  // `locale` may be a full tag; the stored language is always 'en' or 'th'.
  return locale.startsWith(translation.language);
}

/** True when any of these is worth showing — what `available` wants. */
export function anyTranslation(
  locale: string,
  ...translations: Array<ContentTranslation | undefined>
): boolean {
  return translations.some((entry) => translationApplies(entry, locale));
}

/**
 * The language the author wrote in. With exactly two languages it needs no
 * lookup: a translation is only ever shown to a reader whose language is not
 * the one it was written in, so the source is simply the other one.
 */
export function sourceLanguageFor(locale: string): 'en' | 'th' {
  return locale.startsWith('th') ? 'en' : 'th';
}
