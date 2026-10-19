import type { MetadataRoute } from 'next';

import { DEFAULT_LOCALE, withLocalePrefix } from '@/i18n/locales';
import { SITE } from '@/lib/config';

/**
 * The web manifest.
 *
 * Minimal on purpose, and accurate: it names the site, describes it in the one
 * line the rest of the product uses, and gives the browser the paper colour so
 * an added shortcut does not open onto a white flash.
 *
 * The only icon declared is the one that actually exists: `src/app/icon.svg`,
 * which Next's file convention serves at `/icon.svg`. A manifest that points at
 * an icon which 404s is worse than one that omits the field, so nothing else is
 * listed — in particular there is no `maskable` entry and no 192 or 512 pixel
 * raster, which is what an Android installer really wants.
 *
 * `display` is `browser` for that same reason. With no maskable icon set and no
 * offline support, declaring a standalone app experience would be a promise the
 * project does not keep. Both change together, once a real icon set and a
 * service worker exist.
 *
 * One manifest, in English. A browser fetches `/manifest.webmanifest` without a
 * language, so `start_url` opens the English home page — the same page a visitor
 * lands on from anywhere else — and `lang` says so rather than claiming to be
 * neutral. `scope` stays at the root so both languages are inside the app.
 * Per-language manifests would need a `<link rel="manifest">` per locale and a
 * route to serve them, which is a change worth making deliberately rather than
 * implying here.
 *
 * `dir` is the other half of declaring a language, and one value is honest for
 * both of FRAME's: Thai is written left to right, like English. It is stated
 * rather than left out because the default when `dir` is absent is `auto`, and
 * `auto` asks the browser to infer direction from the first strongly directional
 * character of `name` — which for a wordmark that is a Latin word would give the
 * right answer by accident rather than because anything said so.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.tagline,
    lang: DEFAULT_LOCALE,
    dir: 'ltr',
    start_url: withLocalePrefix('/', DEFAULT_LOCALE),
    scope: '/',
    display: 'browser',
    // Both match --color-paper in globals.css.
    background_color: '#f8f8f5',
    theme_color: '#f8f8f5',
    icons: [
      {
        src: '/icon.svg',
        type: 'image/svg+xml',
        // A vector has no intrinsic size, which is what "any" means here.
        sizes: 'any',
        purpose: 'any',
      },
    ],
  };
}
