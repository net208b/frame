import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/states';

/**
 * Mirrors the explorer's two-column frame, so the map does not jump sideways
 * when the pins land. The heights match MapExplorer's own.
 *
 * A `loading.tsx` receives no `params`, so there is no locale to pass. It does
 * not need one: this file is the Suspense fallback for a page *inside*
 * `src/app/[locale]/layout.tsx`, and that layout has already called
 * `setRequestLocale`, which is what next-intl reads here. Static rendering is
 * therefore preserved — `getRequestLocale` only falls back to the middleware
 * header when no locale has been declared.
 *
 * Deliberately not `async`, and reading its one sentence through next-intl's
 * React API rather than `getTranslations`: a Suspense fallback that suspends
 * while it renders has nowhere to fall back to.
 */
export default function MapLoading() {
  const t = useTranslations('map');

  return (
    <div className="site-container pt-8 pb-14">
      <p role="status" className="sr-only">
        {t('page.loading')}
      </p>

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-6">
        <div>
          <Skeleton className="h-2.5 w-32 rounded-sm" />
          <Skeleton className="mt-3 h-6 w-28 rounded-sm" />
        </div>
        <Skeleton className="h-12 w-full max-w-[36rem] rounded-sm" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <Skeleton className="h-[62vh] min-h-[26rem] w-full rounded-panel lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem]" />

        <div className="mt-4 hidden flex-col gap-2 lg:mt-0 lg:flex">
          <Skeleton className="h-2.5 w-20 rounded-sm" />
          <Skeleton className="h-11 w-full rounded-field" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-24 rounded-pill" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[4.25rem] w-full rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
