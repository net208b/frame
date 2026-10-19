/**
 * Loading MapLibre, with its worker pointed somewhere the bundler has actually
 * emitted.
 *
 * MapLibre 6 is an ESM-only distribution and spawns its worker as a module
 * worker — `new Worker(url, { type: 'module' })`. Left to itself under webpack,
 * which is what `next build` uses here, the URL it derives does not match
 * anything the build emitted: the browser requests it, Next answers with its
 * 404 page, and the module worker is rejected for the HTML content type. What
 * reaches the console is
 *
 *     Worker failed to load. Check that the worker URL is correct.
 *     Failed to load module script: non-JavaScript MIME type "text/html"
 *
 * and the map renders nothing while the rest of the page carries on. Neither
 * `tsc` nor `next build` sees any of this; it appears only when a map is opened
 * with a style configured, which is why it survived the upgrade's typecheck and
 * build.
 *
 * `new URL(specifier, import.meta.url)` is the form webpack understands as an
 * asset reference: it resolves the package path at build time and rewrites the
 * expression to the emitted asset's URL.
 *
 * Both map components go through here rather than importing `maplibre-gl`
 * directly, so the worker is configured exactly once and the two cannot drift
 * apart — a map that works on the location page and silently fails on /map
 * would be a miserable thing to debug.
 */

type MapLibre = typeof import('maplibre-gl');

let configured = false;

export async function loadMapLibre(): Promise<MapLibre> {
  const maplibregl = await import('maplibre-gl');

  if (!configured) {
    maplibregl.setWorkerUrl(
      new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString(),
    );
    configured = true;
  }

  return maplibregl;
}
