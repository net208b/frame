import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * The newest photographs on the site, from anywhere, newest first.
 *
 * The first gallery on the home page used to be the editors' picks, which is
 * a surface that moves when an editor moves it. The site's owner wanted the
 * first thing a visitor sees to be what the community is doing *now*: the
 * latest frames published, wherever they were made, in the order they
 * arrived. So this comes first and the picks follow it.
 *
 * It is the discover feed's `recent` order — `published_at` descending — and
 * nothing more. No weighting, no editorial hand, no country filter: a frame
 * from Lisbon published a minute ago sits above one from Bangkok published
 * an hour ago, which is what "latest worldwide" has to mean to be honest.
 *
 * The same `MasonryGallery` and `PhotoCard` as Discover, so a frame looks like
 * itself wherever it is listed: image, category, title, place, appreciation
 * and photographer.
 */
export async function LatestWorldwide({
  photos,
  locale,
  className,
}: {
  photos: readonly PhotographCard[];
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section className={cn('mt-14', className)}>
      <SectionHead
        eyebrow={t('latest.eyebrow')}
        title={t('latest.title')}
        description={t('latest.description')}
      />

      {photos.length > 0 ? (
        <>
          {/* The hero holds the page's only priority image. */}
          <MasonryGallery photos={photos} priorityCount={0} />

          <p className="mt-2">
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
            >
              {t('latest.browseAll')}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </p>
        </>
      ) : (
        <EmptyState
          title={t('latest.emptyTitle')}
          description={t('latest.emptyDescription')}
          action={
            <Button asChild variant="secondary">
              <Link href="/upload">
                {t('latest.emptyAction')}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </Button>
          }
        />
      )}
    </section>
  );
}
