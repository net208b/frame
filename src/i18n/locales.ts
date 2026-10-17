import type { NextRequest } from 'next/server';

/**
 * The languages FRAME is published in.
 *
 * This module is the single source of truth for the locale set. It is
 * deliberately free of runtime dependencies — `next-intl` imports it, not the
 * other way round — so a client component can read `LOCALE_LABELS` without
 * pulling the routing configuration into its bundle.
 *
 * English is the default for everyone. The owner's decision is that a visitor
 * always lands on `/en` and changes language with the control in the header, so
 * `Accept-Language` is never consulted (see `routing.ts`). A shared link
 * therefore shows the same language to whoever opens it.
 */

export const LOCALES = ['en', 'th'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Narrows an unknown value — a URL segment, a cookie, a query parameter. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Each language named in its own language, which is the only naming a language
 * switch can use: somebody looking for Thai cannot be expected to recognise the
 * word "Thai" written in English.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  th: 'ไทย',
};

/**
 * The BCP 47 tags handed to `Intl`, which are not always the URL segment.
 *
 * `th` alone would format dates in the Buddhist era, because that is the Thai
 * default calendar. FRAME publishes Gregorian dates in every language on
 * purpose — see the note in `lib/utils.ts` — so the Thai tag pins the calendar.
 */
export const INTL_LOCALES: Record<Locale, string> = {
  en: 'en-GB',
  th: 'th-u-ca-gregory',
};

/* ------------------------------------------------------------------------ */
/* Paths                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Put a locale in front of an app path.
 *
 * Components never need this: they import `Link`, `redirect` and `useRouter`
 * from `@/i18n/navigation`, which prefix for them. It exists for the two places
 * that sit outside the routed React tree — the route handlers under
 * `src/app/auth`, and the sitemap — where a path is assembled by hand.
 *
 * A path that already carries a locale is returned unchanged, so a `next=`
 * parameter cannot end up as `/th/th/upload`.
 */
export function withLocalePrefix(path: string, locale: Locale): string {
  if (!path.startsWith('/')) return `/${locale}/${path}`;
  if (path === '/') return `/${locale}`;

  const segment = path.slice(1).split(/[/?#]/, 1)[0];
  if (isLocale(segment)) return path;

  return `/${locale}${path}`;
}

/** The locale a path is already in, or null when it carries none. */
export function localeFromPathname(pathname: string | null | undefined): Locale | null {
  if (!pathname) return null;
  const segment = pathname.replace(/^\/+/, '').split(/[/?#]/, 1)[0];
  return isLocale(segment) ? segment : null;
}

/**
 * Which language a request to a non-localised route handler belongs to.
 *
 * `/auth/callback`, `/auth/confirm` and `/auth/signout` are endpoints rather
 * than pages, so they carry no `[locale]` segment — but they redirect to pages,
 * and sending a Thai reader to an English page is a visible defect. The locale
 * is recovered from, in order of how much it can be trusted:
 *
 * 1. an explicit `?locale=` on the request, which is what an email link can
 *    carry forward from the page that asked for it;
 * 2. the `Referer`, which a form submitted from inside FRAME always sends
 *    (`Referrer-Policy: strict-origin-when-cross-origin` keeps the path on
 *    same-origin requests);
 * 3. the locale cookie next-intl's middleware writes;
 * 4. the default, English.
 *
 * None of these is used to *choose* a language for a visitor — step 4 is what
 * an unrecognisable request gets. They only keep a redirect in the language the
 * reader was already in.
 */
export function localeFromRequest(request: NextRequest): Locale {
  const explicit = request.nextUrl.searchParams.get('locale');
  if (isLocale(explicit)) return explicit;

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.host === request.nextUrl.host) {
        const fromReferer = localeFromPathname(url.pathname);
        if (fromReferer) return fromReferer;
      }
    } catch {
      // A malformed Referer is simply no answer; fall through to the cookie.
    }
  }

  const cookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (isLocale(cookie)) return cookie;

  return DEFAULT_LOCALE;
}
