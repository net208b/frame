'use client';

import { geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { ArrowUpRight, Minus, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { useResolvedTheme } from '@/components/system/use-theme';
import { Link } from '@/i18n/navigation';
import {
  countryName,
  findCountry,
  loadGlobeCountries,
  searchCountries,
  type GlobeCountry,
} from '@/lib/geo/globe-countries';
import { cn } from '@/lib/utils';

/**
 * The globe on the home page.
 *
 * WHAT IT IS FOR. The hero used to show one trending photograph. The site's
 * owner wanted the first thing a visitor sees to be the world itself: a globe
 * that turns, with every country drawn, a point of light on each, that stops
 * on the country the visitor is in and lets them pick any other — by clicking
 * it, or by typing its name in the box above.
 *
 * HOW IT IS DRAWN. On a canvas, with d3's orthographic projection: a real
 * sphere, correctly foreshortened, that every country polygon is projected
 * onto. Not WebGL. The map picker on the upload page already assumes a browser
 * that cannot run WebGL, and a globe that needs it would be the one thing on
 * the home page that could fail to appear. A 2D canvas never does. The
 * shading — a lit sphere, a soft atmosphere — is radial gradients, which is
 * all a sphere needs to read as one.
 *
 * WHERE IT STOPS. The server reads the visitor's country from the network
 * (`visitorPlace()`, the same reading the map section uses) and passes the
 * code down. When the shapes have loaded, the globe turns to that country
 * over about a second and a half, selects it, and rests. A visitor the network
 * cannot place sees it turning slowly until they touch it. A visitor who has
 * asked their system for reduced motion sees it already turned, and still.
 *
 * THE CALLOUT. The chosen country is named the way an atlas names a place too
 * small to write on: a line from its point on the sphere, up and out, to a
 * short shelf with the name sitting on it — flag, name, how many places. No
 * box. There was a card across the bottom of the globe first, and then a pill
 * at the end of the line, and the site's owner was right about both: anything
 * with a background covers the country it is meant to point at. Plain type
 * with a faint halo of the paper colour behind it reads over land and sea in
 * either theme and hides nothing. The line and the label are laid out again on
 * every frame from the projected point, so they turn with the sphere, on the
 * side of the point with room. The label is the link to the country's places.
 * Only the chosen country is called out; a hundred and seventy-seven labels
 * would be a different, worse picture.
 *
 * ZOOM. Three ways, because each is what one kind of reader reaches for: the
 * + and − buttons, a pinch on a touch screen or a trackpad (which browsers
 * deliver as a wheel event with ctrl held), and ctrl- or ⌘-wheel with a mouse.
 * A bare wheel scrolls the page, as it should — a hero that captured the
 * scroll wheel would trap every reader who merely passed over it.
 *
 * THE DOTS. One on every country, at the polygon's centre, on the half of the
 * sphere facing the viewer. Countries where FRAME has an approved place carry
 * the accent colour and breathe; the rest are small and quiet, so the pattern
 * reads as "everywhere is here, and here is where there is work" rather than
 * as a hundred and seventy-seven alarms. Each breathes on its own phase, so the
 * whole thing shimmers instead of blinking in step.
 *
 * COLOUR comes from the page's own tokens, read from the document at mount and
 * again whenever the theme changes, so the globe is the same object in light
 * and dark rather than one picture with two palettes bolted on.
 */

export interface HomeGlobeProps {
  /** ISO alpha-2 → how many approved places FRAME has there. */
  placesByCountry: Record<string, number>;
  /** The visitor's country from the network, or null when it could not be placed. */
  visitorCountry: string | null;
  locale: string;
  className?: string;
}

/** Degrees of longitude per frame while idling. Slow enough to read a coastline. */
const IDLE_SPIN = 0.055;
/** Degrees of rotation per pixel dragged, at zoom 1; divided by the zoom after that. */
const DRAG_SENSITIVITY = 0.28;
/** A pointer that moves further than this before release is dragging, not clicking. */
const CLICK_SLOP = 4;
const FLY_MS = 1500;
/** Latitude the globe will not be dragged past: the poles stay on the sphere. */
const MAX_TILT = 72;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3.6;
/** One press of + or −. */
const ZOOM_STEP = 1.35;
/** How far out and up from the point the leader goes before the label's shelf. */
const LEADER_OUT = 30;
const LEADER_UP = 22;
/** Air between the text and the shelf line it sits on. */
const SHELF_GAP = 3;
/** The label never comes closer than this to the container's edge. */
const LABEL_MARGIN = 8;

interface Palette {
  ocean: string;
  oceanLit: string;
  land: string;
  landWithPlaces: string;
  landHover: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentStrong: string;
  muted: string;
  graticule: string;
  halo: string;
}

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** The page's tokens, as the canvas needs them. Read on the client only. */
function readPalette(): Palette {
  return {
    ocean: token('--color-surface-sunken', '#22241c'),
    oceanLit: token('--color-surface', '#1c1e17'),
    land: token('--color-ink-surface-soft', '#343930'),
    landWithPlaces: token('--color-line-inverse', '#4a4e40'),
    landHover: token('--color-line-strong', '#434639'),
    border: token('--color-line', '#32352b'),
    borderStrong: token('--color-muted-soft', '#85887d'),
    accent: token('--color-accent', '#c8ea4e'),
    accentStrong: token('--color-accent-strong', '#b7db44'),
    muted: token('--color-muted-soft', '#85887d'),
    graticule: token('--color-line', '#32352b'),
    halo: token('--color-accent', '#c8ea4e'),
  };
}

/** `#rrggbb` → `rgba(r,g,b,a)`; anything else is returned untouched. */
function withAlpha(colour: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)?.[1];
  if (!hex) return colour;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** The shortest way round from one longitude rotation to another. */
function shortestDelta(from: number, to: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  if (delta < -180) delta += 360;
  return delta;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * The flag as the two regional-indicator characters every platform's emoji
 * set understands. No image, no request, no third party. A platform without
 * flag emoji shows the two letters, which is still the country.
 */
function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join('');
}

type Motion =
  | { kind: 'spin' }
  | { kind: 'fly'; from: [number, number]; to: [number, number]; start: number; then: 'rest' }
  | { kind: 'rest' };

interface PointerState {
  id: number;
  x: number;
  y: number;
}

export function HomeGlobe({ placesByCountry, visitorCountry, locale, className }: HomeGlobeProps) {
  const t = useTranslations('home.globe');
  const theme = useResolvedTheme();
  const listId = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The callout is positioned by hand every frame, like the canvas.
  const leaderRef = useRef<SVGPathElement | null>(null);
  const leaderGlowRef = useRef<SVGPathElement | null>(null);
  const anchorRef = useRef<SVGCircleElement | null>(null);
  const anchorRingRef = useRef<SVGCircleElement | null>(null);
  const labelRef = useRef<HTMLAnchorElement | null>(null);

  const [countries, setCountries] = useState<GlobeCountry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<GlobeCountry | null>(null);
  const [hovered, setHovered] = useState<GlobeCountry | null>(null);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Everything the animation loop reads lives in refs: a frame must never wait
  // on a React render, and a render must never restart the loop.
  const rotation = useRef<[number, number]>([-100, -15]);
  const zoom = useRef(1);
  const motion = useRef<Motion>({ kind: 'spin' });
  const palette = useRef<Palette | null>(null);
  const reducedMotion = useRef(false);
  const size = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const hoveredRef = useRef<GlobeCountry | null>(null);
  const selectedRef = useRef<GlobeCountry | null>(null);
  // Every pointer currently down on the canvas. One drags; two pinch.
  const pointers = useRef<Map<number, PointerState>>(new Map());
  const gesture = useRef<{ dragged: boolean; pinchDistance: number | null }>({
    dragged: false,
    pinchDistance: null,
  });
  const frame = useRef<number | null>(null);

  const graticule = useMemo(() => geoGraticule10(), []);

  useEffect(() => {
    palette.current = readPalette();
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedMotion.current = media.matches;
      if (media.matches && motion.current.kind === 'spin') motion.current = { kind: 'rest' };
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Turning to a country, and zooming                                   */
  /* ------------------------------------------------------------------ */

  const flyTo = useCallback((country: GlobeCountry) => {
    const [lon, lat] = country.centroid;
    const to: [number, number] = [-lon, -clamp(lat, -MAX_TILT, MAX_TILT)];
    if (reducedMotion.current) {
      rotation.current = to;
      motion.current = { kind: 'rest' };
      return;
    }
    motion.current = {
      kind: 'fly',
      from: [rotation.current[0], rotation.current[1]],
      to,
      start: performance.now(),
      then: 'rest',
    };
  }, []);

  const zoomBy = useCallback((factor: number) => {
    zoom.current = clamp(zoom.current * factor, MIN_ZOOM, MAX_ZOOM);
    // A reader zooming in is looking at something; the globe must not carry
    // it away from under them.
    if (motion.current.kind === 'spin') motion.current = { kind: 'rest' };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGlobeCountries()
      .then((loaded) => {
        if (cancelled) return;
        setCountries(loaded);
        // Straight to the visitor's country, once, as the shapes arrive. The
        // country is a server-rendered prop and does not change afterwards.
        const home = findCountry(loaded, visitorCountry);
        if (home) {
          selectedRef.current = home;
          setSelected(home);
          flyTo(home);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visitorCountry, flyTo]);

  const choose = useCallback(
    (country: GlobeCountry) => {
      selectedRef.current = country;
      setSelected(country);
      flyTo(country);
    },
    [flyTo],
  );

  // Wheel zoom, only with ctrl or ⌘ held. Registered by hand because the
  // listener must be non-passive to stop the page scrolling as well, and React
  // registers wheel listeners as passive.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.0022));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  /* ------------------------------------------------------------------ */
  /* Sizing                                                              */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w: width, h: height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ------------------------------------------------------------------ */
  /* The projection for the current size, rotation and zoom             */
  /* ------------------------------------------------------------------ */

  const projectionFor = useCallback(() => {
    const { w, h } = size.current;
    const radius = Math.max(10, Math.min(w, h) / 2 - 14) * zoom.current;
    return geoOrthographic()
      .translate([w / 2, h / 2])
      .scale(radius)
      .rotate([rotation.current[0], rotation.current[1], 0])
      .clipAngle(90);
  }, []);

  /* ------------------------------------------------------------------ */
  /* The callout: a line from the point to a label beside it             */
  /* ------------------------------------------------------------------ */

  const layoutCallout = useCallback(
    (projection: ReturnType<typeof geoOrthographic>, country: GlobeCountry | null) => {
      const label = labelRef.current;
      const leader = leaderRef.current;
      const glow = leaderGlowRef.current;
      const anchor = anchorRef.current;
      const ring = anchorRingRef.current;
      if (!label || !leader || !glow || !anchor || !ring) return;

      const hide = () => {
        label.style.visibility = 'hidden';
        leader.setAttribute('d', '');
        glow.setAttribute('d', '');
        anchor.setAttribute('r', '0');
        ring.setAttribute('r', '0');
      };

      if (!country) {
        hide();
        return;
      }

      // On the far side of the sphere there is nothing to point at.
      const centre: [number, number] = [-rotation.current[0], -rotation.current[1]];
      if (geoDistance(country.centroid, centre) > Math.PI / 2 - 0.03) {
        hide();
        return;
      }
      const point = projection(country.centroid);
      if (!point) {
        hide();
        return;
      }

      const { w, h } = size.current;
      const [px, py] = point;
      const [cx] = projection.translate();
      const labelW = label.offsetWidth;
      const labelH = label.offsetHeight;

      // The side with room: a point on the left half is labelled to its left.
      // The shelf's near end is up and out from the point; the text sits on
      // the shelf, which runs under its whole width.
      const toRight = px >= cx;
      const nearX = toRight ? px + LEADER_OUT : px - LEADER_OUT;
      let labelX = toRight ? nearX : nearX - labelW;
      labelX = clamp(labelX, LABEL_MARGIN, w - labelW - LABEL_MARGIN);
      const labelY = clamp(py - LEADER_UP - labelH - SHELF_GAP, LABEL_MARGIN, h - labelH - SHELF_GAP - LABEL_MARGIN);
      const shelfY = labelY + labelH + SHELF_GAP;
      const shelfNearX = toRight ? labelX : labelX + labelW;
      const shelfFarX = toRight ? labelX + labelW : labelX;

      // Point → diagonal up to the shelf's near end → along the shelf under
      // the text. When the label was pushed back inside the box the first leg
      // is simply a different diagonal; the rounded join keeps it one line.
      const d = `M ${px.toFixed(1)} ${py.toFixed(1)} L ${shelfNearX.toFixed(1)} ${shelfY.toFixed(1)} L ${shelfFarX.toFixed(1)} ${shelfY.toFixed(1)}`;
      leader.setAttribute('d', d);
      glow.setAttribute('d', d);
      anchor.setAttribute('cx', px.toFixed(1));
      anchor.setAttribute('cy', py.toFixed(1));
      anchor.setAttribute('r', '3');
      ring.setAttribute('cx', px.toFixed(1));
      ring.setAttribute('cy', py.toFixed(1));
      ring.setAttribute('r', '7');

      label.style.transform = `translate(${labelX.toFixed(1)}px, ${labelY.toFixed(1)}px)`;
      label.style.visibility = 'visible';
    },
    [],
  );

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */

  const draw = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      const colours = palette.current;
      if (!canvas || !colours) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const { w, h, dpr } = size.current;
      if (w === 0 || h === 0) return;

      // Advance the motion before drawing it.
      const current = motion.current;
      if (current.kind === 'spin') {
        rotation.current[0] = (rotation.current[0] + IDLE_SPIN) % 360;
      } else if (current.kind === 'fly') {
        const progress = Math.min(1, (now - current.start) / FLY_MS);
        const eased = easeInOutCubic(progress);
        const dLon = shortestDelta(current.from[0], current.to[0]);
        rotation.current = [
          current.from[0] + dLon * eased,
          current.from[1] + (current.to[1] - current.from[1]) * eased,
        ];
        if (progress >= 1) motion.current = { kind: current.then };
      }

      const projection = projectionFor();
      const path = geoPath(projection, context);
      const radius = projection.scale();
      const [cx, cy] = projection.translate();

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, w, h);

      // Atmosphere: a halo just outside the limb, fading to nothing.
      const halo = context.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.16);
      halo.addColorStop(0, withAlpha(colours.halo, 0.2));
      halo.addColorStop(0.45, withAlpha(colours.halo, 0.06));
      halo.addColorStop(1, withAlpha(colours.halo, 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
      context.fill();

      // The sphere, lit from the upper left.
      const sea = context.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.4,
        radius * 0.1,
        cx,
        cy,
        radius,
      );
      sea.addColorStop(0, colours.oceanLit);
      sea.addColorStop(1, colours.ocean);
      context.fillStyle = sea;
      context.beginPath();
      path({ type: 'Sphere' });
      context.fill();

      // Graticule, faint.
      context.beginPath();
      path(graticule);
      context.strokeStyle = withAlpha(colours.graticule, 0.55);
      context.lineWidth = 0.5;
      context.stroke();

      // Land.
      const list = countries ?? [];
      const hoveredNow = hoveredRef.current;
      const selectedNow = selectedRef.current;
      for (const country of list) {
        const hasPlaces = country.code !== null && (placesByCountry[country.code] ?? 0) > 0;
        const isSelected = selectedNow !== null && selectedNow === country;
        const isHovered = hoveredNow !== null && hoveredNow === country;

        context.beginPath();
        path(country.feature);
        context.fillStyle = isSelected
          ? withAlpha(colours.accent, 0.42)
          : isHovered
            ? colours.landHover
            : hasPlaces
              ? colours.landWithPlaces
              : colours.land;
        context.fill();
        context.strokeStyle = isSelected ? colours.accentStrong : withAlpha(colours.border, 0.9);
        context.lineWidth = isSelected ? 1.2 : 0.5;
        context.stroke();
      }

      // Dots, on the facing hemisphere only. The chosen country's dot is the
      // callout's anchor instead, so it is not drawn twice.
      const centre: [number, number] = [-rotation.current[0], -rotation.current[1]];
      const breathe = reducedMotion.current ? 0.5 : 0.5 + 0.5 * Math.sin(now / 900);
      list.forEach((country, index) => {
        if (country === selectedNow) return;
        if (geoDistance(country.centroid, centre) > Math.PI / 2 - 0.02) return;
        const point = projection(country.centroid);
        if (!point) return;
        const hasPlaces = country.code !== null && (placesByCountry[country.code] ?? 0) > 0;
        const phase = reducedMotion.current
          ? 0.5
          : 0.5 + 0.5 * Math.sin(now / 900 + index * 0.9);
        const [x, y] = point;

        if (hasPlaces) {
          // A soft ring that grows and fades, then the point itself.
          context.beginPath();
          context.arc(x, y, 4 + phase * 5, 0, Math.PI * 2);
          context.fillStyle = withAlpha(colours.accent, 0.28 * (1 - phase) + 0.05);
          context.fill();
          context.beginPath();
          context.arc(x, y, 2.6 + phase * 0.8, 0, Math.PI * 2);
          context.fillStyle = colours.accent;
          context.fill();
        } else {
          context.beginPath();
          context.arc(x, y, 1.2 + phase * 0.5, 0, Math.PI * 2);
          context.fillStyle = withAlpha(colours.muted, 0.45 + breathe * 0.25);
          context.fill();
        }
      });

      // The limb, drawn last so it sits over everything.
      context.beginPath();
      path({ type: 'Sphere' });
      context.strokeStyle = withAlpha(colours.borderStrong, 0.5);
      context.lineWidth = 1;
      context.stroke();

      context.restore();

      layoutCallout(projection, selectedNow);
    },
    [countries, graticule, placesByCountry, projectionFor, layoutCallout],
  );

  // One loop for the life of the component. It runs every frame while
  // anything moves; at rest with reduced motion it draws once and waits.
  useEffect(() => {
    let running = true;
    const tick = (now: number) => {
      if (!running) return;
      draw(now);
      const still = motion.current.kind === 'rest' && reducedMotion.current;
      if (!still) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [draw]);

  // Something changed that a resting, reduced-motion globe would not notice.
  useEffect(() => {
    if (frame.current === null) frame.current = requestAnimationFrame((now) => draw(now));
  }, [draw, selected, hovered, theme]);

  /* ------------------------------------------------------------------ */
  /* Pointer: drag with one, pinch with two, click to choose             */
  /* ------------------------------------------------------------------ */

  const countryAt = useCallback(
    (clientX: number, clientY: number): GlobeCountry | null => {
      const canvas = canvasRef.current;
      if (!canvas || !countries) return null;
      const rect = canvas.getBoundingClientRect();
      const point = projectionFor().invert?.([clientX - rect.left, clientY - rect.top]);
      if (!point) return null;
      // Behind the sphere, the inverse still answers; the distance check is
      // what says whether the point is on the face we can see.
      const centre: [number, number] = [-rotation.current[0], -rotation.current[1]];
      if (geoDistance(point, centre) > Math.PI / 2) return null;
      for (const country of countries) {
        if (geoContains(country.feature, point)) return country;
      }
      return null;
    },
    [countries, projectionFor],
  );

  const pinchDistance = (): number | null => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return null;
    return Math.hypot(b.x - a.x, b.y - a.y);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    // Capture keeps a drag alive when the pointer leaves the canvas. Firefox
    // throws if the pointer is already gone by the time this runs; a failed
    // capture is a drag that ends at the edge, not a reason to stop handling.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* no capture */
    }
    pointers.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { dragged: false, pinchDistance: null };
    } else {
      // A second finger: whatever the first was doing becomes a pinch.
      gesture.current = { dragged: true, pinchDistance: pinchDistance() };
      motion.current = { kind: 'rest' };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const known = pointers.current.get(event.pointerId);

    if (known && pointers.current.size >= 2) {
      known.x = event.clientX;
      known.y = event.clientY;
      const next = pinchDistance();
      const previous = gesture.current.pinchDistance;
      if (next !== null && previous !== null && previous > 0) zoomBy(next / previous);
      gesture.current.pinchDistance = next;
      return;
    }

    if (known) {
      const dx = event.clientX - known.x;
      const dy = event.clientY - known.y;
      if (!gesture.current.dragged && Math.hypot(dx, dy) > CLICK_SLOP) {
        gesture.current.dragged = true;
      }
      if (gesture.current.dragged) {
        // A hand on the globe stops it: nothing should turn under a finger.
        // Zoomed in, the same drag covers less of the sphere, so it turns less.
        motion.current = { kind: 'rest' };
        const k = DRAG_SENSITIVITY / zoom.current;
        rotation.current = [
          rotation.current[0] + dx * k,
          clamp(rotation.current[1] - dy * k, -MAX_TILT, MAX_TILT),
        ];
        known.x = event.clientX;
        known.y = event.clientY;
      }
      return;
    }

    const next = countryAt(event.clientX, event.clientY);
    if (next !== hoveredRef.current) {
      hoveredRef.current = next;
      setHovered(next);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const wasPinching = pointers.current.size >= 2;
    pointers.current.delete(event.pointerId);
    if (wasPinching) {
      // The finger that stays must not be read as the start of a drag from
      // wherever the other one was.
      gesture.current = { dragged: true, pinchDistance: null };
      return;
    }
    if (!gesture.current.dragged) {
      const hit = countryAt(event.clientX, event.clientY);
      if (hit && hit.code) choose(hit);
    }
    gesture.current = { dragged: false, pinchDistance: null };
  };

  const onPointerLeave = () => {
    if (hoveredRef.current) {
      hoveredRef.current = null;
      setHovered(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Search                                                              */
  /* ------------------------------------------------------------------ */

  const results = useMemo(
    () => (countries ? searchCountries(countries, query, locale) : []),
    [countries, query, locale],
  );

  const pick = (country: GlobeCountry) => {
    choose(country);
    setQuery('');
    setListOpen(false);
    setActiveIndex(0);
    inputRef.current?.blur();
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen || results.length === 0) {
      if (event.key === 'Escape') setQuery('');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = results[activeIndex] ?? results[0];
      if (chosen) pick(chosen);
    } else if (event.key === 'Escape') {
      setListOpen(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* What is said about the chosen country                               */
  /* ------------------------------------------------------------------ */

  const selectedName = selected ? countryName(selected, locale) : null;
  const selectedCount = selected?.code ? (placesByCountry[selected.code] ?? 0) : 0;
  // The places index searches the stored English country name, which is what
  // a geocoder fills in, so the link carries that rather than the code.
  const selectedEnglish = selected ? countryName(selected, 'en') : null;
  const hoveredName = hovered && hovered !== selected ? countryName(hovered, locale) : null;
  const isHome = selected !== null && selected.code !== null && selected.code === visitorCountry;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* The search, above the globe. A combobox: type, arrow, Enter. */}
      <div className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
          {t('searchLabel')}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
        />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={listOpen && results.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            listOpen && results[activeIndex] ? `${listId}-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          value={query}
          placeholder={t('searchPlaceholder')}
          disabled={!countries}
          onChange={(event) => {
            setQuery(event.target.value);
            setListOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => window.setTimeout(() => setListOpen(false), 120)}
          onKeyDown={onSearchKey}
          className={cn(
            'h-11 w-full rounded-pill border border-line bg-surface pr-4 pl-10 text-caption text-ink',
            'placeholder:text-muted focus-visible:border-line-strong focus-visible:outline-none',
            'disabled:opacity-60',
          )}
        />
        {listOpen && results.length > 0 ? (
          <ul
            id={`${listId}-list`}
            role="listbox"
            className={cn(
              'absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-card border border-line',
              'bg-surface shadow-popover',
            )}
          >
            {results.map((country, index) => {
              const count = country.code ? (placesByCountry[country.code] ?? 0) : 0;
              return (
                <li
                  key={country.code ?? country.atlasName}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(country);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-caption',
                    index === activeIndex ? 'bg-surface-sunken text-ink' : 'text-ink-soft',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    {country.code ? (
                      <span aria-hidden className="text-[1.05rem] leading-none">
                        {flagEmoji(country.code)}
                      </span>
                    ) : null}
                    {countryName(country, locale)}
                  </span>
                  {count > 0 ? (
                    <span className="shrink-0 text-meta text-muted tabular-nums">
                      {t('placesShort', { count })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* The globe. */}
      <div
        ref={containerRef}
        className="relative h-[300px] overflow-hidden rounded-media min-[650px]:h-[330px] min-[950px]:h-[390px]"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={selectedName ? t('canvasLabelSelected', { country: selectedName }) : t('canvasLabel')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          className={cn(
            'block h-full w-full touch-none select-none',
            hovered?.code ? 'cursor-pointer' : 'cursor-grab',
          )}
        />

        {/* The leader line and its anchor, over the canvas and under the label.
            Laid out by `layoutCallout` every frame; empty until something is
            chosen and on the facing side. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <path
            ref={leaderGlowRef}
            d=""
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.28"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            ref={leaderRef}
            d=""
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            ref={anchorRingRef}
            r="0"
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
          <circle ref={anchorRef} r="0" fill="var(--color-accent)" />
        </svg>

        {/* The label: flag, name, how many places. The whole thing is the link
            to the country's places. Positioned by `layoutCallout`; hidden until
            it has somewhere to be. */}
        {selected && selectedName && selected.code && selectedEnglish ? (
          <Link
            ref={labelRef}
            href={`/locations?search=${encodeURIComponent(selectedEnglish)}`}
            aria-live="polite"
            style={{ visibility: 'hidden' }}
            // No box. A halo of the paper colour behind the letters is what
            // keeps them legible over land and sea, in both themes, without
            // covering either.
            className={cn(
              'group absolute top-0 left-0 flex items-start gap-1.5 px-1 pb-0.5',
              '[text-shadow:0_0_6px_var(--color-paper),0_0_12px_var(--color-paper),0_1px_2px_var(--color-paper)]',
            )}
          >
            <span aria-hidden className="mt-px text-[1rem] leading-none">
              {flagEmoji(selected.code)}
            </span>
            <span className="min-w-0 leading-tight">
              {isHome ? (
                <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted uppercase">
                  {t('yourCountry')}
                </span>
              ) : null}
              <span className="flex items-center gap-1 text-caption font-semibold text-ink group-hover:underline">
                {selectedName}
                <ArrowUpRight aria-hidden className="size-3 shrink-0 text-muted group-hover:text-ink" />
              </span>
              <span className="block text-meta text-muted tabular-nums">
                {selectedCount > 0 ? t('placesShort', { count: selectedCount }) : t('noPlaces')}
              </span>
            </span>
            <span className="sr-only">{t('browse', { country: selectedName })}</span>
          </Link>
        ) : null}

        {/* Zoom. */}
        <div
          className={cn(
            'absolute top-3 right-3 flex flex-col overflow-hidden rounded-card border border-line',
            'bg-surface/92 shadow-popover backdrop-blur-sm',
          )}
        >
          <button
            type="button"
            aria-label={t('zoomIn')}
            title={t('zoomIn')}
            onClick={() => zoomBy(ZOOM_STEP)}
            className="grid size-8 place-items-center text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <Plus aria-hidden className="size-4" />
          </button>
          <span aria-hidden className="h-px bg-line" />
          <button
            type="button"
            aria-label={t('zoomOut')}
            title={t('zoomOut')}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            className="grid size-8 place-items-center text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <Minus aria-hidden className="size-4" />
          </button>
        </div>

        {!countries && !failed ? (
          <p className="absolute inset-x-0 bottom-4 text-center text-meta text-muted">
            {t('loading')}
          </p>
        ) : null}
        {failed ? (
          <p className="absolute inset-x-4 bottom-4 text-center text-meta text-muted">
            {t('failed')}
          </p>
        ) : null}

        {/* The country under the pointer, named. */}
        {hoveredName ? (
          <p
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-3 left-3 rounded-pill border border-line bg-surface/92',
              'px-3 py-1.5 text-meta text-ink-soft backdrop-blur-sm',
            )}
          >
            {hoveredName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
