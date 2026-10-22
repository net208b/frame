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
export interface PhotoMarkerOptions {
  /**
   * The signed-in member has a published photograph at this place. The marker
   * gets a lit ring, so a member can pick out their own work on the map at a
   * glance. Nobody else sees it: the ring says "yours", not "popular".
   */
  own?: boolean;
  /** What a screen reader hears after the place's name when `own` is set. */
  ownLabel?: string;
  /**
   * The place's name in the reader's language, where a translation exists
   * (0035). The caller resolves it because this module builds markup and has
   * no locale of its own; without it the name is read as written, which is
   * what every pin did before the map could translate one.
   */
  name?: string;
}

export function createPhotoMarkerElement(
  pin: MapPin,
  onSelect: () => void,
  options: PhotoMarkerOptions = {},
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
   *
   * The name itself is in the reader's language too, when the place has a
   * translated one. A sighted reader has read "Bang Kapi" on the card and in
   * the list beside the map; a screen reader hearing บางกะปิ for the same pin
   * was the one place the map still answered in the other language.
   */
  const label = options.name ?? pin.name;
  element.setAttribute(
    'aria-label',
    options.own && options.ownLabel ? `${label}. ${options.ownLabel}` : label,
  );
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

  /*
   * The member's own ring. A lit band just outside the frame, breathing slowly,
   * in the accent the site already uses for "this is live". Drawn behind the
   * frame so the photograph stays whole, and only when `own` is set: a reader
   * who is not signed in, or has no frame here, sees the marker exactly as
   * before. Still, not breathing, for a reader who asked for reduced motion.
   */
  if (options.own) {
    const glow = document.createElement('span');
    glow.setAttribute('aria-hidden', 'true');
    glow.className = [
      'pointer-events-none absolute -inset-1.5 rounded-pill',
      'border-2 border-accent own-ring-glow',
      'motion-safe:animate-[own-ring_2.6s_ease-in-out_infinite]',
    ].join(' ');
    element.append(glow);
  }

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

  // The photographer, overlapping the frame's corner — who made the newest
  // picture here, before the card is even opened. Only when there is a face
  // to show; a missing avatar leaves the frame alone rather than drawing a
  // blank disc on it.
  const avatarUrl = pin.latest?.photographer?.avatarUrl ?? null;
  if (avatarUrl) {
    const avatar = document.createElement('img');
    avatar.src = avatarUrl;
    avatar.alt = '';
    avatar.decoding = 'async';
    avatar.loading = 'lazy';
    avatar.className =
      'absolute -bottom-1 -left-1 size-5 rounded-pill border-2 border-surface bg-surface object-cover';
    element.append(avatar);
  }

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
