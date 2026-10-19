import { defineRouting } from 'next-intl/routing';

import { DEFAULT_LOCALE, LOCALES } from './locales';

/**
 * How a locale appears in the URL.
 *
 * `localePrefix: 'always'` means the language is in every address — `/en/discover`
 * and `/th/discover` — and the bare root redirects to `/en`. The alternative,
 * `as-needed`, would leave English unprefixed and give the same page two
 * addresses; with the prefix always present, what a reader copies out of the
 * address bar is exactly what the next person opens.
 *
 * `localeDetection: false` is a decision, not an omission. With it enabled,
 * next-intl would read `Accept-Language` and bounce a visitor whose browser
 * prefers Thai to `/th` before they had asked for it — which also means two
 * people following the same link could see two different languages. The owner
 * chose English as the landing language for everyone, with the control in the
 * header as the only way to change it, so detection stays off.
 *
 * The locale cookie next-intl writes is still kept: it records which language
 * was last served, which is what lets the `/auth/*` route handlers redirect
 * into the right language (see `localeFromRequest`). It is never used to pick a
 * language for an incoming request.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: false,
});
