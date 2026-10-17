import Link from 'next/link';

import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { cn, formatCount } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * Every published photograph made at this place.
 *
 * The photographer credit stays on each card: a location page is a shared
 * space, and the work in it belongs to the people who made it rather than to
 * the place.
 */
export function LocationGallery({
  photos,
  locationName,
  className,
}: {
  photos: readonly PhotographCard[];
  locationName: string;
  className?: string;
}) {
  const count = photos.length;

  return (
    <section aria-labelledby="location-gallery" className={cn('min-w-0', className)}>
      <SectionHead
        eyebrow="Made here"
        title={<span id="location-gallery">Photographs from this place</span>}
        description={
          count === 0
            ? 'Nothing published here yet.'
            : `${formatCount(count)} published ${count === 1 ? 'photograph' : 'photographs'}.`
        }
      />

      {count === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No photographs published here yet"
            description={`Nobody has published a photograph made at ${locationName}. If you have been, yours would be the first.`}
            action={
              <Button asChild variant="primary">
                <Link href="/upload">Add a photograph</Link>
              </Button>
            }
          />
          <CapabilityNotice capability="uploads" action="Publishing a photograph" />
        </div>
      ) : (
        // The gallery sits below the masthead and its map, so nothing here is
        // above the fold on any viewport and preloading would compete with the
        // content that is.
        <MasonryGallery photos={photos} priorityCount={0} showPhotographer />
      )}
    </section>
  );
}
