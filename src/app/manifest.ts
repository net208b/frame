import type { MetadataRoute } from 'next';

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
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.tagline,
    lang: SITE.locale,
    start_url: '/',
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
