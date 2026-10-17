import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { DiscoverToolbar } from '@/components/discover/DiscoverToolbar';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState, GallerySkeleton } from '@/components/ui/states';
import { getDiscoverFeed, getGearFacets, normaliseDiscoverQuery } from '@/lib/data/repository';
import {
  activeDiscoverFilterCount,
  buildClearedDiscoverHref,
  buildDiscoverHref,
  discoverViewKey,
  isFilteredDiscoverView,
  parseDiscoverSearchParams,
  type DiscoverSearchParams,
} from '@/lib/discover-query';
import { buildMetadata } from '@/lib/seo';
import { formatCount } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  SORT_LABELS,
  type DiscoverQuery,
  type Paginated,
  type PhotographDetail,
} from '@/types/domain';

interface DiscoverPageProps {
  searchParams: Promise<DiscoverSearchParams>;
}

const LEDE =
  'Every photograph here was published by the photographer who made it, with the place and the settings behind it.';

/** What this view is of, for the document title and the share card. */
function describeView(query: DiscoverQuery): string {
  const subject = query.category
    ? `${CATEGORY_LABELS[query.category]} photographs`
    : 'Photographs';
  return query.place ? `${subject} from ${query.place}` : subject;
}

export async function generateMetadata({ searchParams }: DiscoverPageProps): Promise<Metadata> {
  const query = normaliseDiscoverQuery(parseDiscoverSearchParams(await searchParams));
  const filtered = isFilteredDiscoverView(query);

  return buildMetadata({
    title: filtered ? describeView(query) : 'Discover photographs',
    description: filtered
      ? `${describeView(query)} from the FRAME community, ordered by ${SORT_LABELS[
          query.sort
        ].toLowerCase()}.`
      : `Browse street photography from the FRAME community. ${LEDE}`,
    path: buildDiscoverHref(query),
    // Filters, orderings and pages multiply into thousands of near-identical
    // views. Indexing them would bury the pages worth finding.
    noIndex: filtered,
  });
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const query = normaliseDiscoverQuery(parseDiscoverSearchParams(await searchParams));

  // Both reads start before either is awaited, so they overlap rather than
  // queue. The feed is handed to the gallery below, which awaits it inside its
  // own Suspense boundary; attaching a handler here keeps a failed read from
  // being reported as an unhandled rejection in the case where the facets read
  // rejects first and the gallery is therefore never rendered.
  const feed = getDiscoverFeed(query);
  feed.catch(() => {});
  const facets = await getGearFacets();

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>The community gallery</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">Discover photographs</h1>
        <p className="mt-4 text-lead text-muted">{LEDE}</p>
      </header>

      <DiscoverToolbar query={query} facets={facets} className="mt-8 lg:mt-10" />

      {/* Keyed on the view, so changing a filter replaces the gallery with a
          skeleton instead of leaving the previous results on screen. */}
      <Suspense
        key={discoverViewKey(query)}
        fallback={
          <div className="mt-10">
            <GallerySkeleton count={8} />
          </div>
        }
      >
        <DiscoverResults query={query} feed={feed} />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Results                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * How many photographs this view holds.
 *
 * The live feed deliberately does not compute an exact total — on a growing
 * table that count is the expensive part of the query — so when it is absent
 * the page says what it actually knows rather than implying a total.
 */
function resultSummary(result: Paginated<PhotographDetail>, filtered: boolean): string {
  if (result.totalCount === null) {
    const shown = result.items.length;
    return `${shown} ${shown === 1 ? 'photograph' : 'photographs'} on this page`;
  }

  const noun = result.totalCount === 1 ? 'photograph' : 'photographs';
  const count = `${formatCount(result.totalCount)} ${noun}`;
  return filtered ? `${count} match these filters` : count;
}

async function DiscoverResults({
  query,
  feed,
}: {
  query: DiscoverQuery;
  feed: Promise<Paginated<PhotographDetail>>;
}) {
  const result = await feed;
  const filterCount = activeDiscoverFilterCount(query);

  return (
    <section aria-labelledby="discover-results-heading" className="mt-10">
      {/* The gallery needs a heading between the page h1 and the h3 an empty
          state renders, but naming it on screen would say nothing new. */}
      <h2 id="discover-results-heading" className="sr-only">
        Results
      </h2>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <p role="status" className="text-caption font-semibold text-ink tabular-nums">
          {resultSummary(result, filterCount > 0)}
        </p>
        <p className="text-meta text-muted">Ordered by {SORT_LABELS[query.sort].toLowerCase()}</p>
      </div>

      {result.items.length === 0 ? (
        <EmptyResults query={query} filterCount={filterCount} className="mt-8" />
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
function EmptyResults({
  query,
  filterCount,
  className,
}: {
  query: DiscoverQuery;
  filterCount: number;
  className?: string;
}) {
  if (filterCount > 0) {
    return (
      <EmptyState
        className={className}
        title="No photographs match these filters"
        description="The filters are stacked, so each one narrows what the one before it left. Drop one of them above, or clear them all and start again."
        action={
          <Button asChild variant="secondary">
            <Link href={buildClearedDiscoverHref(query)}>Clear all filters</Link>
          </Button>
        }
      />
    );
  }

  if (query.page > 1) {
    return (
      <EmptyState
        className={className}
        title="This page is past the end of the gallery"
        description="Photographs may have been removed since the link you followed was made."
        action={
          <Button asChild variant="secondary">
            <Link href={buildDiscoverHref(query, { page: 1 })}>Back to the first page</Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      className={className}
      title="No photographs have been published yet"
      description="The gallery fills up as members publish their work. The places are already mapped, so that is a good place to start."
      action={
        <Button asChild variant="secondary">
          <Link href="/locations">Explore the locations</Link>
        </Button>
      }
    />
  );
}
