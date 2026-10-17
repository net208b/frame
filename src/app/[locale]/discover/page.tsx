import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { DiscoverToolbar } from '@/components/discover/DiscoverToolbar';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState, GallerySkeleton } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
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
import { taxonomyLabels } from '@/lib/taxonomy';
import { formatCount } from '@/lib/utils';
import type { DiscoverQuery, Paginated, PhotographDetail } from '@/types/domain';

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
    path: buildDiscoverHref(query),
    // Filters, orderings and pages multiply into thousands of near-identical
    // views. Indexing them would bury the pages worth finding.
    noIndex: filtered,
  });
}

export default async function DiscoverPage({ params, searchParams }: DiscoverPageProps) {
  const [{ locale }, resolvedSearchParams] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'discover' });
  const query = normaliseDiscoverQuery(parseDiscoverSearchParams(resolvedSearchParams));

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
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">{t('heading')}</h1>
        <p className="mt-4 text-lead text-muted">{t('lead')}</p>
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
        <DiscoverResults query={query} feed={feed} locale={locale} />
      </Suspense>
    </div>
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
  query: DiscoverQuery;
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
  query: DiscoverQuery;
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
