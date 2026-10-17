import { PhotoCard } from '@/components/photo/PhotoCard';
import { cn } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * The gallery layout. CSS columns keep every frame at its true aspect ratio
 * without measuring anything in JavaScript, so the first paint is the final
 * layout. The leading cards are marked priority because they are above the fold
 * on every viewport.
 */
export function MasonryGallery({
  photos,
  priorityCount = 4,
  showPhotographer = true,
  className,
}: {
  photos: readonly PhotographCard[];
  priorityCount?: number;
  showPhotographer?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('masonry-columns', className)}>
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          priority={index < priorityCount}
          showPhotographer={showPhotographer}
        />
      ))}
    </div>
  );
}
