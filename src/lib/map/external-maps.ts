/**
 * Handing a published point to the map app on somebody's phone.
 *
 * WHY THIS EXISTS. A reader looking at a photograph and thinking "I want to
 * shoot there" has, until now, had to copy two numbers and paste them into
 * another app. FRAME knows the place and has a published coordinate for it;
 * the one thing it cannot do is route somebody there, and it deliberately does
 * not want to — the basemap is self-served precisely to stay off metered
 * routing services. Handing the point to the map app the reader already has is
 * the whole of what is needed.
 *
 * THE PRECISION RULE, WHICH IS THE POINT OF PUTTING THIS IN ITS OWN MODULE.
 * The URL is built from the coordinate ROUNDED TO ITS PUBLISHED PRECISION, the
 * same `toFixed(precisionDecimals)` the page prints and the copy button hands
 * over. A place whose position was deliberately coarsened to protect it must
 * not become exact because somebody tapped a link: this is the one place that
 * decision could have been quietly undone, so the rounding happens here and
 * every caller gets it.
 *
 * A place whose coordinates are withheld has no `Coordinates` at all, so there
 * is nothing for a caller to pass and no link to build.
 *
 * WHAT GOOGLE RECEIVES. The coordinate, because that is the request, and the
 * origin of the page as a referrer — `Referrer-Policy: strict-origin-when-
 * cross-origin` in next.config.mjs keeps the path off it, so which photograph
 * or which place the reader was looking at does not travel with the click.
 * Nothing is embedded: no script, no iframe, no pixel. The reader taps a link
 * and leaves, which is the only shape of this that `/legal/privacy`'s "no
 * analytics vendor embedded" permits.
 */

import type { Coordinates } from '@/types/domain';

/**
 * A Google Maps URL that opens the app on a phone and the web map elsewhere.
 *
 * The `search` form rather than `dir` (directions): directions to a
 * deliberately approximate point would present a guess as a destination, and
 * from a dropped pin the reader is one tap from directions anyway — with the
 * choice of transport still theirs. Google's documented `api=1` form is used
 * because it is the one with a stated contract; a `geo:` URI would open a
 * different app on Android and nothing at all on a desktop.
 */
export function googleMapsPlaceUrl(coordinates: Coordinates): string {
  const { latitude, longitude, precisionDecimals } = coordinates;
  const point = `${latitude.toFixed(precisionDecimals)},${longitude.toFixed(precisionDecimals)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`;
}
