import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { SORT_EXPLANATIONS, type PhotographCard } from '@/types/domain';

/**
 * The editor-picked gallery.
 *
 * An editorial surface has to be visibly editorial, so the eyebrow names who
 * chose these frames and the description is the same sentence the Discover
 * sort uses — one explanation of this ranking, in one place.
 */
export function CuratedGallery({
  photos,
  className,
}: {
  photos: readonly PhotographCard[];
  className?: string;
}) {
  return (
    <section className={cn('mt-14', className)}>
      <SectionHead
        eyebrow="Chosen by FRAME editors"
        title="Frames worth finding."
        description={SORT_EXPLANATIONS.editors}
      />

      {photos.length > 0 ? (
        <>
          {/* The hero holds the page's only priority image. */}
          <MasonryGallery photos={photos} priorityCount={0} />

          <p className="mt-2">
            <Link
              href="/discover"
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
            >
              Browse every published photograph
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </p>
        </>
      ) : (
        <EmptyState
          title="No editor’s picks yet"
          description="Nothing has been selected for this surface so far. Everything published is still there to look through."
          action={
            <Button asChild variant="secondary">
              <Link href="/discover">
                Browse every published photograph
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </Button>
          }
        />
      )}
    </section>
  );
}
