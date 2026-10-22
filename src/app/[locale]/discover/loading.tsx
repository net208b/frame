import { GallerySkeleton, Skeleton } from '@/components/ui/states';

/**
 * The Discover placeholder.
 *
 * It mirrors the real layout — heading, chip row, search box, sort line, the
 * disclosure, then the gallery — so the page does not jump when the data lands.
 */
export default function DiscoverLoading() {
  return (
    <div className="site-container py-10 lg:py-14">
      <div className="max-w-2xl">
        <Skeleton className="h-2.5 w-40 rounded-sm" />
        <Skeleton className="mt-4 h-9 w-[22rem] max-w-full rounded-sm" />
        <Skeleton className="mt-5 h-3 w-full rounded-sm" />
        <Skeleton className="mt-2 h-3 w-3/5 rounded-sm" />
      </div>

      <div className="mt-8 border-y border-line py-6 lg:mt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="flex flex-wrap gap-2">
            {/* Keyed by position, not by the width: two chips are the same
                width, and React warns on — and may drop — a duplicate key. */}
            {['w-24', 'w-20', 'w-28', 'w-16', 'w-32', 'w-24', 'w-28'].map((width, index) => (
              <Skeleton key={index} className={`h-9 ${width} rounded-pill`} />
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-pill lg:w-[19rem] lg:shrink-0" />
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            {['w-28', 'w-32', 'w-20', 'w-24'].map((width, index) => (
              <Skeleton key={index} className={`h-4 ${width} rounded-sm`} />
            ))}
          </div>
          <Skeleton className="mt-4 h-3 w-[26rem] max-w-full rounded-sm" />
          <Skeleton className="mt-6 h-5 w-48 rounded-pill" />
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <Skeleton className="h-3.5 w-36 rounded-sm" />
        <Skeleton className="h-3 w-44 rounded-sm" />
      </div>

      <div className="mt-7">
        <GallerySkeleton count={8} />
      </div>
    </div>
  );
}
