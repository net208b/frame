import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
} from 'maplibre-gl';

import { publicEnv } from '@/lib/config';

/**
 * Every assumption FRAME makes about its map provider.
 *
 * Changing provider should be a configuration change rather than a rewrite, so
 * nothing outside this module names a tile host, a glyph set or a paint colour.
 * Two rules shape it:
 *
 * 1. There is no default style URL. MapLibre's demo tiles are licensed for
 *    evaluation only, so shipping them as a fallback would put every FRAME
 *    deployment in breach of those terms on first load. Without a configured
 *    style the map surfaces render MapUnavailable and say what is missing.
 * 2. Attribution is usually a licence condition rather than a courtesy, so the
 *    configured attribution is handed to MapLibre's own attribution control,
 *    and its absence is stated in the interface rather than quietly ignored.
 */

export const MAP_STYLE_ENV_VAR = 'NEXT_PUBLIC_MAP_STYLE_URL';
export const MAP_ATTRIBUTION_ENV_VAR = 'NEXT_PUBLIC_MAP_ATTRIBUTION';
export const MAP_PROVIDER_DOC = 'docs/EXTERNAL-SERVICES.md';

/** The provider's style document. Null means no map may be drawn at all. */
export function mapStyleUrl(): string | null {
  return publicEnv().mapStyleUrl;
}

/** Plain text or markup supplied by the operator, e.g. the provider's credit. */
export function mapAttribution(): string | null {
  return publicEnv().mapAttribution;
}

/**
 * The query parameter carrying the chosen place, so a map view is a shareable
 * URL rather than hidden client state.
 *
 * It lives here rather than in MapExplorer because the page reads it on the
 * server to render a shared link already selected, and a `'use client'` module's
 * exports are client references on the server, not values.
 */
export const SELECTED_PARAM = 'place';

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
  /** Drawn under the pins so a selected pin keeps its own colour. */
  selection: 'frame-selection',
  points: 'frame-points',
} as const;

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
 * these. Most providers serve the MapLibre/Mapbox defaults below; a provider
 * that names its fonts differently is a one-line change here.
 */
export const MAP_FONT_STACK: string[] = ['Open Sans Regular', 'Arial Unicode MS Regular'];

/**
 * A WebGL paint property cannot read a CSS custom property, so the tokens from
 * `globals.css` are mirrored here. These five values are the only hard-coded
 * colours in the map layer; keep them in step with the `@theme` block.
 */
const COLOUR = {
  accent: '#d9ff56',
  accentStrong: '#c2e63d',
  ink: '#171815',
  inkSurface: '#1c1e19',
  onInk: '#f8f8f2',
  surface: '#ffffff',
} as const;

/**
 * Whether this feature's position is deliberately imprecise.
 *
 * An absent flag counts as approximate. A bare `get` would make the style spec
 * assert the property's type at paint time and throw, taking the layer down;
 * and of the two fallbacks available, drawing a soft wide disc understates the
 * precision we hold, whereas a crisp dot would overstate it. Precision is a
 * privacy decision, so the error has to fall on this side.
 */
const IS_APPROXIMATE: ExpressionSpecification = [
  'any',
  ['!', ['has', 'isApproximate']],
  ['to-boolean', ['get', 'isApproximate']],
];

/** Clusters: ink discs with a white ring, sized by how much they hold. */
export function clusterLayers(): LayerSpecification[] {
  return [
    {
      id: MAP_LAYERS.clusters,
      type: 'circle',
      source: MAP_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': COLOUR.inkSurface,
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
        'circle-stroke-width': 2,
        'circle-stroke-color': COLOUR.surface,
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
        'text-color': COLOUR.onInk,
      },
    },
  ];
}

/**
 * The single points.
 *
 * An exact pin is the prototype's lime dot with a white ring. An approximate
 * one is deliberately not that: it is a wider, softer disc, because the point
 * stands for an area the member asked us not to pin down. Size and density
 * carry the difference as well as colour, and the legend names both.
 */
export function pointLayer(): LayerSpecification {
  return {
    id: MAP_LAYERS.points,
    type: 'circle',
    source: MAP_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': COLOUR.accent,
      'circle-radius': ['case', IS_APPROXIMATE, 13, 6],
      'circle-opacity': ['case', IS_APPROXIMATE, 0.32, 1],
      'circle-stroke-width': ['case', IS_APPROXIMATE, 1.5, 3],
      'circle-stroke-color': ['case', IS_APPROXIMATE, COLOUR.accentStrong, COLOUR.surface],
      'circle-stroke-opacity': ['case', IS_APPROXIMATE, 0.9, 1],
    },
  };
}

/** A ring around the selected pin, so selection is not carried by colour alone. */
export function selectionLayer(): LayerSpecification {
  return {
    id: MAP_LAYERS.selection,
    type: 'circle',
    source: MAP_SOURCE_ID,
    filter: selectionFilter(null),
    paint: {
      'circle-color': COLOUR.ink,
      'circle-opacity': 0,
      'circle-radius': ['case', IS_APPROXIMATE, 21, 14],
      'circle-stroke-width': 2,
      'circle-stroke-color': COLOUR.ink,
    },
  };
}

export function selectionFilter(selectedId: string | null): FilterSpecification {
  // An id no feature carries is how "nothing selected" is expressed, which
  // keeps the layer in the style instead of adding and removing it.
  return ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedId ?? '\u0000']];
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
      },
    })),
  };
}
