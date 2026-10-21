'use client';

import { geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { ArrowUpRight, Search } from 'lucide-react';
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
  /** The box the globe fills; the canvas takes its height from it. */
  className?: string;
}

/** Degrees of longitude per frame while idling. Slow enough to read a coastline. */
const IDLE_SPIN = 0.055;
/** Degrees of rotation per pixel dragged. */
const DRAG_SENSITIVITY = 0.28;
/** A pointer that moves further than this before release is dragging, not clicking. */
const CLICK_SLOP = 4;
const FLY_MS = 1500;
/** Latitude the globe will not be dragged past: the poles stay on the sphere. */
const MAX_TILT = 72;

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

type Motion =
  | { kind: 'spin' }
  | { kind: 'fly'; from: [number, number]; to: [number, number]; start: number; then: 'rest' }
  | { kind: 'rest' };

export function HomeGlobe({ placesByCountry, visitorCountry, locale, className }: HomeGlobeProps) {
  const t = useTranslations('home.globe');
  const theme = useResolvedTheme();
  const listId = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
  const motion = useRef<Motion>({ kind: 'spin' });
  const palette = useRef<Palette | null>(null);
  const reducedMotion = useRef(false);
  const size = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const hoveredRef = useRef<GlobeCountry | null>(null);
  const selectedRef = useRef<GlobeCountry | null>(null);
  const pointer = useRef<{ x: number; y: number; dragged: boolean; active: boolean } | null>(null);
  const frame = useRef<number | null>(null);

  const graticule = useMemo(() => geoGraticule10(), []);

  /* ------------------------------------------------------------------ */
  /* Loading                                                             */
  /* ------------------------------------------------------------------ */


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
  /* Turning to a country                                                */
  /* ------------------------------------------------------------------ */

  const flyTo = useCallback((country: GlobeCountry) => {
    const [lon, lat] = country.centroid;
    const to: [number, number] = [-lon, -Math.max(-MAX_TILT, Math.min(MAX_TILT, lat))];
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
  /* The projection for the current size and rotation                   */
  /* ------------------------------------------------------------------ */

  const projectionFor = useCallback(() => {
    const { w, h } = size.current;
    const radius = Math.max(10, Math.min(w, h) / 2 - 14);
    return geoOrthographic()
      .translate([w / 2, h / 2])
      .scale(radius)
      .rotate([rotation.current[0], rotation.current[1], 0])
      .clipAngle(90);
  }, []);

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

      // Dots, on the facing hemisphere only.
      const centre: [number, number] = [-rotation.current[0], -rotation.current[1]];
      const breathe = reducedMotion.current ? 0.5 : 0.5 + 0.5 * Math.sin(now / 900);
      list.forEach((country, index) => {
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
    },
    [countries, graticule, placesByCountry, projectionFor],
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
  /* Pointer                                                             */
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

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { x: event.clientX, y: event.clientY, dragged: false, active: true };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const state = pointer.current;
    if (state?.active) {
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.dragged && Math.hypot(dx, dy) > CLICK_SLOP) state.dragged = true;
      if (state.dragged) {
        // A hand on the globe stops it: nothing should turn under a finger.
        motion.current = { kind: 'rest' };
        rotation.current = [
          rotation.current[0] + dx * DRAG_SENSITIVITY,
          Math.max(-MAX_TILT, Math.min(MAX_TILT, rotation.current[1] - dy * DRAG_SENSITIVITY)),
        ];
        state.x = event.clientX;
        state.y = event.clientY;
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
    const state = pointer.current;
    pointer.current = null;
    if (!state) return;
    if (!state.dragged) {
      const hit = countryAt(event.clientX, event.clientY);
      if (hit && hit.code) choose(hit);
    }
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
                  <span>{countryName(country, locale)}</span>
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

        {/* The chosen country, anchored to the bottom like the caption the
            photograph used to carry here. */}
        {selected && selectedName ? (
          <div
            aria-live="polite"
            className={cn(
              'absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 rounded-card',
              'border border-line bg-surface/92 px-4 py-3 backdrop-blur-sm',
            )}
          >
            <div className="min-w-0">
              <p className="text-eyebrow text-muted uppercase">
                {selected.code === visitorCountry ? t('yourCountry') : t('selected')}
              </p>
              <p className="mt-0.5 truncate text-body font-semibold text-ink">{selectedName}</p>
              <p className="mt-0.5 text-meta text-muted tabular-nums">
                {selectedCount > 0 ? t('places', { count: selectedCount }) : t('noPlaces')}
              </p>
            </div>
            {selectedEnglish ? (
              <Link
                href={`/locations?search=${encodeURIComponent(selectedEnglish)}`}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-ink px-3.5 py-2',
                  'text-caption font-semibold text-on-ink transition-opacity hover:opacity-90',
                )}
              >
                {t('browse')}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
