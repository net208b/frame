import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { LocationCard } from '@/components/location/LocationCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getLocations, getMapPins } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'location' });

  return buildMetadata({
    title: t('index.metaTitle'),
    description: t('index.metaDescription'),
    path: '/locations',
    locale,
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

/** A query string can repeat a key; the first value wins. */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.at(0) ?? '';
  return value ?? '';
}

function parsePage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function locationsHref(page: number, search: string): string {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/locations?${query}` : '/locations';
}

export default async function LocationsIndexPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: 'location' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);

  const search = firstValue(resolved.search).trim();
  const page = parsePage(firstValue(resolved.page));

  // `LocationSummary` carries no image, and asking for one photograph per card
  // would be eighteen extra queries. The map pin set is a single read that
  // already includes a preview for every place with a publishable point, so a
  // card without one is simply a place whose position is withheld.
  const [result, pins] = await Promise.all([
    getLocations({ search: search || undefined, page }),
    getMapPins(),
  ]);

  const previews = new Map(pins.map((pin) => [pin.id, pin.previewImageUrl]));
  const matched = result.totalCount ?? result.items.length;

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <Eyebrow>{t('index.eyebrow')}</Eyebrow>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <h1 className="text-display-fluid max-w-[16ch]">{t('index.title')}</h1>
        <Button asChild variant="accent">
          <Link href="/map">{t('openMap')}</Link>
        </Button>
      </div>

      <p className="mt-6 max-w-[62ch] text-lead leading-relaxed text-muted">{t('index.lead')}</p>

      {/* The no-JavaScript path. A GET form posts to a real address, so it
          carries the locale prefix itself rather than relying on a redirect
          that would land the reader in English. */}
      <form
        method="get"
        action={`/${locale}/locations`}
        role="search"
        className="mt-10 border-y border-line py-7"
      >
        <TextField
          label={t('index.searchLabel')}
          name="search"
          type="search"
          autoComplete="off"
          defaultValue={search}
          placeholder={t('index.searchPlaceholder')}
          hint={t('index.searchHint')}
          wrapperClassName="max-w-md"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit">{tCommon('search')}</Button>
          {search ? (
            <Button asChild variant="secondary">
              <Link href="/locations">{tCommon('clear')}</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <SectionHead
        className="mt-12"
        title={search ? t('index.resultsFor', { query: search }) : t('index.allPlaces')}
        description={
          search ? t('index.matchCount', { count: matched }) : t('index.ordering')
        }
      />

      {result.items.length === 0 ? (
        search ? (
          <EmptyState
            title={t('index.noMatchTitle')}
            description={t('index.noMatchBody')}
            action={
              <Button asChild variant="secondary">
                <Link href="/locations">{t('index.clearSearch')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('index.noneTitle')}
            description={t('index.noneBody')}
            action={
              <Button asChild variant="secondary">
                <Link href="/upload">{t('index.submitPlace')}</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((location) => (
              <li key={location.id} className="min-w-0">
                <LocationCard
                  location={location}
                  previewImageUrl={previews.get(location.id) ?? null}
                  categories={location.categories}
                />
              </li>
            ))}
          </ul>

          <Pagination
            className="mt-12"
            page={result.page}
            hasMore={result.hasMore}
            totalCount={result.totalCount}
            pageSize={result.pageSize}
            buildHref={(nextPage) => locationsHref(nextPage, search)}
          />
        </>
      )}
    </div>
  );
}
