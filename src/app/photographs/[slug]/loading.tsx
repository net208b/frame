import { Skeleton } from '@/components/ui/states';

/**
 * The photograph page's loading state.
 *
 * It mirrors the real spread rather than filling the viewport with grey: the
 * image block keeps a plausible frame ratio and the information column keeps
 * its rhythm, so the page does not jump when the photograph arrives. One live
 * region announces the wait; every block inside it is decorative.
 */
export default function Loading() {
  return (
    <div className="site-container py-9 lg:py-14" role="status" aria-label="Loading the photograph">
      <Skeleton className="h-3 w-56 rounded-sm" />

      <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] lg:gap-14">
        <Skeleton className="aspect-[3/2] w-full rounded-media" />

        <div className="min-w-0">
          <Skeleton className="h-6 w-28 rounded-pill" />
          <Skeleton className="mt-4 h-8 w-11/12 rounded-sm" />
          <Skeleton className="mt-2 h-8 w-2/3 rounded-sm" />

          <div className="mt-6 space-y-2">
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-3 w-3/5 rounded-sm" />
          </div>

          <Skeleton className="mt-7 h-10 w-28 rounded-pill" />

          <div className="mt-11 flex gap-2">
            <Skeleton className="h-[72px] flex-1 rounded-card" />
            <Skeleton className="h-[72px] flex-1 rounded-card" />
            <Skeleton className="h-[72px] flex-1 rounded-card" />
          </div>

          <div className="mt-5 space-y-3">
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-3 w-5/6 rounded-sm" />
            <Skeleton className="h-3 w-4/6 rounded-sm" />
          </div>

          <Skeleton className="mt-11 h-52 w-full rounded-media" />
        </div>
      </div>

      <span className="sr-only">Loading the photograph</span>
    </div>
  );
}
