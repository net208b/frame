import { useTranslations } from 'next-intl';

import { GallerySkeleton, Skeleton } from '@/components/ui/states';

/**
 * Mirrors the location page: masthead, map column, notes, then the gallery.
 *
 * Synchronous, and reading the locale from the request configuration the
 * `[locale]` layout settled, for the reason given in the locations index
 * loading file: a Suspense fallback cannot be an async component.
 */
export default function LocationDetailLoading() {
  const t = useTranslations('location');

  return (
    <div className="pb-20">
      <p role="status" className="sr-only">
        {t('detail.loading')}
      </p>

      <div className="site-container border-b border-line pt-10 pb-12 lg:pt-14">
        <Skeleton className="h-2.5 w-24 rounded-sm" />
        <Skeleton className="mt-5 h-16 w-full max-w-lg rounded-sm" />
        <Skeleton className="mt-5 h-5 w-56 rounded-sm" />

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
          <div className="min-w-0">
            <Skeleton className="h-24 w-full max-w-xl rounded-sm" />
            <div className="mt-9 flex gap-12 border-t border-line pt-7">
              <Skeleton className="h-12 w-24 rounded-sm" />
              <Skeleton className="h-12 w-40 rounded-sm" />
            </div>
            <Skeleton className="mt-8 h-7 w-56 rounded-pill" />
            <Skeleton className="mt-9 h-5 w-72 rounded-sm" />
          </div>

          <div className="min-w-0 space-y-4">
            <Skeleton className="h-[320px] w-full rounded-media" />
            <Skeleton className="h-36 w-full rounded-card" />
          </div>
        </div>
      </div>

      <div className="site-container grid gap-12 border-b border-line py-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Skeleton className="h-6 w-40 rounded-sm" />
          <Skeleton className="mt-4 h-40 w-full rounded-sm" />
        </div>
        <div>
          <Skeleton className="h-6 w-52 rounded-sm" />
          <Skeleton className="mt-4 h-40 w-full rounded-card" />
        </div>
      </div>

      <div className="site-container py-14">
        <Skeleton className="h-7 w-64 rounded-sm" />
        <div className="mt-6">
          <GallerySkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
