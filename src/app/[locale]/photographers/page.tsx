import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { getPhotographerDirectory } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';

/**
 * Who is here.
 *
 * The third axis of discovery: places have `/locations`, styles have their
 * landing pages, and people had only a featured band on `/community` and a
 * search box. This is the browse — every member who has not been suspended,
 * newest first.
 *
 * NEWEST, NOT MOST APPRECIATED, and there is no control to change it. A
 * directory ordered by appreciation is a leaderboard, and the rule this
 * platform is built on is that likes do not decide value (§7.4). "Newest first"
 * is also the one ordering the schema indexes for this question —
 * `profiles_active_idx` — so it is both the honest default and the cheap one.
 * Alphabetical and by-city would each need an index of their own; they are
 * absent rather than offered as an unindexed scan.
 */

/**
 * Rendered on demand, never prerendered: the read goes through the
 * cookie-bound Supabase client. Named in `scripts/assert-dynamic-routes.sh`,
 * whose list is hard-coded.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'profile' });

  return buildMetadata({
    locale,
    title: t('directory.metaTitle'),
    description: t('directory.metaDescription'),
    path: '/photographers',
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value.at(0) : value;
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function PhotographersPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'profile' });
  const page = parsePage(resolved.page);
  const directory = await getPhotographerDirectory(page);

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>{t('directory.eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">{t('directory.heading')}</h1>
        <p className="mt-4 text-lead text-muted">{t('directory.lead')}</p>
        {/* Said plainly, because an ordering nobody explained is an ordering
            people assume is a ranking. */}
        <p className="mt-3 text-meta text-muted">{t('directory.ordering')}</p>
      </header>

      {directory.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={
            page > 1 ? t('directory.pastEndTitle') : t('directory.noneTitle')
          }
          description={page > 1 ? t('directory.pastEndBody') : t('directory.noneBody')}
          action={
            <Button asChild variant="secondary">
              <Link href={page > 1 ? '/photographers' : '/join'}>
                {page > 1 ? t('directory.pastEndAction') : t('directory.noneAction')}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {directory.items.map((photographer) => (
              <li key={photographer.id}>
                <PhotographerCard photographer={photographer} />
              </li>
            ))}
          </ul>

          <Pagination
            page={directory.page}
            hasMore={directory.hasMore}
            totalCount={directory.totalCount}
            pageSize={directory.pageSize}
            buildHref={(next) => (next > 1 ? `/photographers?page=${next}` : '/photographers')}
            className="mt-12"
          />
        </>
      )}
    </div>
  );
}
