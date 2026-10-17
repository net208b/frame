import { PhotoCard } from '@/components/photo/PhotoCard';
import { Eyebrow } from '@/components/ui/SectionHead';
import { cn } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * Two labelled rows at the foot of the photograph page: other frames from the
 * same place, and other frames by the same photographer.
 *
 * Each row scrolls sideways where there is no space for it to sit flat, and a
 * row with nothing in it is left out rather than shown empty — "no other
 * photographs here yet" is a sentence the reader did not ask for.
 */

function Row({
  eyebrow,
  title,
  photos,
}: {
  eyebrow: string;
  title: string;
  photos: readonly PhotographCard[];
}) {
  if (photos.length === 0) return null;

  return (
    <section className="min-w-0">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-section font-bold">{title}</h2>

      {/* A horizontal scroller below lg, an even row above it. The cards are
          real links, so the scroller is reachable by keyboard through them. */}
      <ul
        className={cn(
          'mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2',
          'lg:grid lg:snap-none lg:grid-cols-4 lg:overflow-visible lg:pb-0',
        )}
      >
        {photos.slice(0, 4).map((photo) => (
          <li
            key={photo.id}
            className="w-[72vw] max-w-[320px] shrink-0 snap-start sm:w-[300px] lg:w-auto lg:max-w-none"
          >
            <PhotoCard photo={photo} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RelatedStrip({
  sameLocation,
  byPhotographer,
  locationName,
  photographerName,
  className,
}: {
  sameLocation: readonly PhotographCard[];
  byPhotographer: readonly PhotographCard[];
  /** Null when the photograph has no place, which also hides that row. */
  locationName: string | null;
  photographerName: string;
  className?: string;
}) {
  const atLocation = locationName ? sameLocation : [];

  if (atLocation.length === 0 && byPhotographer.length === 0) return null;

  return (
    <div className={cn('space-y-14', className)}>
      <Row
        eyebrow="More from this place"
        title={locationName ? `Other frames at ${locationName}` : 'Other frames at this place'}
        photos={atLocation}
      />
      <Row
        eyebrow="More by this photographer"
        title={`Other frames by ${photographerName}`}
        photos={byPhotographer}
      />
    </div>
  );
}
