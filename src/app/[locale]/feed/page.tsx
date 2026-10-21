import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { requireViewer } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/config';
import { getFollowingFeed } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';

/**
 * The feed: what the people you follow have published.
 *
 * `noIndex` because it is one member's view of the site and nobody else's —
 * there is nothing here for a search engine, and two members never see the
 * same page. The title is still written per language for the browser tab.
 *
 * It is deliberately a page of its own rather than another `?view=` on
 * discover: discover has a filter and sort grammar of its own, and a feed that
 * answered to `?category=` and `?sort=trending` would be promising a kind of
 * ranking this page does not do. This one is in published order, newest first,
 * and says so.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'feed' });

  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/feed',
    locale,
    noIndex: true,
  });
}

interface FeedPageProps {
  params: LocaleParams;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readPage(value: string | string[] | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(first ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function FeedPage({ params, searchParams }: FeedPageProps) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  // Signed-in only, and the redirect carries the way back here.
  const viewer = await requireViewer('/feed');
  const t = await getTranslations({ locale, namespace: 'feed' });

  const query = await searchParams;
  const page = readPage(query?.page);

  const result = await getFollowingFeed({
    followerId: viewer.id,
    page,
    pageSize: PAGE_SIZE.gallery,
  });

  return (
    <div className="site-container py-9 lg:py-14">
      <SectionHead eyebrow={t('eyebrow')} title={t('title')} headingLevel="h1" />
      <p className="mt-3 max-w-prose text-body text-muted">{t('lead')}</p>

      {result.items.length === 0 ? (
        /*
         * Two different nothings, and they need different advice. Following
         * nobody is a thing the member can fix in one click; following people
         * who have not published is not, and telling them to go find
         * photographers would be useless.
         */
        result.followsAnybody ? (
          <EmptyState
            title={t('quietTitle')}
            description={t('quietDescription')}
            action={
              <Button variant="secondary" asChild>
                <Link href="/discover">{t('browseDiscover')}</Link>
              </Button>
            }
            className="mt-10"
          />
        ) : (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Button asChild>
                <Link href="/community">{t('findPhotographers')}</Link>
              </Button>
            }
            className="mt-10"
          />
        )
      ) : (
        <>
          <MasonryGallery photos={result.items} priorityCount={4} className="mt-9" />
          <Pagination
            page={result.page}
            hasMore={result.hasMore}
            totalCount={result.totalCount}
            pageSize={result.pageSize}
            buildHref={(next) => (next === 1 ? '/feed' : `/feed?page=${next}`)}
            className="mt-12"
          />
        </>
      )}
    </div>
  );
}
