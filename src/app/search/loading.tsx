import { Eyebrow } from '@/components/ui/SectionHead';
import { GallerySkeleton, Skeleton, TextSkeleton } from '@/components/ui/states';

/**
 * The search shell while results resolve.
 *
 * The heading and the scope line are real text rather than grey bars: they are
 * already known, and replacing known text with a placeholder makes a page feel
 * slower than it is. Only the parts that depend on the query are skeletons.
 */
export default function SearchLoading() {
  return (
    <div className="site-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <Eyebrow>Search</Eyebrow>
        <h1 className="mt-3 text-section-fluid font-bold">
          Find a place, a frame, a{' '}
          <em className="font-serif font-normal italic">photographer.</em>
        </h1>
      </header>

      <div className="mt-7 flex max-w-2xl items-start gap-2.5">
        <Skeleton className="h-12 flex-1 rounded-field" />
        <Skeleton className="h-12 w-28 rounded-pill" />
      </div>

      <p className="mt-4 max-w-2xl text-caption leading-relaxed text-muted-soft">
        Search matches place names, cities and countries, and photographer names and usernames — not
        photograph titles, and never the content of the photographs themselves.
      </p>

      <div className="mt-12 space-y-16" aria-busy="true">
        <section aria-label="Photographs">
          <div className="pb-5">
            <Skeleton className="h-2.5 w-24 rounded-sm" />
            <Skeleton className="mt-3 h-6 w-48 rounded-sm" />
          </div>
          <GallerySkeleton count={8} />
        </section>

        <section aria-label="Places">
          <div className="pb-5">
            <Skeleton className="h-2.5 w-16 rounded-sm" />
            <Skeleton className="mt-3 h-6 w-32 rounded-sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-card border border-line bg-surface p-4">
                <TextSkeleton lines={3} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
