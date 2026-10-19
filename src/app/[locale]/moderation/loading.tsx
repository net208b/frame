import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/states';

/**
 * The queue, while it loads.
 *
 * Shaped like the rows it is standing in for — a wide detail column and a
 * narrower column of controls — so the page does not reflow once the real
 * queues arrive.
 *
 * This is the one component in the dashboard that reads its message with
 * `useTranslations` instead of `getTranslations({ locale, … })`. A `loading.tsx`
 * receives no params, so there is no locale to pass; and it is rendered as a
 * Suspense fallback, which has to resolve immediately — an async component here
 * would be a fallback that itself suspends. `useTranslations` reads the locale
 * the layout above already set with `setRequestLocale`, synchronously.
 */
export default function ModerationLoading() {
  const t = useTranslations('moderation');
  const label = t('loading.label');

  return (
    <div className="site-container py-10 lg:py-12" role="status" aria-label={label}>
      <Skeleton className="h-2.5 w-24 rounded-sm" />
      <Skeleton className="mt-3 h-9 w-[18rem] max-w-full rounded-sm" />
      <Skeleton className="mt-4 h-3.5 w-full max-w-[42rem] rounded-sm" />

      <div className="mt-9 flex gap-2 border-b border-line pb-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-6 w-28 shrink-0 rounded-pill" />
        ))}
      </div>

      <div className="mt-9 border-t border-line">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="grid gap-7 border-b border-line py-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]"
          >
            <div>
              <Skeleton className="h-5 w-2/5 rounded-sm" />
              <Skeleton className="mt-3 h-3 w-3/5 rounded-sm" />
              <Skeleton className="mt-2.5 h-3 w-1/3 rounded-sm" />
              <div className="mt-4 flex flex-wrap gap-2">
                <Skeleton className="h-6 w-36 rounded-pill" />
                <Skeleton className="h-6 w-28 rounded-pill" />
              </div>
            </div>
            <div className="flex flex-col gap-2.5 lg:border-l lg:border-line lg:pl-7">
              <Skeleton className="h-3 w-20 rounded-sm" />
              <Skeleton className="h-3.5 w-4/5 rounded-sm" />
              <Skeleton className="h-3.5 w-3/5 rounded-sm" />
              <Skeleton className="mt-2 h-20 w-full rounded-field" />
              <Skeleton className="mt-1 h-8 w-32 rounded-pill" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}
