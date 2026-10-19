import { notFound } from 'next/navigation';

import { isLocale, type Locale } from './locales';

/**
 * Reading the `[locale]` segment off a route's params.
 *
 * Next generates the prop types for every route and types the segment as
 * `string`, which is correct: a URL segment is whatever was requested, and
 * `/xx/discover` is a request somebody can make. A page that declares
 * `params: Promise<{ locale: Locale }>` therefore fails to satisfy the
 * generated `PageProps`/`LayoutProps` constraint — the narrower type is not
 * assignable to the wider one.
 *
 * So the declared type stays wide and the narrowing happens here, once.
 * `LocaleLayout` already answers an unknown locale with `notFound()`, but that
 * guard only covers what renders *below* it: `generateMetadata` and
 * `generateStaticParams` run outside the layout's render, so each entry point
 * has to narrow for itself. Doing it through one helper is what keeps the two
 * from drifting apart.
 *
 * This module is separate from `locales.ts` on purpose. `notFound()` comes from
 * `next/navigation` and belongs to the server; `locales.ts` is imported by
 * client components for `LOCALE_LABELS` and must stay free of it.
 */

/** The params shape Next generates for a route under `[locale]`. */
export type LocaleParams<Extra = Record<never, never>> = Promise<{ locale: string } & Extra>;

/**
 * Await a route's params and narrow the locale, or answer 404.
 *
 * Returns the other params untouched, so a detail page gets its `slug` or
 * `username` from the same call.
 */
export async function readLocaleParams<Extra extends object>(
  params: LocaleParams<Extra>,
): Promise<{ locale: Locale } & Extra> {
  const resolved = await params;

  if (!isLocale(resolved.locale)) notFound();

  // `isLocale` has narrowed `resolved.locale`, but TypeScript cannot carry that
  // through the intersection, so the shape is restated rather than re-derived.
  return resolved as { locale: Locale } & Extra;
}
