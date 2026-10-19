import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { siteUrl } from '@/lib/config';

import './globals.css';

/**
 * The root layout, which holds almost nothing — and that is the decision worth
 * explaining, because the obvious shape for this file is `<html><body>`.
 *
 * The `lang` attribute has to match the language the page is actually in. Only
 * `app/[locale]/layout.tsx` knows that, from its own route segment, and only one
 * layout in a chain may render `<html>`: two would nest one document inside
 * another. So the element belongs to the locale layout, and this file passes its
 * children straight through.
 *
 * The alternative — keeping `<html>` here and reading the locale with
 * `getLocale()` — was rejected. Above the `[locale]` segment there is no segment
 * to read, so next-intl would fall back to the request header it sets in
 * middleware; reading a header opts the whole application into dynamic
 * rendering, which would cost every page its static prerender to set one
 * attribute. Next validates the rendered stream rather than this file, so the
 * `<html>` and `<body>` the locale layout emits satisfy it.
 *
 * What does stay here is what has no language: the stylesheet, so that even a
 * route rendered outside `[locale]` is styled, and `metadataBase`, so a relative
 * image path resolves against the right origin wherever metadata is built.
 */

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
};

export const viewport: Viewport = {
  /*
   * One entry per system preference, both matching `--color-paper` in the
   * theme they name, so the browser's own chrome agrees with the page before
   * the first paint and without any script. The browser uses the first entry
   * whose media query matches.
   *
   * These two hexes and the ones in `global-error.tsx` are the only colours in
   * the application that are not read from `globals.css`. They cannot be: a
   * `<meta>` cannot hold a `var()`, and this file is evaluated on the server
   * where no stylesheet has been resolved. The pair is therefore a copy, and
   * the copy has to be updated with `--color-paper` — which is why
   * `ThemeToggle` reads the resolved value out of the document rather than
   * repeating it a third time.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#141610' },
  ],
  // The application has both themes, so the browser may paint its own
  // furniture — scrollbars, form controls, the overscroll canvas — either way.
  // An explicit choice narrows this to one value through the `color-scheme`
  // declarations in globals.css, which follow the same `data-theme` attribute
  // the tokens do.
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
