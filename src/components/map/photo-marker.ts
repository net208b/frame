import type { MapPin } from '@/lib/data/repository';

/**
 * The pin a place gets once somebody has photographed it: the newest frame from
 * that place, round, ringed, with the frames before it stacked behind.
 *
 * WHY THIS IS DOM AND NOT A MAP LAYER. The rest of the map is drawn by WebGL
 * from the style in `map-style.ts`, and a photograph could be too — MapLibre
 * takes images through `addImage` and a `symbol` layer would draw them on the
 * GPU. It would also mean loading every thumbnail into a texture, cutting each
 * one into a circle on a canvas first, maintaining both at two pixel ratios,
 * and losing the hover state, the focus ring and the stack behind the frame,
 * none of which a symbol layer can express. A marker is a `<button>`: it styles
 * itself with the same tokens as the rest of the interface, it takes a keyboard
 * focus, and a screen reader can read it — which the canvas, for all its
 * efficiency, can never be.
 *
 * The cost is one DOM node per visible pin, which is why `MapCanvas` only keeps
 * markers for the pins the source currently has outside a cluster. Everything
 * further out is a cluster circle, and those are still drawn by the GPU.
 *
 * A PIN WITH NO PHOTOGRAPH IS NOT A MARKER. It stays the lime dot from
 * `pointLayer()` — there is nothing to show, and a placeholder would promise a
 * photograph that is not there. The circle layer filters itself to exactly
 * those pins, so the two never draw over each other.
 */

/** Matches `--radius-pill`; set here because the element is built, not classed. */
const RING_WIDTH = 2;

/**
 * Builds the element. Returns the node and a `setSelected`, because the
 * selected pin grows a heavier ring and comes forward, and rebuilding the node
 * on every selection change would restart the image load.
 */
export function createPhotoMarkerElement(
  pin: MapPin,
  onSelect: () => void,
): { element: HTMLButtonElement; setSelected: (selected: boolean) => void } {
  const element = document.createElement('button');
  element.type = 'button';
  /*
   * The place's own name, and nothing added to it. Not "Pin: Rooftop Garden
   * Café" or "Rooftop Garden Café, 3 photographs": the button sits inside a
   * region MapLibre has already named "Map of the places on FRAME", so the role
   * and the context are announced around it, and a translated noun spliced in
   * front of a name is one more string to keep in two languages for no
   * information. The count and the precision are on the card the button opens,
   * as text, in the reader's language.
   */
  element.setAttribute('aria-label', pin.name);
  element.className = [
    'group relative grid size-11 place-items-center rounded-pill',
    // The focus ring is the interface's own, not the browser's: a map is a
    // dense ground and the default outline disappears into it.
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
    'motion-safe:transition-transform motion-safe:duration-150',
    'hover:z-10 hover:scale-110',
  ].join(' ');

  /*
   * The stack. Two edges peeking out behind the frame, and only when there is
   * something behind it to show — a stack under a single photograph would be a
   * decoration that lies about how much is there. They are plain divs rather
   * than the other thumbnails: at 44px the second and third images would be
   * four visible pixels of a different photograph, which reads as a rendering
   * fault rather than as depth.
   */
  const behind = Math.min(Math.max(pin.recentImageUrls.length - 1, 0), 2);
  for (let layer = behind; layer > 0; layer -= 1) {
    const sheet = document.createElement('span');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.className =
      'absolute inset-0 rounded-pill border border-line bg-surface motion-safe:transition-transform';
    sheet.style.transform = `translate(${layer * 3}px, ${layer * -3}px)`;
    element.append(sheet);
  }

  const frame = document.createElement('span');
  frame.setAttribute('aria-hidden', 'true');
  frame.className = [
    'relative size-11 overflow-hidden rounded-pill bg-surface-sunken',
    // The ring is what lifts the photograph off the map. An approximate
    // position gets a dashed one, the same distinction the legend names: the
    // frame is still exactly this frame, but where it was taken is an area.
    pin.isApproximate ? 'border-2 border-dashed border-accent-strong' : 'border-surface',
  ].join(' ');
  if (!pin.isApproximate) frame.style.borderWidth = `${RING_WIDTH}px`;
  if (!pin.isApproximate) frame.style.borderStyle = 'solid';

  const url = pin.recentImageUrls[0];
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'lazy';
    image.className = 'size-full object-cover';
    frame.append(image);
  }

  element.append(frame);

  /*
   * How many frames the place holds, when it holds more than one. A number
   * rather than a dot: "3" says what the stack behind the thumbnail only
   * implies, and it is the figure the card repeats when the pin is chosen.
   */
  if (pin.photographCount > 1) {
    const count = document.createElement('span');
    count.setAttribute('aria-hidden', 'true');
    count.className = [
      'absolute -right-1.5 -bottom-1.5 grid min-w-5 place-items-center rounded-pill',
      'border border-surface bg-ink px-1 text-[0.625rem] leading-4 font-semibold',
      'text-ink-fill-text tabular-nums',
    ].join(' ');
    count.textContent = String(pin.photographCount);
    element.append(count);
  }

  element.addEventListener('click', (event) => {
    // The map has its own click handler for the canvas underneath; without this
    // a marker click would select the pin and then immediately clear it.
    event.stopPropagation();
    onSelect();
  });

  const setSelected = (selected: boolean) => {
    frame.classList.toggle('border-ink', selected && !pin.isApproximate);
    frame.classList.toggle('border-surface', !selected && !pin.isApproximate);
    element.style.zIndex = selected ? '20' : '';
    element.style.transform = selected ? 'scale(1.12)' : '';
  };

  return { element, setSelected };
}
