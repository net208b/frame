import { BASEMAP_VARIANTS, basemapStyle, parseBasemapVariant } from '@/lib/map/basemap';

/**
 * FRAME's basemap style document, one URL per theme and language:
 * `/basemap/light-en`, `/basemap/dark-th`, and the other two combinations.
 *
 * MapLibre takes a style as a URL, not as an object, so the style that
 * `src/lib/map/basemap.ts` builds has to be served from somewhere. Serving it
 * from the app rather than importing it into the client bundle keeps roughly
 * 30 kB of layer definitions out of every page that is not the map, lets the
 * CDN cache it for everyone, and means the browser fetches it in parallel with
 * the MapLibre renderer instead of after it.
 *
 * All four variants are rendered at build time and nothing else is accepted:
 * the set is closed, so `dynamicParams = false` turns any other path into a 404
 * without this handler having to decide anything at request time.
 *
 * `/basemap` is excluded from the locale middleware in `src/middleware.ts`.
 * Without that, `/basemap/dark-th` is just a path with no locale prefix and
 * gets redirected to `/en/basemap/dark-th`, which does not exist.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = 604800;

export function generateStaticParams(): { variant: string }[] {
  return BASEMAP_VARIANTS.map((variant) => ({ variant }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variant: string }> },
): Promise<Response> {
  const { variant } = await params;
  const parsed = parseBasemapVariant(variant);

  // Unreachable while `dynamicParams` is false — it is here because the parse
  // is what proves the two strings are a theme and a language to the compiler.
  if (!parsed) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify(basemapStyle(parsed.theme, parsed.language)), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // A style only changes when FRAME deploys one, and a viewer holding
      // yesterday's palette for an hour is not a defect.
      //
      // In development it is: MapLibre asks for the style with `fetch`, which a
      // reload — even a hard one — does not take out of the HTTP cache, so an
      // hour of `max-age` means editing a colour appears to do nothing. Caching
      // is a production concern and nothing here depends on it, so development
      // simply does not get it.
      'cache-control':
        process.env.NODE_ENV === 'production'
          ? 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400'
          : 'no-store',
    },
  });
}
