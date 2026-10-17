import { Skeleton } from '@/components/ui/states';

/**
 * The index's loading state.
 *
 * It mirrors the real page's rhythm — one display headline, then a grid of
 * 3:2 covers with two lines of metadata — so the page settles into place
 * rather than jumping when the data arrives.
 */
export default function CollectionsLoading() {
  return (
    <div className="site-container py-14 md:py-20" role="status" aria-label="Loading collections">
      <div className="max-w-[46rem]">
        <Skeleton className="h-2.5 w-28 rounded-sm" />
        <Skeleton className="mt-5 h-14 w-full rounded-sm md:h-20" />
        <Skeleton className="mt-4 h-14 w-2/3 rounded-sm md:h-20" />
        <Skeleton className="mt-7 h-12 w-72 rounded-sm" />
        <Skeleton className="mt-8 h-10 w-44 rounded-pill" />
      </div>

      <div className="mt-16 md:mt-20">
        <Skeleton className="h-2.5 w-20 rounded-sm" />
        <Skeleton className="mt-3 h-7 w-64 rounded-sm" />

        <div className="mt-8 grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[3/2] w-full rounded-media" />
              <Skeleton className="mt-3 h-3.5 w-3/5 rounded-sm" />
              <Skeleton className="mt-2 h-3 w-4/5 rounded-sm" />
              <Skeleton className="mt-2 h-3 w-2/5 rounded-sm" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading collections</span>
    </div>
  );
}
