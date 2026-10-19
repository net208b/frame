import { useLocale, useTranslations } from 'next-intl';

import { Eyebrow } from '@/components/ui/SectionHead';
import { GallerySkeleton, Skeleton, TextSkeleton } from '@/components/ui/states';

/**
 * The search shell while results resolve.
 *
 * The heading and the scope line are real text rather than grey bars: they are
 * already known, and replacing known text with a placeholder makes a page feel
 * slower than it is. Only the parts that depend on the query are skeletons.
 *
 * A `loading.tsx` receives no `params`, so it cannot call `setRequestLocale`
 * itself and reads its copy through next-intl's React API instead of
 * `getTranslations`. The `[locale]` layout above it has already declared the
 * locale for this request, which is what keeps that read static.
 */
export default function SearchLoading() {
  const locale = useLocale();
  const t = useTranslations('search');
  const common = useTranslations('common');

  // See the note on the same device in `search/page.tsx`: Instrument Serif has
  // no Thai glyphs and a synthesised italic would shear the vowel and tone
  // marks, so Thai takes its accent from weight instead of style.
  const accent = locale === 'th' ? 'font-normal not-italic' : 'font-serif font-normal italic';

  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">
          {t.rich('heading', {
            accent: (chunks) => <em className={accent}>{chunks}</em>,
          })}
        </h1>
      </header>

      <div className="mt-7 flex max-w-2xl items-start gap-2.5">
        <Skeleton className="h-12 flex-1 rounded-field" />
        <Skeleton className="h-12 w-28 rounded-pill" />
      </div>

      <p className="mt-4 max-w-2xl text-caption leading-relaxed text-muted-soft">{t('scope')}</p>

      {/* `role="status"` is what makes the label below count: `aria-label` on a
          plain div has no role to attach to and is dropped. */}
      <div className="mt-12 space-y-16" role="status" aria-busy="true" aria-label={t('loading.label')}>
        <section aria-label={common('photographs')}>
          <div className="pb-5">
            <Skeleton className="h-2.5 w-24 rounded-sm" />
            <Skeleton className="mt-3 h-6 w-48 rounded-sm" />
          </div>
          <GallerySkeleton count={8} />
        </section>

        <section aria-label={common('places')}>
          <div className="pb-5">
            <Skeleton className="h-2.5 w-16 rounded-sm" />
            <Skeleton className="mt-3 h-6 w-32 rounded-sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-card border border-line bg-surface p-4">
                <TextSkeleton lines={3} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
