import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { DiscoverToolbar } from '@/components/discover/DiscoverToolbar';
import { MapExplorer } from '@/components/map/MapExplorer';
import { DISCOVER_SELECTED_PARAM } from '@/components/map/map-style';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState, GallerySkeleton } from '@/components/ui/states';
import { getViewer } from '@/lib/auth';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import {
  getDiscoverFeed,
  getDiscoverMapPins,
  getGearFacets,
  getOwnPhotographedLocationIds,
  normaliseDiscoverQuery,
  type MapPin,
} from '@/lib/data/repository';
import {
  activeDiscoverFilterCount,
  buildClearedDiscoverHref,
  buildDiscoverHref,
  discoverViewKey,
  isFilteredDiscoverView,
  parseDiscoverSearchParams,
  parseDiscoverView,
  type DiscoverSearchParams,
  type DiscoverViewState,
} from '@/lib/discover-query';
import { visitorPlace } from '@/lib/geo/visitor';
import { buildMetadata } from '@/lib/seo';
import { taxonomyLabels } from '@/lib/taxonomy';
import { formatCount } from '@/lib/utils';
import type { Paginated, PhotographDetail } from '@/types/domain';

interface DiscoverPageProps {
  params: LocaleParams;
  searchParams: Promise<DiscoverSearchParams>;
}

export async function generateMetadata({
  params,
  searchParams,
}: DiscoverPageProps): Promise<Metadata> {
  const [{ locale }, resolvedSearchParams] = await Promise.all([readLocaleParams(params), searchParams]);
  const query = normaliseDiscoverQuery(parseDiscoverSearchParams(resolvedSearchParams));
  const view = parseDiscoverView(resolvedSearchParams);
  const filtered = isFilteredDiscoverView(query);

  // `generateMetadata` runs outside the render that calls `setRequestLocale`,
  // so the locale is passed explicitly here rather than read from the request.
  const t = await getTranslations({ locale, namespace: 'discover' });
  const taxonomy = taxonomyLabels(await getTranslations({ locale, namespace: 'taxonomy' }));

  // What this view is of, for the document title and the share card. The four
  // shapes are four whole messages rather than a subject assembled from
  // fragments: Thai puts the place and the category in a different order from
  // English and needs a space in only one of the two joins.
  const { category, place } = query;
  const subject = category
    ? place
      ? t('meta.viewTitle.categoryInPlace', { category: taxonomy.category(category), place })
      : t('meta.viewTitle.category', { category: taxonomy.category(category) })
    : place
      ? t('meta.viewTitle.allInPlace', { place })
      : t('meta.viewTitle.all');

  return buildMetadata({
    locale,
    title: filtered ? subject : t('heading'),
    description: filtered
      ? t('meta.filteredDescription', { subject, sort: taxonomy.sortInline(query.sort) })
      : t('meta.description'),
    // The gallery is the canonical address for a set of photographs. The map
    // draws the same set, so it points at the gallery rather than competing
    // with it for the same content.
    path: buildDiscoverHref(query),
    // Filters, orderings and pages multiply into thousands of near-identical
    // views. Indexing them would bury the pages worth finding. The map is a way
    // of looking at a result set rather than a document, so it is never indexed
    // even when nothing is filtering.
    noIndex: filtered || view === 'map',
  });
}

export default async function DiscoverPage({ params, searchParams }: DiscoverPageProps) {
  const [{ locale }, resolvedSearchParams] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'discover' });
  const state: DiscoverViewState = {
    ...normaliseDiscoverQuery(parseDiscoverSearchParams(resolvedSearchParams)),
    view: parseDiscoverView(resolvedSearchParams),
  };

  // Only the view being shown is read. The map is one query and the gallery is
  // another, and fetching both so that a toggle feels instant would double the
  // cost of every visit to Discover for the one reader in some number who
  // switches.
  //
  // Whichever it is starts before the facets are awaited, so the two overlap
  // rather than queue; it is awaited inside the Suspense boundary below.
  // Attaching a handler here keeps a failed read from being reported as an
  // unhandled rejection in the case where the facets read rejects first and the
  // boundary is therefore never rendered.
  const feed = state.view === 'gallery' ? getDiscoverFeed(state) : null;
  const pins = state.view === 'map' ? getDiscoverMapPins(state) : null;
  feed?.catch(() => {});
  pins?.catch(() => {});

  const facets = await getGearFacets();

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">{t('heading')}</h1>
        <p className="mt-4 text-lead text-muted">{t('lead')}</p>
      </header>

      <DiscoverToolbar query={state} facets={facets} className="mt-8 lg:mt-10" />

      {/* Keyed on the view, so changing a filter — or the view itself —
          replaces what is below with a skeleton instead of leaving the previous
          results on screen. */}
      <Suspense
        key={discoverViewKey(state)}
        fallback={
          <div className="mt-10">
            <GallerySkeleton count={8} />
          </div>
        }
      >
        {pins ? (
          <DiscoverMap
            pins={pins}
            locale={locale}
            selectedSlug={firstValue(resolvedSearchParams[DISCOVER_SELECTED_PARAM])}
          />
        ) : (
          <DiscoverResults query={state} feed={feed ?? getDiscoverFeed(state)} locale={locale} />
        )}
      </Suspense>
    </div>
  );
}

/** A query string can repeat a key; the first value wins. */
function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value.at(0) : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/* ------------------------------------------------------------------------ */
/* The map of a view                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The same filtered set, drawn as the places it was made at.
 *
 * Deliberately the same `MapExplorer` the /map page renders, with the same pin
 * cards and the same place panel: this is a second way of reading one result
 * set, not a second map to learn. The selected pin stays in `?selected=`, which
 * the explorer writes with the history API, so it sits alongside the filters in
 * the address rather than replacing them.
 *
 * What is NOT here is paging. A map has no page two — it carries every place
 * the filter matches — so the gallery's pagination is absent rather than
 * present and inert.
 */
async function DiscoverMap({
  pins: pinsPromise,
  locale,
  selectedSlug,
}: {
  pins: Promise<MapPin[]>;
  locale: Locale;
  selectedSlug: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'discover' });

  const [pins, place, viewer] = await Promise.all([pinsPromise, visitorPlace(), getViewer()]);
  // Only for a signed-in member, and only their own: the ring on a pin says
  // "you have photographed here", and nobody is shown anybody else's.
  const ownLocationIds = viewer ? await getOwnPhotographedLocationIds(viewer.id) : [];

  return (
    <section aria-labelledby="discover-map-heading" className="mt-10">
      <h2 id="discover-map-heading" className="sr-only">
        {t('view.mapHeading')}
      </h2>

      <p role="status" className="text-caption font-semibold text-ink tabular-nums">
        {pins.length > 0
          ? t('view.mapSummary', { count: pins.length, formatted: formatCount(pins.length, locale) })
          : t('view.mapEmpty')}
      </p>

      {/* The explorer is rendered even with nothing to draw, as on the /map
          page: it opens on the reader's own city and says on top of itself that
          there is nothing here, which is more use than an empty panel where a
          map should be. What it says, though, is this page's to say — the /map
          page's "nothing on file has a publishable position" would be untrue
          here, where the places exist and a filter is what excluded them. */}
      <MapExplorer
        className="mt-7"
        pins={pins}
        ownLocationIds={ownLocationIds}
        initialSelectedSlug={selectedSlug}
        // Not `place`: that key is this page's text filter, and a pin writing a
        // slug into it would come back as a search term on the next render.
        selectionParam={DISCOVER_SELECTED_PARAM}
        fallbackCamera={{ centre: place.centre, zoom: place.zoom }}
        nothingToDraw={{
          title: t('view.mapEmptyTitle'),
          description: t('view.mapEmptyBody'),
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Results                                                                   */
/* ------------------------------------------------------------------------ */

async function DiscoverResults({
  query,
  feed,
  locale,
}: {
  query: DiscoverViewState;
  feed: Promise<Paginated<PhotographDetail>>;
  locale: Locale;
}) {
  const result = await feed;
  const filterCount = activeDiscoverFilterCount(query);

  const t = await getTranslations({ locale, namespace: 'discover' });
  const taxonomy = taxonomyLabels(await getTranslations({ locale, namespace: 'taxonomy' }));

  // How many photographs this view holds.
  //
  // The live feed deliberately does not compute an exact total — on a growing
  // table that count is the expensive part of the query — so when it is absent
  // the page says what it actually knows rather than implying a total.
  //
  // The total is passed twice: as a number, which chooses the plural form, and
  // as the compact string `formatCount` built for the active locale, which is
  // what is actually shown. ICU would otherwise print 1200 where the design
  // asks for 1.2k.
  const summary =
    result.totalCount === null
      ? t('results.onThisPage', { count: result.items.length })
      : filterCount > 0
        ? t('results.totalFiltered', {
            count: result.totalCount,
            formatted: formatCount(result.totalCount, locale),
          })
        : t('results.total', {
            count: result.totalCount,
            formatted: formatCount(result.totalCount, locale),
          });

  return (
    <section aria-labelledby="discover-results-heading" className="mt-10">
      {/* The gallery needs a heading between the page h1 and the h3 an empty
          state renders, but naming it on screen would say nothing new. */}
      <h2 id="discover-results-heading" className="sr-only">
        {t('results.heading')}
      </h2>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <p role="status" className="text-caption font-semibold text-ink tabular-nums">
          {summary}
        </p>
        <p className="text-meta text-muted">
          {t('sort.orderedBy', { sort: taxonomy.sortInline(query.sort) })}
        </p>
      </div>

      {result.items.length === 0 ? (
        <EmptyResults
          query={query}
          filterCount={filterCount}
          locale={locale}
          className="mt-8"
        />
      ) : (
        <>
          <MasonryGallery photos={result.items} priorityCount={4} className="mt-7" />
          <Pagination
            page={result.page}
            hasMore={result.hasMore}
            totalCount={result.totalCount}
            pageSize={result.pageSize}
            buildHref={(page) => buildDiscoverHref(query, { page })}
            className="mt-12"
          />
        </>
      )}
    </section>
  );
}

/**
 * Nothing matched. Which is a different problem depending on why, so the way
 * out is different too — a filtered dead end needs the filters dropped, a page
 * past the end needs the first page, and an empty gallery needs somewhere else
 * to go.
 */
async function EmptyResults({
  query,
  filterCount,
  locale,
  className,
}: {
  query: DiscoverViewState;
  filterCount: number;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'discover' });

  if (filterCount > 0) {
    return (
      <EmptyState
        className={className}
        title={t('empty.filtered.title')}
        description={t('empty.filtered.body')}
        action={
          <Button asChild variant="secondary">
            <Link href={buildClearedDiscoverHref(query)}>{t('empty.filtered.action')}</Link>
          </Button>
        }
      />
    );
  }

  if (query.page > 1) {
    return (
      <EmptyState
        className={className}
        title={t('empty.pastEnd.title')}
        description={t('empty.pastEnd.body')}
        action={
          <Button asChild variant="secondary">
            <Link href={buildDiscoverHref(query, { page: 1 })}>{t('empty.pastEnd.action')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      className={className}
      title={t('empty.none.title')}
      description={t('empty.none.body')}
      action={
        <Button asChild variant="secondary">
          <Link href="/locations">{t('empty.none.action')}</Link>
        </Button>
      }
    />
  );
}
