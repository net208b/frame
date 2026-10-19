import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, isLocale } from './locales';

/**
 * The per-request translation configuration, loaded by the next-intl plugin
 * wired up in `next.config.mjs`.
 *
 * The requested locale is validated rather than trusted. The `[locale]` segment
 * behaves as a catch-all, so it can arrive as anything — `/favicon.ico`,
 * `/.env`, a crawler's guess — and it is `undefined` for a render that happens
 * outside the segment. Falling back to English is what keeps those requests on
 * a real page instead of throwing a 500 at them; the middleware has already
 * redirected anything legitimate to a prefixed path by the time this runs.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    // One file per language, loaded on demand so a Thai page never ships the
    // English catalogue and the other way round.
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
