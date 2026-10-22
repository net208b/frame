import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
} from 'maplibre-gl';

import { isMapConfigured, MAP_DISABLED, publicEnv } from '@/lib/config';
import type { BasemapTheme, BasemapVariant } from '@/lib/map/basemap';

/**
 * Everything FRAME's map surfaces assume about the map under the pins, and
 * every paint property of the pins themselves.
 *
 * FRAME draws its own basemap — see `src/lib/map/basemap.ts` for the style and
 * `src/app/basemap/[variant]/route.ts` for the four URLs it is served at — so
 * the default here is a map rather than an apology. Two rules still shape this
 * module:
 *
 * 1. Nothing outside it names a tile host, a glyph set or a paint colour, so
 *    moving to a paid provider stays a configuration change. Setting
 *    `NEXT_PUBLIC_MAP_STYLE_URL` to that provider's style replaces FRAME's own,
 *    and setting it to `off` draws no map at all — for an operator who does not
 *    want the browser calling a tile host they have not chosen.
 * 2. Attribution is a licence condition rather than a courtesy. The built-in
 *    basemap's credit arrives with its tiles and MapLibre shows it unprompted,
 *    so FRAME adds nothing to it. A configured provider is a different matter:
 *    only the operator knows what that provider requires, so a style URL with
 *    no `NEXT_PUBLIC_MAP_ATTRIBUTION` beside it is called out in the interface
 *    rather than quietly ignored.
 */

export const MAP_STYLE_ENV_VAR = 'NEXT_PUBLIC_MAP_STYLE_URL';
export const MAP_ATTRIBUTION_ENV_VAR = 'NEXT_PUBLIC_MAP_ATTRIBUTION';
export const MAP_PROVIDER_DOC = 'docs/EXTERNAL-SERVICES.md';

/** True when neither a provider's style nor `off` was configured. */
function usingBuiltInBasemap(): boolean {
  return publicEnv().mapStyleUrl === null;
}

/**
 * The style document for a variant, or null when maps are switched off.
 *
 * The variant is a parameter rather than a module-level constant because the
 * right style depends on the reader: their language, and whether they are
 * reading the light theme or the dark one.
 */
export function mapStyleUrl(variant: BasemapVariant): string | null {
  const configured = publicEnv().mapStyleUrl;
  if (configured === MAP_DISABLED) return null;
  return configured ?? `/basemap/${variant}`;
}

/**
 * The operator's own credit line, added to whatever the map's source already
 * carries — nothing when they have not set one.
 *
 * The built-in basemap deliberately gets none from here. Its tiles arrive with
 * the OpenFreeMap / OpenMapTiles / OpenStreetMap credit in their TileJSON and
 * MapLibre's attribution control prints it; anything added here would print
 * beside it rather than instead of it, and the map would carry the same credit
 * twice.
 */
export function mapAttribution(): string | null {
  return publicEnv().mapAttribution;
}

/**
 * Whether the interface should say that a credit is missing.
 *
 * Only for a map pointed at a provider's own style with no attribution beside
 * it: that is the case where FRAME cannot know the licence condition and the
 * operator has to be told. The built-in basemap is never missing a credit, and
 * a map that is switched off has nothing to credit.
 */
export function isAttributionMissing(): boolean {
  if (!isMapConfigured()) return false;
  return !usingBuiltInBasemap() && publicEnv().mapAttribution === null;
}

/**
 * The query parameter carrying the chosen place, so a map view is a shareable
 * URL rather than hidden client state.
 *
 * It lives here rather than in MapExplorer because the page reads it on the
 * server to render a shared link already selected, and a `'use client'` module's
 * exports are client references on the server, not values.
 *
 * `place` is the /map page's key and is published in shared links, so it stays.
 * It is NOT usable on every page: Discover already spends `place` on its own
 * text filter, and a pin writing a slug into it would be read back as a search
 * term. A page in that position passes `selectionParam` to MapExplorer instead
 * — see {@link DISCOVER_SELECTED_PARAM}.
 */
export const SELECTED_PARAM = 'place';

/**
 * The same thing on Discover, whose `place` means "narrow to places matching
 * this text". Deliberately a different word rather than a clever reuse: the two
 * values are a search term and a slug, and nothing can tell them apart once
 * they are in the same key.
 */
export const DISCOVER_SELECTED_PARAM = 'selected';

/* ------------------------------------------------------------------------ */
/* Camera defaults                                                           */
/* ------------------------------------------------------------------------ */

/** A world view, used only when there is nothing to frame. */
export const MAP_DEFAULT_CENTER: [number, number] = [8, 26];
export const MAP_DEFAULT_ZOOM = 1.3;
/** Fitting to the pins must not land inside a single street. */
export const MAP_FIT_MAX_ZOOM = 9;
export const MAP_MOVE_DURATION_MS = 480;

/* ------------------------------------------------------------------------ */
/* Source and layers                                                         */
/* ------------------------------------------------------------------------ */

export const MAP_SOURCE_ID = 'frame-locations';

export const MAP_LAYERS = {
  clusters: 'frame-clusters',
  clusterCount: 'frame-cluster-count',
  /** The soft glow under every pin, which is what makes a lime dot read as lit. */
  glow: 'frame-glow',
  /** Drawn under the pins so a selected pin keeps its own colour. */
  selection: 'frame-selection',
  /** Between selection and points: a pointer-only echo of the selection ring. */
  hover: 'frame-hover',
  points: 'frame-points',
} as const;

/** Every overlay layer, bottom to top, as `addLayer` must be called. */
export const MAP_OVERLAY_ORDER = [
  MAP_LAYERS.glow,
  MAP_LAYERS.clusters,
  MAP_LAYERS.clusterCount,
  MAP_LAYERS.selection,
  MAP_LAYERS.hover,
  MAP_LAYERS.points,
] as const;

export const MAP_CLUSTER = {
  radius: 48,
  /** Past this zoom every pin stands on its own. */
  maxZoom: 12,
} as const;

/**
 * The shallowest zoom at which a chosen pin is certain to be drawn in its own
 * right rather than folded into a cluster. Revealing a selection at anything
 * less would ring a cluster the viewer did not choose.
 */
export const MAP_SELECTION_ZOOM = MAP_CLUSTER.maxZoom + 1;

/**
 * Glyph names, not font files: MapLibre asks the style's own glyph endpoint for
 * these. This is the font FRAME's basemap serves, and the one its glyph host
 * actually has — the MapLibre/Mapbox default `Open Sans Regular` is not there,
 * and a missing glyph range is a 404 per tile rather than a fallback. A
 * provider that names its fonts differently is a one-line change here.
 */
export const MAP_FONT_STACK: string[] = ['Noto Sans Regular'];

/**
 * A WebGL paint property cannot read a CSS custom property, so the tokens from
 * `globals.css` are mirrored here — both themes, because the pins sit on
 * FRAME's own basemap and have to hold against either ground.
 *
 * The lime is the accent at the strength each theme uses it: full `#d9ff56` on
 * paper, taken down to `#c8ea4e` on the night ground, where full strength is a
 * highlighter. The ring is what separates a pin from the map under it, so it is
 * the page's own surface colour rather than a fixed white: a white ring on the
 * dark basemap reads as a second, brighter dot.
 */
const PIN_COLOURS: Record<BasemapTheme, {
  accent: string;
  accentStrong: string;
  ring: string;
  cluster: string;
  clusterRing: string;
  clusterText: string;
  selection: string;
}> = {
  light: {
    accent: '#d9ff56',
    accentStrong: '#c2e63d',
    ring: '#ffffff',
    cluster: '#1c1e19',
    clusterRing: '#ffffff',
    clusterText: '#f8f8f2',
    selection: '#171815',
  },
  dark: {
    accent: '#c8ea4e',
    accentStrong: '#b7db44',
    ring: '#1c1e17',
    cluster: '#f2f2ea',
    clusterRing: '#141610',
    clusterText: '#171815',
    selection: '#f2f2ea',
  },
};

/**
 * Whether this feature's position is deliberately imprecise.
 *
 * An absent flag counts as approximate. A bare `get` would make the style spec
 * assert the property's type at paint time and throw, taking the layer down;
 * and of the two fallbacks available, drawing a soft wide disc understates the
 * precision we hold, whereas a crisp dot would overstate it. Precision is a
 * privacy decision, so the error has to fall on this side.
 */
/**
 * Whether this pin is drawn as a photograph rather than as a dot.
 *
 * A place with a published frame gets a DOM marker (`photo-marker.ts`); a place
 * with none keeps the dot. The two must never draw over each other, so every
 * circle layer that stands for a single pin filters itself to the dots, and the
 * marker layer above is the only thing that draws the rest.
 */
const HAS_IMAGE: ExpressionSpecification = ['to-boolean', ['get', 'hasImage']];

/**
 * A single pin — not a cluster — that has no photograph to show.
 *
 * Typed as an expression rather than as a filter so it can be nested inside
 * one: a `FilterSpecification` is the whole of a layer's `filter`, and the
 * operands of `all` are expressions.
 */
const DOT_PIN: ExpressionSpecification = [
  'all',
  ['!', ['has', 'point_count']],
  ['!', HAS_IMAGE],
];

const IS_APPROXIMATE: ExpressionSpecification = [
  'any',
  ['!', ['has', 'isApproximate']],
  ['to-boolean', ['get', 'isApproximate']],
];

/** Radius of the exact dot and of the approximate disc, at the middle zoom. */
const PIN_RADIUS = { exact: 6, approximate: 13 } as const;

/**
 * One measurement of a pin — a radius, a ring width — in the two sizes the two
 * kinds of pin need, growing as the viewer comes in.
 *
 * A pin sized for the world view is a speck on a street, and one sized for a
 * street is a blot on the world, so every part of the pin runs through here and
 * they keep their proportions at every zoom.
 *
 * The nesting is the only order the style spec allows: one zoom interpolation
 * at the top, with the per-precision choice inside each of its outputs. The
 * reverse — a `case` picking between two interpolations — is rejected, because
 * a paint property may hold exactly one zoom curve. (The MapLibre validator in
 * `npm run check:map-style` is what says so; the layer simply fails to paint at
 * runtime, taking every pin with it.)
 */
function byPrecision(exact: number, approximate: number): ExpressionSpecification {
  const at = (factor: number): ExpressionSpecification => [
    'case',
    IS_APPROXIMATE,
    approximate * factor,
    exact * factor,
  ];

  return ['interpolate', ['linear'], ['zoom'], 3, at(0.8), 10, at(1), 16, at(1.45)];
}

/**
 * The glow.
 *
 * A blurred disc of the accent colour under every single pin, which is what
 * stops a 6-pixel dot disappearing into a street grid of the same value, and
 * what makes the night theme look lit rather than merely dark. `circle-blur`
 * is a cheap GPU gradient — no second source, no sprite, no image to load.
 *
 * It is drawn under the clusters as well so that a cluster of pins carries the
 * same warmth, but it is not drawn *for* clusters: the cluster disc is opaque
 * and would hide it anyway.
 */
export function glowLayer(theme: BasemapTheme): LayerSpecification {
  const colour = PIN_COLOURS[theme];

  return {
    id: MAP_LAYERS.glow,
    type: 'circle',
    source: MAP_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': colour.accent,
      'circle-radius': byPrecision(PIN_RADIUS.exact * 2.6, PIN_RADIUS.approximate * 1.5),
      'circle-blur': 1,
      // Stronger on the night ground, where there is more darkness for it to
      // bloom into, and where the accent is a step quieter to begin with.
      'circle-opacity': theme === 'dark' ? 0.45 : 0.28,
    },
  };
}

/** Clusters: a filled disc with a ring, sized by how much it holds. */
export function clusterLayers(theme: BasemapTheme): LayerSpecification[] {
  const colour = PIN_COLOURS[theme];

  return [
    {
      id: MAP_LAYERS.clusters,
      type: 'circle',
      source: MAP_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': colour.cluster,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-stroke-width': 2,
        'circle-stroke-color': colour.clusterRing,
        'circle-stroke-opacity': 0.9,
      },
    },
    {
      id: MAP_LAYERS.clusterCount,
      type: 'symbol',
      source: MAP_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': MAP_FONT_STACK,
        'text-size': 11,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': colour.clusterText,
      },
    },
  ];
}

/**
 * The single points.
 *
 * An exact pin is a lime dot with a ring the colour of the page. An approximate
 * one is deliberately not that: it is a wider, softer disc, because the point
 * stands for an area the member asked us not to pin down. Size and density
 * carry the difference as well as colour, and the legend names both.
 */
export function pointLayer(theme: BasemapTheme): LayerSpecification {
  const colour = PIN_COLOURS[theme];

  return {
    id: MAP_LAYERS.points,
    type: 'circle',
    source: MAP_SOURCE_ID,
    filter: DOT_PIN,
    paint: {
      'circle-color': colour.accent,
      'circle-radius': byPrecision(PIN_RADIUS.exact, PIN_RADIUS.approximate),
      'circle-opacity': ['case', IS_APPROXIMATE, 0.32, 1],
      'circle-stroke-width': byPrecision(3, 1.5),
      'circle-stroke-color': ['case', IS_APPROXIMATE, colour.accentStrong, colour.ring],
      'circle-stroke-opacity': ['case', IS_APPROXIMATE, 0.9, 1],
    },
  };
}

/** A ring around the selected pin, so selection is not carried by colour alone. */
export function selectionLayer(theme: BasemapTheme): LayerSpecification {
  return {
    id: MAP_LAYERS.selection,
    type: 'circle',
    source: MAP_SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-color': PIN_COLOURS[theme].selection,
      'circle-opacity': 0,
      'circle-radius': byPrecision(PIN_RADIUS.exact + 8, PIN_RADIUS.approximate + 8),
      'circle-stroke-width': 2,
      'circle-stroke-color': PIN_COLOURS[theme].selection,
    },
  };
}

/**
 * The same ring, thinner, under the pointer.
 *
 * It exists because the cursor change alone does not say *which* pin is about
 * to be chosen when two overlap, and because a map whose pins do not respond to
 * the pointer feels like an image. It is pointer-only by nature, so it carries
 * no information a keyboard or screen-reader user needs — the list beside the
 * map is the route for them, and the selection ring above is the state that
 * matters.
 */
export function hoverLayer(theme: BasemapTheme): LayerSpecification {
  return {
    id: MAP_LAYERS.hover,
    type: 'circle',
    source: MAP_SOURCE_ID,
    filter: idFilter(null),
    paint: {
      'circle-color': PIN_COLOURS[theme].selection,
      'circle-opacity': 0,
      'circle-radius': byPrecision(PIN_RADIUS.exact + 5, PIN_RADIUS.approximate + 5),
      'circle-stroke-width': 1.5,
      'circle-stroke-color': PIN_COLOURS[theme].selection,
      'circle-stroke-opacity': 0.55,
    },
  };
}

/**
 * Matches the one unclustered feature carrying this id, and nothing when there
 * is none.
 *
 * An id no feature carries is how "nothing selected" is expressed, which keeps
 * the layer in the style instead of adding and removing it.
 */
export function idFilter(id: string | null): FilterSpecification {
  // Dots only: a photograph pin carries its own selected and hovered states in
  // CSS, and a ring drawn under a 44-pixel thumbnail would never be seen.
  return ['all', DOT_PIN, ['==', ['get', 'id'], id ?? '\u0000']];
}

/* ------------------------------------------------------------------------ */
/* Data                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * The narrow shape the layers above actually read. `MapPin` satisfies it, and
 * so does a lone coordinate on a location page.
 */
export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  isApproximate: boolean;
  /**
   * Whether this pin is drawn as a photograph. Optional, and absent counts as
   * false: a lone coordinate on a location page has no stack of frames behind
   * it and wants the dot.
   */
  hasImage?: boolean;
}

/** GeoJSON for the clustering source. Property names match the expressions above. */
export function pointCollection(points: readonly MapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        isApproximate: point.isApproximate,
        hasImage: point.hasImage ?? false,
      },
    })),
  };
}
