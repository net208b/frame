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
 * The editor-picked gallery.
 *
 * An editorial surface has to be visibly editorial, so the eyebrow names who
 * chose these frames and the description explains the ranking rather than
 * leaving the reader to infer it.
 *
 * `home.curated.description` repeats, word for word in English, the sentence
 * `SORT_EXPLANATIONS.editors` carries in `src/types/domain.ts` — one
 * explanation of this ranking, as before. It is a message here rather than a
 * read of that constant because the constant is a plain English string in a
 * file this translation does not own, so reading it would have printed English
 * on the Thai page. Whoever translates the domain labels should collapse the
 * two back into one source; until then these two sentences must be changed
 * together.
 */
export async function CuratedGallery({
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
        eyebrow={t('curated.eyebrow')}
        title={t('curated.title')}
        description={t('curated.description')}
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
              {t('curated.browseAll')}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </p>
        </>
      ) : (
        <EmptyState
          title={t('curated.emptyTitle')}
          description={t('curated.emptyDescription')}
          action={
            <Button asChild variant="secondary">
              <Link href="/discover">
                {t('curated.browseAll')}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </Button>
          }
        />
      )}
    </section>
  );
}
