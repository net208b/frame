import { Skeleton } from '@/components/ui/states';

/** Mirrors the real index so the page does not jump when the data lands. */
export default function LocationsIndexLoading() {
  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <p role="status" className="sr-only">
        Loading locations
      </p>

      <Skeleton className="h-2.5 w-36 rounded-sm" />
      <Skeleton className="mt-5 h-20 w-full max-w-xl rounded-sm" />
      <Skeleton className="mt-6 h-12 w-full max-w-2xl rounded-sm" />

      <div className="mt-10 border-y border-line py-7">
        <Skeleton className="h-3 w-24 rounded-sm" />
        <Skeleton className="mt-2 h-11 w-full max-w-md rounded-field" />
        <Skeleton className="mt-4 h-10 w-24 rounded-pill" />
      </div>

      <Skeleton className="mt-12 h-7 w-48 rounded-sm" />

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <li key={index}>
            <div className="flex items-start gap-4 rounded-card border border-line bg-surface p-4">
              <Skeleton className="size-24 shrink-0 rounded-media" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-3/4 rounded-sm" />
                <Skeleton className="mt-2 h-3 w-1/2 rounded-sm" />
                <Skeleton className="mt-3 h-3 w-2/5 rounded-sm" />
                <Skeleton className="mt-4 h-6 w-28 rounded-pill" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
