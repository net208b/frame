import { useTranslations } from 'next-intl';

import { GallerySkeleton, Skeleton } from '@/components/ui/states';

/**
 * The collection page's loading state: a masthead, then the gallery skeleton
 * the rest of FRAME uses, so the entries settle into the same column rhythm
 * they will occupy.
 *
 * No `params` reach a `loading.tsx`, so its one sentence comes through
 * next-intl's React API rather than `getTranslations`; the `[locale]` layout
 * has already declared the locale for this request.
 */
export default function CollectionLoading() {
  const t = useTranslations('collections');
  const label = t('loading.detail');

  return (
    <div className="site-container py-12 md:py-16">
      <div className="border-b border-line pb-8" role="status" aria-label={label}>
        <Skeleton className="h-2.5 w-24 rounded-sm" />
        <Skeleton className="mt-4 h-9 w-full max-w-lg rounded-sm" />
        <Skeleton className="mt-5 h-4 w-full max-w-xl rounded-sm" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-md rounded-sm" />

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Skeleton className="size-8 rounded-pill" />
          <Skeleton className="h-3 w-32 rounded-sm" />
          <Skeleton className="h-6 w-20 rounded-pill" />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>

        <span className="sr-only">{label}</span>
      </div>

      <div className="mt-12 md:mt-14">
        <Skeleton className="h-2.5 w-20 rounded-sm" />
        <Skeleton className="mt-3 h-7 w-56 rounded-sm" />
        <GallerySkeleton count={8} />
      </div>
    </div>
  );
}
