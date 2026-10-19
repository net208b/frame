import { GallerySkeleton, Skeleton } from '@/components/ui/states';

/**
 * The profile skeleton mirrors the real layout — avatar, name, biography, the
 * figures band, then the gallery — so the page does not jump when the data
 * lands. Only {@link GallerySkeleton} announces itself, which keeps a screen
 * reader hearing "loading" once rather than three times.
 */
export default function PhotographerProfileLoading() {
  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <div className="flex flex-col gap-7 border-b border-line pb-10 md:flex-row md:gap-10">
        <Skeleton className="size-[128px] shrink-0 rounded-pill" />

        <div className="w-full max-w-[58ch]">
          <Skeleton className="h-2.5 w-24 rounded-sm" />
          <Skeleton className="mt-4 h-9 w-3/5 rounded-sm" />
          <Skeleton className="mt-4 h-3 w-2/5 rounded-sm" />
          <div className="mt-7 space-y-2.5">
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-3 w-full rounded-sm" />
            <Skeleton className="h-3 w-1/2 rounded-sm" />
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-14">
        <div className="grid grid-cols-3 gap-5 border-y border-line py-5">
          {[0, 1, 2].map((cell) => (
            <div key={cell}>
              <Skeleton className="h-2.5 w-20 rounded-sm" />
              <Skeleton className="mt-3 h-5 w-14 rounded-sm" />
            </div>
          ))}
        </div>

        <div className="space-y-3 border-y border-line py-5">
          <Skeleton className="h-3 w-4/5 rounded-sm" />
          <Skeleton className="h-3 w-3/5 rounded-sm" />
        </div>
      </div>

      <div className="mt-14">
        <Skeleton className="h-2.5 w-20 rounded-sm" />
        <Skeleton className="mt-3 mb-6 h-7 w-72 rounded-sm" />
        <GallerySkeleton count={8} />
      </div>
    </div>
  );
}
