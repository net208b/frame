import { PAGE_SIZE } from '@/lib/config';
import {
  PHOTO_CATEGORIES,
  PHOTOGRAPHY_STYLES,
  SORT_OPTIONS,
  type DiscoverQuery,
  type PhotoCategory,
  type PhotographyStyle,
  type SortOption,
} from '@/types/domain';

/**
 * The only translation between the Discover URL and a {@link DiscoverQuery}.
 *
 * Every filter on Discover lives in the query string, which is what makes a
 * filtered gallery shareable and the back button meaningful. That only holds if
 * one module owns both directions: the page, the chips, the sort tabs, the gear
 * selects and the removable pills all read and write the URL through here, so a
 * link built in one component always parses back to the same query in another.
 *
 * Both functions are pure, and parsing never throws — a hand-edited or stale
 * URL falls back to the default view rather than failing the request.
 *
 * `view` is the one key here that is not a filter. It decides whether the
 * result set is drawn as a gallery or as a map, which is why it is deliberately
 * *not* a field of {@link DiscoverQuery}: that type is what the repository is
 * asked for, and how the answer is drawn is no business of a query. It still
 * travels through the same two builders, because a chip, a sort tab, a
 * removable pill or a page link that dropped it would throw the reader out of
 * the map the moment they narrowed what they were looking at.
 */

/** Query-string keys. Deliberately the field names of DiscoverQuery, plus `view`. */
const KEYS = {
  category: 'category',
  place: 'place',
  cameraBrand: 'cameraBrand',
  cameraModel: 'cameraModel',
  lensBrand: 'lensBrand',
  lensModel: 'lensModel',
  style: 'style',
  sort: 'sort',
  page: 'page',
  view: 'view',
} as const;

/**
 * How the filtered result set is drawn.
 *
 * `gallery` is the default and is omitted from the URL, the same convention
 * `/community?view=…` already follows: one view is the page's canonical
 * address, and the others name themselves.
 */
export const DISCOVER_VIEWS = ['gallery', 'map'] as const;

export type DiscoverView = (typeof DISCOVER_VIEWS)[number];

export const DEFAULT_DISCOVER_VIEW: DiscoverView = 'gallery';

/** A parsed Discover query together with how it is being drawn. */
export interface DiscoverViewState extends DiscoverQuery {
  view: DiscoverView;
}

/** What the two builders accept: any part of a query, and optionally a view. */
export type DiscoverHrefState = Partial<DiscoverQuery> & { view?: DiscoverView | null };

export const DEFAULT_DISCOVER_SORT: SortOption = 'recent';

/**
 * Paging is bounded because the offset is a database cost: a hand-written
 * `?page=900000` would otherwise ask the feed to skip twenty million rows.
 */
export const MAX_DISCOVER_PAGE = 500;

const MAX_PLACE_LENGTH = 80;
const MAX_GEAR_LENGTH = 80;

export type DiscoverSearchParams = Record<string, string | string[] | undefined>;

export type DiscoverFilterKey =
  | 'category'
  | 'style'
  | 'place'
  | 'cameraBrand'
  | 'cameraModel'
  | 'lensBrand'
  | 'lensModel';

/** The gear filters, as one list, so "how many are active" is defined once. */
export const GEAR_FILTER_KEYS = ['cameraBrand', 'cameraModel', 'lensBrand', 'lensModel'] as const;

/**
 * One filter currently narrowing the gallery.
 *
 * This module is pure and has no locale, so it carries no prose: it reports
 * *what* is filtering, and the component names it. A category is reported as
 * its slug, because its name belongs to the shared `taxonomy` namespace
 * (see `lib/taxonomy.ts`); every other filter is text the viewer typed or chose
 * from the facets and is shown back to them verbatim in any language. The union
 * is discriminated so a consumer cannot render a slug by mistake.
 */
export type ActiveDiscoverFilter =
  | { key: 'category'; category: PhotoCategory }
  | { key: 'style'; style: PhotographyStyle }
  | { key: Exclude<DiscoverFilterKey, 'category' | 'style'>; value: string };

/* ------------------------------------------------------------------------ */
/* URL -> query                                                              */
/* ------------------------------------------------------------------------ */

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Collapse whitespace and bound the length; an empty filter is no filter. */
function readText(value: string | string[] | undefined, maxLength: number): string | null {
  const raw = firstValue(value);
  if (raw === null) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

function readCategory(value: string | string[] | undefined): PhotoCategory | null {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (!raw) return null;
  return PHOTO_CATEGORIES.find((category) => category === raw) ?? null;
}

function readStyle(value: string | string[] | undefined): PhotographyStyle | null {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (!raw) return null;
  return PHOTOGRAPHY_STYLES.find((style) => style === raw) ?? null;
}

function readSort(value: string | string[] | undefined): SortOption {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (!raw) return DEFAULT_DISCOVER_SORT;
  return SORT_OPTIONS.find((option) => option === raw) ?? DEFAULT_DISCOVER_SORT;
}

function readView(value: string | string[] | undefined): DiscoverView {
  const raw = firstValue(value)?.trim().toLowerCase();
  if (!raw) return DEFAULT_DISCOVER_VIEW;
  return DISCOVER_VIEWS.find((view) => view === raw) ?? DEFAULT_DISCOVER_VIEW;
}

function readPage(value: string | string[] | undefined): number {
  const raw = firstValue(value);
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_DISCOVER_PAGE);
}

/**
 * Read a Discover view out of `searchParams`.
 *
 * An unknown category or sort is dropped rather than rejected, because the most
 * common source of a bad value is an old link somebody shared, and showing them
 * the default gallery is more use than an error page.
 */
export function parseDiscoverSearchParams(searchParams: DiscoverSearchParams): DiscoverQuery {
  return {
    category: readCategory(searchParams[KEYS.category]),
    // `q` is accepted as well, so the header search box can hand its term
    // straight to Discover without the viewer losing what they typed.
    place: readText(searchParams[KEYS.place] ?? searchParams['q'], MAX_PLACE_LENGTH),
    cameraBrand: readText(searchParams[KEYS.cameraBrand], MAX_GEAR_LENGTH),
    cameraModel: readText(searchParams[KEYS.cameraModel], MAX_GEAR_LENGTH),
    lensBrand: readText(searchParams[KEYS.lensBrand], MAX_GEAR_LENGTH),
    lensModel: readText(searchParams[KEYS.lensModel], MAX_GEAR_LENGTH),
    style: readStyle(searchParams[KEYS.style]),
    sort: readSort(searchParams[KEYS.sort]),
    page: readPage(searchParams[KEYS.page]),
    pageSize: PAGE_SIZE.gallery,
  };
}

/**
 * Read how the result set should be drawn.
 *
 * Separate from {@link parseDiscoverSearchParams} on purpose: that function's
 * answer is handed to the repository, and the view is not something the
 * repository is asked for. An unknown value is the gallery, for the same reason
 * an unknown category is dropped — the usual source is an old shared link.
 */
export function parseDiscoverView(searchParams: DiscoverSearchParams): DiscoverView {
  return readView(searchParams[KEYS.view]);
}

/* ------------------------------------------------------------------------ */
/* Query -> URL                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Build a Discover URL.
 *
 * Defaults are omitted, so the unfiltered gallery is `/discover` rather than a
 * string of empty parameters, and two routes to the same view produce the same
 * link. `overrides` wins over `query`; pass `null` to drop a filter. Changing a
 * filter should also reset paging, which callers do by passing `page: 1` —
 * explicit, because "which page am I on" is occasionally the thing being kept.
 */
export function buildDiscoverHref(
  query: DiscoverHrefState,
  overrides: DiscoverHrefState = {},
): string {
  const merged: DiscoverHrefState = { ...query, ...overrides };
  const params = new URLSearchParams();

  // Values are re-validated on the way out: a caller holding a stale category
  // should produce a clean URL rather than one that parses back to nothing.
  const category = merged.category
    ? (PHOTO_CATEGORIES.find((option) => option === merged.category) ?? null)
    : null;
  if (category) params.set(KEYS.category, category);

  const style = merged.style
    ? (PHOTOGRAPHY_STYLES.find((option) => option === merged.style) ?? null)
    : null;
  if (style) params.set(KEYS.style, style);

  const place = merged.place?.replace(/\s+/g, ' ').trim();
  if (place) params.set(KEYS.place, place.slice(0, MAX_PLACE_LENGTH));

  for (const key of GEAR_FILTER_KEYS) {
    const value = merged[key]?.trim();
    if (value) params.set(KEYS[key], value.slice(0, MAX_GEAR_LENGTH));
  }

  const sort = merged.sort ? SORT_OPTIONS.find((option) => option === merged.sort) : undefined;
  if (sort && sort !== DEFAULT_DISCOVER_SORT) params.set(KEYS.sort, sort);

  // Emitted here, which is what keeps the map from collapsing back into the
  // gallery: every link on the page — the category chips, the sort tabs, the
  // gear selects, the removable pills, the pagination — is built by this
  // function, so the view survives a click on any of them. The default is
  // omitted, so the plain gallery stays `/discover`.
  const view = merged.view ? DISCOVER_VIEWS.find((option) => option === merged.view) : undefined;
  if (view && view !== DEFAULT_DISCOVER_VIEW) params.set(KEYS.view, view);

  const page = merged.page ?? 1;
  if (Number.isFinite(page) && page > 1) {
    params.set(KEYS.page, String(Math.min(Math.floor(page), MAX_DISCOVER_PAGE)));
  }

  // URLSearchParams writes a space as `+`, which only decodes back to a space
  // under form-encoding rules. `%20` means a space everywhere, so a shared link
  // cannot turn "San Francisco" into "San+Francisco".
  const search = params.toString().replace(/\+/g, '%20');
  return search ? `/discover?${search}` : '/discover';
}

/**
 * The same view with one filter removed, back at the first page.
 *
 * `query` is forwarded whole, so the view is among the things kept: removing a
 * filter while looking at the map leaves the reader on the map.
 */
export function buildDiscoverHrefWithout(
  query: DiscoverHrefState,
  key: DiscoverFilterKey,
): string {
  const cleared: DiscoverHrefState = { page: 1 };

  // Written out rather than computed, so the key stays typed.
  switch (key) {
    case 'category':
      cleared.category = null;
      break;
    case 'style':
      cleared.style = null;
      break;
    case 'place':
      cleared.place = null;
      break;
    case 'cameraBrand':
      // A model only means anything alongside its brand.
      cleared.cameraBrand = null;
      cleared.cameraModel = null;
      break;
    case 'cameraModel':
      cleared.cameraModel = null;
      break;
    case 'lensBrand':
      // A model only means anything alongside its brand, as for cameras.
      cleared.lensBrand = null;
      cleared.lensModel = null;
      break;
    case 'lensModel':
      cleared.lensModel = null;
      break;
  }

  return buildDiscoverHref(query, cleared);
}

/** Every filter dropped, keeping the ordering and the view the viewer chose. */
export function buildClearedDiscoverHref(query: DiscoverHrefState): string {
  return buildDiscoverHref({
    sort: query.sort ?? DEFAULT_DISCOVER_SORT,
    view: query.view ?? DEFAULT_DISCOVER_VIEW,
    page: 1,
  });
}

/* ------------------------------------------------------------------------ */
/* Describing a view                                                         */
/* ------------------------------------------------------------------------ */

/** The active filters in reading order, for the removable pills and the title. */
export function activeDiscoverFilters(query: DiscoverQuery): ActiveDiscoverFilter[] {
  const filters: ActiveDiscoverFilter[] = [];

  if (query.category) {
    filters.push({ key: 'category', category: query.category });
  }
  if (query.style) {
    filters.push({ key: 'style', style: query.style });
  }
  if (query.place) {
    filters.push({ key: 'place', value: query.place });
  }
  for (const key of GEAR_FILTER_KEYS) {
    const value = query[key];
    if (value) filters.push({ key, value });
  }

  return filters;
}

export function activeDiscoverFilterCount(query: DiscoverQuery): number {
  return activeDiscoverFilters(query).length;
}

export function activeGearFilterCount(query: DiscoverQuery): number {
  return GEAR_FILTER_KEYS.filter((key) => Boolean(query[key])).length;
}

/**
 * True when this is not the plain gallery.
 *
 * Used for `noIndex`: a filter, a non-default ordering and a deep page all
 * generate near-identical pages, and an index full of those permutations helps
 * nobody find a photograph.
 */
export function isFilteredDiscoverView(query: DiscoverQuery): boolean {
  return (
    activeDiscoverFilterCount(query) > 0 ||
    query.sort !== DEFAULT_DISCOVER_SORT ||
    query.page > 1
  );
}

/**
 * A stable identity for a view, used as the Suspense key so changing a filter
 * replaces the gallery with a skeleton instead of leaving the old results on
 * screen while the new ones load. The view is part of that identity, so
 * switching between the gallery and the map remounts rather than re-using the
 * previous one's tree.
 */
export function discoverViewKey(query: DiscoverHrefState): string {
  return buildDiscoverHref(query);
}
