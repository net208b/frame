import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';

/**
 * FRAME's own basemap.
 *
 * Until now `NEXT_PUBLIC_MAP_STYLE_URL` had no default, so every deployment
 * that had not bought a tile subscription showed `MapUnavailable` instead of a
 * map — which is what worldofstreetphoto.com did from launch. The reason for
 * having no default was never "a map is optional": it was that MapLibre's demo
 * tiles are licensed for evaluation only, and shipping somebody else's styled
 * tiles as a fallback puts the operator in breach on first load.
 *
 * This module removes the reason rather than the rule. It builds a complete
 * MapLibre style document of FRAME's own, drawn over OpenFreeMap's planet-wide
 * vector tiles — free for commercial use, no account, no API key, no quota,
 * conditional only on the credit that MapLibre's attribution control takes off
 * the source and shows on its own — see TILE_JSON_URL below. So the default is
 * now a real map that FRAME is entitled to serve, and the environment variable
 * remains as an override for an operator who would rather pay a provider for an
 * SLA. Nothing downstream changes when they do.
 *
 * Why hand-write ~40 layers instead of pointing at a ready-made style:
 *
 *  - A borrowed style is somebody else's palette. FRAME is an editorial
 *    interface — warm off-white paper, charcoal ink, one lime accent used
 *    sparingly — and a map is the largest single element on its own page. A
 *    stock basemap puts motorway orange, POI blue and highlighted green next to
 *    a lime pin, and the pin stops being the only saturated thing on screen.
 *  - The pins are the content. Every layer here is tuned down so that the
 *    photographs' positions read first: no POI icons, no house numbers, no
 *    transit, no shields. What is left is land, water, parks, buildings and the
 *    street grid, which for a street photography map is the subject itself.
 *  - The page has two themes, and a white map inside the night-gallery theme
 *    reads as a bug. Both themes are generated from the same layer list here,
 *    off the same tokens as `globals.css`.
 *  - Labels follow the reader's language. OpenMapTiles carries `name:en` and
 *    `name:th` on every named feature, so /th gets a Thai map rather than an
 *    English one with Thai interface chrome around it.
 *
 * The schema is OpenMapTiles (https://openmaptiles.org/schema). Layer and class
 * names below are its vocabulary, not ours.
 */

/* ------------------------------------------------------------------------ */
/* Provider                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The TileJSON, not a tile URL template. It is fetched at runtime for two
 * reasons. The tiles live under a dated path that changes whenever OpenFreeMap
 * reimports OpenStreetMap, so hard-coding today's path would freeze the map at
 * today's data and eventually 404. And the TileJSON carries the provider's own
 * `attribution`, which is how the licence credit reaches the map: MapLibre's
 * attribution control reads it off the source and shows it without being told.
 *
 * That is also why FRAME does not add a credit of its own for this basemap.
 * MapLibre overwrites a source's style-level attribution with the TileJSON's,
 * so a second copy would not replace the first — it would print beside it, and
 * the map would carry the same credit twice.
 */
const TILE_JSON_URL = 'https://tiles.openfreemap.org/planet';

/** The provider's own glyph endpoint. `sprite` is omitted: no layer draws icons. */
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/** Glyphs the provider actually serves. `Open Sans`, MapLibre's usual default, 404s here. */
const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

const SOURCE_ID = 'openmaptiles';

/* ------------------------------------------------------------------------ */
/* Variants                                                                   */
/* ------------------------------------------------------------------------ */

export type BasemapTheme = 'light' | 'dark';
export type BasemapLanguage = 'en' | 'th';

/**
 * Theme and language are in the path rather than the query string so each
 * variant is a distinct, cacheable document that Next can render once at build
 * time. There are only four, so they are enumerated rather than validated.
 */
export const BASEMAP_VARIANTS = ['light-en', 'light-th', 'dark-en', 'dark-th'] as const;

export type BasemapVariant = (typeof BASEMAP_VARIANTS)[number];

export function basemapVariant(theme: BasemapTheme, language: BasemapLanguage): BasemapVariant {
  return `${theme}-${language}`;
}

export function parseBasemapVariant(
  value: string,
): { theme: BasemapTheme; language: BasemapLanguage } | null {
  if (!(BASEMAP_VARIANTS as readonly string[]).includes(value)) return null;
  const [theme, language] = value.split('-');
  return { theme: theme as BasemapTheme, language: language as BasemapLanguage };
}

/* ------------------------------------------------------------------------ */
/* Palette                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Mirrors of the `@theme` tokens in `globals.css`, plus the handful of map-only
 * colours between them. A WebGL paint property cannot read a CSS custom
 * property, so these have to be literals; keep them in step with that block.
 *
 * The light theme is a printed atlas on FRAME's own paper: the land *is*
 * `--color-paper`, so the map and the page are continuous and only water,
 * planting and the street grid stand out of it. The dark theme is the same map
 * after hours — the olive-warm near-black of the dark `--color-paper`, with the
 * grid lifted rather than inverted, because on a near-black ground the only
 * direction with contrast left in it is up.
 *
 * Roads are a four-step neutral ramp in both themes, never a hue. Motorway
 * orange is the single loudest thing on a stock basemap and it would compete
 * with the pins.
 */
interface Palette {
  land: string;
  water: string;
  waterLine: string;
  wood: string;
  grass: string;
  sand: string;
  ice: string;
  park: string;
  building: string;
  buildingLine: string;
  /** Darkest to lightest in the light theme; faintest to brightest in the dark. */
  roadMinor: string;
  roadSecondary: string;
  roadPrimary: string;
  roadMotorway: string;
  roadCasing: string;
  rail: string;
  boundary: string;
  boundaryCountry: string;
  label: string;
  labelMuted: string;
  labelWater: string;
  labelHalo: string;
}

const PALETTES: Record<BasemapTheme, Palette> = {
  light: {
    land: '#f8f8f5', // --color-paper
    water: '#dfe6e8',
    waterLine: '#d2dbde',
    wood: '#e8eddf',
    grass: '#edf1e5',
    sand: '#f2efe2',
    ice: '#edf0f2',
    park: '#eaefe1',
    building: '#eeeee6',
    buildingLine: '#e4e4da',
    roadMinor: '#ffffff',
    roadSecondary: '#ffffff',
    roadPrimary: '#ffffff',
    roadMotorway: '#ffffff',
    roadCasing: '#e2e2d9',
    rail: '#dcdcd2',
    boundary: '#d6d6cd', // --color-line-strong
    boundaryCountry: '#b9b9ad',
    label: '#45473f', // --color-ink-soft
    labelMuted: '#777970', // --color-muted
    labelWater: '#8a948f',
    labelHalo: '#f8f8f5',
  },
  dark: {
    land: '#141610', // dark --color-paper
    water: '#101820',
    waterLine: '#16212b',
    wood: '#182012',
    grass: '#1a2214',
    sand: '#232318',
    ice: '#1a1f25',
    park: '#172011',
    building: '#1d2018',
    buildingLine: '#262a1e',
    roadMinor: '#2b2f25',
    roadSecondary: '#363b2f',
    roadPrimary: '#434839',
    roadMotorway: '#525844',
    roadCasing: '#1a1c14',
    rail: '#2e3228',
    boundary: '#434639', // dark --color-line-strong
    boundaryCountry: '#555a49',
    label: '#f2f2ea', // dark --color-ink
    labelMuted: '#949689', // dark --color-muted
    labelWater: '#6f7f8a',
    labelHalo: '#141610',
  },
};

/* ------------------------------------------------------------------------ */
/* Labels                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * The name to print, in the reader's language where the data has one.
 *
 * The fallback chain is deliberate and differs by language. A Thai reader is
 * better served by the local name than by a transliteration — `name` is the
 * name on the ground, which in Thailand is already Thai — so Thai falls back to
 * local and only then to the Latin transliteration. An English reader cannot
 * read the local script of most of the world, so English falls back to the
 * transliteration first and to the local name only when there is nothing else.
 *
 * `coalesce` returns the first expression that resolves; `get` on an absent
 * property resolves to null rather than throwing, which is what makes this safe
 * on features that carry only some of the three.
 */
function nameField(language: BasemapLanguage): ExpressionSpecification {
  return language === 'th'
    ? ['coalesce', ['get', 'name:th'], ['get', 'name'], ['get', 'name:latin']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
}

/**
 * Labels are set in the provider's Noto Sans, not FRAME's own typeface, because
 * glyphs are served as pre-rendered SDF ranges by the tile host and a web font
 * the browser has cannot be used for them. Noto covers Thai, which the
 * MapLibre/Mapbox default stacks do not.
 */
function textHalo(palette: Palette) {
  return {
    'text-halo-color': palette.labelHalo,
    'text-halo-width': 1.4,
    'text-halo-blur': 0.4,
  } as const;
}

/* ------------------------------------------------------------------------ */
/* Layers                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * `interpolate` on `zoom` with `['linear']` reads as a table of zoom → value.
 * Written out as a helper because road widths are the bulk of this file and the
 * literal form triples its length without adding information.
 */
function byZoom(stops: readonly (readonly [number, number])[]): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...stops.flatMap(([zoom, value]) => [zoom, value]),
  ] as ExpressionSpecification;
}

/** Everything that is not in a tunnel. Tunnels get one faint layer of their own. */
const NOT_TUNNEL: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];

function landLayers(palette: Palette): LayerSpecification[] {
  return [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': palette.land },
    },
    {
      // Planting, as one layer per tone rather than one per OSM class: the map
      // needs to say "green" and "sand", not to classify vegetation.
      id: 'landcover-wood',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['wood', 'forest'], true, false],
      paint: { 'fill-color': palette.wood, 'fill-opacity': byZoom([[5, 0], [7, 1]]) },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'farmland', 'wetland'], true, false],
      paint: { 'fill-color': palette.grass, 'fill-opacity': byZoom([[6, 0], [8, 1]]) },
    },
    {
      id: 'landcover-sand',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'],
      paint: { 'fill-color': palette.sand },
    },
    {
      // Ice is its own tone rather than a shade of sand: Greenland and
      // Antarctica are most of what a world view has to show above and below
      // the continents, and a warm beige there reads as desert. Cool, and
      // close enough to the land that it does not become the subject.
      id: 'landcover-ice',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'ice'],
      paint: { 'fill-color': palette.ice },
    },
    {
      // Parks are drawn above landcover and below water on purpose: a riverside
      // park should not paint over the river.
      id: 'park',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'park',
      paint: { 'fill-color': palette.park, 'fill-opacity': byZoom([[6, 0], [9, 1]]) },
    },
    {
      id: 'water',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'water',
      // Swimming pools at city zoom are noise, and the class is in the same
      // layer as oceans and lakes.
      filter: ['!=', ['get', 'class'], 'swimming_pool'],
      paint: { 'fill-color': palette.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': 'waterway',
      filter: NOT_TUNNEL,
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': palette.waterLine,
        'line-width': byZoom([[8, 0.6], [12, 1.2], [16, 3]]),
      },
    },
    {
      // Buildings are the texture that makes a city legible at walking zoom,
      // and at anything wider they are a grey smear, so they fade in late.
      id: 'building',
      type: 'fill',
      source: SOURCE_ID,
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-color': palette.building,
        'fill-outline-color': palette.buildingLine,
        'fill-opacity': byZoom([[13, 0], [14.5, 1]]),
      },
    },
  ];
}

/**
 * The street grid.
 *
 * Casing then fill, in two passes, so that junctions join cleanly: every casing
 * in the map is drawn before any road surface, which is the only ordering that
 * stops a minor road's outline cutting across the motorway it meets. The widths
 * are a single ramp scaled per class, so the hierarchy holds at every zoom
 * rather than only at the one it was tuned on.
 */
function roadLayers(palette: Palette): LayerSpecification[] {
  const motorway: ExpressionSpecification = [
    'match',
    ['get', 'class'],
    ['motorway'],
    true,
    false,
  ];
  const major: ExpressionSpecification = [
    'match',
    ['get', 'class'],
    ['trunk', 'primary'],
    true,
    false,
  ];
  const medium: ExpressionSpecification = [
    'match',
    ['get', 'class'],
    ['secondary', 'tertiary'],
    true,
    false,
  ];
  const minor: ExpressionSpecification = [
    'match',
    ['get', 'class'],
    ['minor', 'service', 'track'],
    true,
    false,
  ];
  const foot: ExpressionSpecification = [
    'match',
    ['get', 'class'],
    ['path', 'pedestrian'],
    true,
    false,
  ];

  /*
   * Kept as stops rather than as finished expressions because the casing is
   * derived from them: a paint property may hold exactly one zoom curve, so
   * `['+', width, 2]` around a built `byZoom` is rejected by the style spec and
   * the layer never paints. The casing widens each stop instead.
   */
  const widthStops = {
    motorway: [[5, 0.5], [8, 1.2], [12, 3], [16, 10], [18, 22]],
    major: [[6, 0.4], [9, 1], [12, 2.4], [16, 8], [18, 18]],
    medium: [[9, 0.4], [12, 1.6], [16, 6], [18, 14]],
    minor: [[12, 0.5], [14, 1.4], [16, 4], [18, 11]],
  } as const satisfies Record<string, readonly (readonly [number, number])[]>;

  /** The road plus a hairline each side — not a multiple of it, which would be a frame. */
  const CASING = 2;

  const casing = (
    id: string,
    filter: ExpressionSpecification,
    stops: readonly (readonly [number, number])[],
    minzoom: number,
  ): LayerSpecification => ({
    id,
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    minzoom,
    filter: ['all', NOT_TUNNEL, filter],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.roadCasing,
      'line-width': byZoom(stops.map(([zoom, width]) => [zoom, width + CASING])),
      'line-opacity': byZoom([[11, 0], [13, 1]]),
    },
  });

  const surface = (
    id: string,
    filter: ExpressionSpecification,
    stops: readonly (readonly [number, number])[],
    color: string,
    minzoom: number,
  ): LayerSpecification => ({
    id,
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    minzoom,
    filter: ['all', NOT_TUNNEL, filter],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': byZoom(stops) },
  });

  return [
    {
      // One faint dashed layer for everything underground, so a tunnel reads as
      // a gap in the grid rather than as a street that is there.
      id: 'road-tunnel',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['==', ['get', 'brunnel'], 'tunnel'],
      paint: {
        'line-color': palette.roadMinor,
        'line-width': byZoom([[12, 0.8], [16, 4]]),
        'line-opacity': 0.55,
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'rail',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', NOT_TUNNEL, ['match', ['get', 'class'], ['rail'], true, false]],
      paint: {
        'line-color': palette.rail,
        'line-width': byZoom([[11, 0.6], [16, 2]]),
        'line-dasharray': [3, 2],
      },
    },

    casing('road-minor-casing', minor, widthStops.minor, 12),
    casing('road-medium-casing', medium, widthStops.medium, 11),
    casing('road-major-casing', major, widthStops.major, 9),
    casing('road-motorway-casing', motorway, widthStops.motorway, 7),

    {
      // Footpaths: dotted, and only once the viewer is clearly looking at a
      // street rather than a city. They matter on a street photography map —
      // an alley is often the place — but they double the ink at z14.
      id: 'road-path',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': 'transportation',
      minzoom: 15,
      filter: ['all', NOT_TUNNEL, foot],
      paint: {
        'line-color': palette.roadMinor,
        'line-width': byZoom([[15, 0.8], [18, 2.4]]),
        'line-dasharray': [1, 2],
        'line-opacity': 0.8,
      },
    },
    surface('road-minor', minor, widthStops.minor, palette.roadMinor, 12),
    surface('road-medium', medium, widthStops.medium, palette.roadSecondary, 11),
    surface('road-major', major, widthStops.major, palette.roadPrimary, 9),
    surface('road-motorway', motorway, widthStops.motorway, palette.roadMotorway, 7),
  ];
}

function boundaryLayers(palette: Palette): LayerSpecification[] {
  return [
    {
      id: 'boundary-state',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      minzoom: 4,
      paint: {
        'line-color': palette.boundary,
        'line-width': byZoom([[4, 0.5], [10, 1.2]]),
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'boundary-country',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': 'boundary',
      filter: ['all', ['<=', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': palette.boundaryCountry,
        'line-width': byZoom([[2, 0.6], [6, 1.2], [12, 2]]),
      },
    },
  ];
}

/**
 * Type, in the order it is read.
 *
 * Country names are tracked capitals, the way an atlas sets them, and city
 * names are a plain bold — the difference is the only hierarchy this map needs,
 * since FRAME's pins carry their own labels in the panel beside the map rather
 * than on the canvas. Street names appear only from z15, where a viewer is
 * looking at a specific corner and the name is the point.
 */
function labelLayers(palette: Palette, language: BasemapLanguage): LayerSpecification[] {
  const name = nameField(language);

  /*
   * Tracking and capitals are a Latin convention. Thai has no case, so
   * `text-transform` does nothing to it, and letter-spacing is actively wrong:
   * it pulls apart clusters that are meant to be read as one unit, because a
   * Thai syllable is a base consonant with vowels and tone marks hung around
   * it. So the atlas treatment applies to the Latin label set and the Thai one
   * is set plainly, at the same sizes.
   */
  const tracked = (amount: number): number => (language === 'th' ? 0 : amount);
  const capitals = language === 'th' ? 'none' : ('uppercase' as const);

  return [
    {
      id: 'label-water',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'water_name',
      minzoom: 3,
      layout: {
        'text-field': name,
        'text-font': FONT_REGULAR,
        'text-size': byZoom([[3, 10], [10, 13]]),
        'text-letter-spacing': tracked(0.14),
        'text-max-width': 7,
        'symbol-placement': 'point',
      },
      paint: {
        'text-color': palette.labelWater,
        ...textHalo(palette),
      },
    },
    {
      id: 'label-street',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'transportation_name',
      minzoom: 15,
      layout: {
        'text-field': name,
        'text-font': FONT_REGULAR,
        'text-size': byZoom([[15, 10], [18, 12]]),
        // Along the line, which is how a street name is read, and repeated so a
        // long road is named more than once across the viewport.
        'symbol-placement': 'line',
        'symbol-spacing': 280,
        'text-max-angle': 32,
      },
      paint: {
        'text-color': palette.labelMuted,
        ...textHalo(palette),
      },
    },
    {
      id: 'label-place-small',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'place',
      minzoom: 9,
      filter: [
        'match',
        ['get', 'class'],
        ['village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'],
        true,
        false,
      ],
      layout: {
        'text-field': name,
        'text-font': FONT_REGULAR,
        'text-size': byZoom([[9, 10], [14, 12.5]]),
        'text-max-width': 8,
      },
      paint: {
        'text-color': palette.labelMuted,
        ...textHalo(palette),
      },
    },
    {
      id: 'label-place-town',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'place',
      minzoom: 6,
      filter: ['match', ['get', 'class'], ['town'], true, false],
      layout: {
        'text-field': name,
        'text-font': FONT_REGULAR,
        'text-size': byZoom([[6, 10.5], [12, 14]]),
        'text-max-width': 8,
      },
      paint: {
        'text-color': palette.label,
        ...textHalo(palette),
      },
    },
    {
      id: 'label-place-city',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'place',
      minzoom: 3,
      filter: ['match', ['get', 'class'], ['city'], true, false],
      layout: {
        'text-field': name,
        'text-font': FONT_BOLD,
        'text-size': byZoom([[3, 11], [8, 14], [12, 17]]),
        'text-max-width': 8,
      },
      paint: {
        'text-color': palette.label,
        ...textHalo(palette),
      },
    },
    {
      id: 'label-place-state',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'place',
      minzoom: 4,
      maxzoom: 8,
      filter: ['match', ['get', 'class'], ['state', 'province'], true, false],
      layout: {
        'text-field': name,
        'text-font': FONT_REGULAR,
        'text-size': byZoom([[4, 9.5], [7, 11.5]]),
        'text-transform': capitals,
        'text-letter-spacing': tracked(0.18),
        'text-max-width': 9,
      },
      paint: {
        'text-color': palette.labelMuted,
        ...textHalo(palette),
      },
    },
    {
      id: 'label-place-country',
      type: 'symbol',
      source: SOURCE_ID,
      'source-layer': 'place',
      // From 1, not 2: the map opens on a world view, and a world with nothing
      // named on it is a texture rather than a map.
      minzoom: 1,
      maxzoom: 9,
      filter: ['match', ['get', 'class'], ['country'], true, false],
      layout: {
        'text-field': name,
        'text-font': FONT_BOLD,
        'text-size': byZoom([[1, 9], [5, 13], [8, 15]]),
        'text-transform': capitals,
        'text-letter-spacing': tracked(0.22),
        'text-max-width': 9,
      },
      paint: {
        'text-color': palette.label,
        ...textHalo(palette),
      },
    },
  ];
}

/* ------------------------------------------------------------------------ */
/* The style document                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The finished style for one variant.
 *
 * The pin, cluster and selection layers are *not* here: the map components add
 * those on top once the style has loaded, because they carry live data and have
 * to survive a theme change without the data being refetched.
 */
export function basemapStyle(
  theme: BasemapTheme,
  language: BasemapLanguage,
): StyleSpecification {
  const palette = PALETTES[theme];

  return {
    version: 8,
    name: `FRAME ${theme} (${language})`,
    glyphs: GLYPHS_URL,
    sources: {
      [SOURCE_ID]: { type: 'vector', url: TILE_JSON_URL },
    },
    // No `sprite`: nothing here draws an icon, and a sprite is two more
    // requests before the first paint.
    layers: [
      ...landLayers(palette),
      ...roadLayers(palette),
      ...boundaryLayers(palette),
      ...labelLayers(palette, language),
    ],
  } as StyleSpecification;
}
