import { getTranslations } from 'next-intl/server';

import { GallerySkeleton, Skeleton } from '@/components/ui/states';

/**
 * The home page's loading state.
 *
 * It mirrors the real rhythm — hero columns, the stats rule, a section head and
 * the masonry grid — so the first paint lands in roughly the final positions
 * instead of jumping once the data arrives.
 *
 * Next hands a `loading.tsx` no params, so the locale cannot be read from the
 * route here as it is on every page. `getTranslations` is therefore called with
 * no locale and takes the one the enclosing layout has already declared with
 * `setRequestLocale` — which is why that call sits in
 * `src/app/[locale]/layout.tsx`, above this file in the tree, rather than only
 * in the pages.
 */
export default async function HomeLoading() {
  const t = await getTranslations('home');

  return (
    <div className="site-container pb-4" aria-busy>
      <p role="status" className="sr-only">
        {t('loading.status')}
      </p>

      {/* Hero */}
      <div className="grid items-end gap-7 pt-10 min-[650px]:grid-cols-[1fr_0.8fr] min-[650px]:gap-9 min-[650px]:pt-11 min-[950px]:grid-cols-[1.1fr_0.9fr] min-[950px]:pt-16">
        <div>
          <Skeleton className="h-2.5 w-52 rounded-sm" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-12 w-full rounded-sm min-[950px]:h-16" />
            <Skeleton className="h-12 w-4/5 rounded-sm min-[950px]:h-16" />
          </div>
          <div className="mt-6 max-w-[390px] space-y-2">
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-3 w-3/4 rounded-sm" />
          </div>
          <div className="mt-7 flex gap-2.5">
            <Skeleton className="h-12 w-48 rounded-pill" />
            <Skeleton className="h-12 w-40 rounded-pill" />
          </div>
        </div>

        <Skeleton className="h-[300px] w-full rounded-media min-[650px]:h-[330px] min-[950px]:h-[390px]" />
      </div>

      {/* Stats row */}
      <div className="mt-9 flex flex-wrap gap-x-10 gap-y-5 border-t border-line pt-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index}>
            <Skeleton className="h-5 w-16 rounded-sm" />
            <Skeleton className="mt-2 h-2.5 w-20 rounded-sm" />
          </div>
        ))}
      </div>

      {/* Curated gallery */}
      <div className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-6 pb-5">
          <div>
            <Skeleton className="h-2.5 w-44 rounded-sm" />
            <Skeleton className="mt-3 h-7 w-72 rounded-sm" />
          </div>
          <Skeleton className="h-3 w-56 rounded-sm" />
        </div>
        <GallerySkeleton count={8} />
      </div>

      {/* Location row */}
      <div className="mt-14">
        <div className="pb-5">
          <Skeleton className="h-2.5 w-36 rounded-sm" />
          <Skeleton className="mt-3 h-7 w-80 rounded-sm" />
        </div>
        <div className="grid gap-4 min-[900px]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[132px] w-full" />
          ))}
        </div>
      </div>

      {/* Inverted map block */}
      <Skeleton className="mt-[74px] h-[300px] w-full rounded-panel" />
    </div>
  );
}
