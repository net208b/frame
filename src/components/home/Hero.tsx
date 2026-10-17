import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { IMAGE_SIZES } from '@/lib/images/variants';
import { cn } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * The opening spread.
 *
 * Two columns, bottom-aligned, collapsing to one under 650px exactly as the
 * prototype does. The left column carries the only h1 on the page; the right
 * carries the cover frame, which is the single priority image in the document.
 */

/** Where the cover frame sits inside the set it was chosen from. */
export interface HeroIndex {
  position: number;
  total: number;
  /** One sentence saying what the pill counts, read by assistive technology. */
  note: string;
}

/** Matches the prototype's three hero heights. */
const MEDIA_HEIGHT = 'h-[300px] min-[650px]:h-[330px] min-[950px]:h-[390px]';

function pad(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(2, '0');
}

export function Hero({
  featured,
  featuredEyebrow,
  featuredIndex,
  signedIn,
  className,
}: {
  featured: PhotographCard | null;
  /** Why this frame is on the cover, shown verbatim: "Trending now". */
  featuredEyebrow: string;
  featuredIndex: HeroIndex | null;
  signedIn: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'grid items-end gap-7 pt-10',
        'min-[650px]:grid-cols-[1fr_0.8fr] min-[650px]:gap-9 min-[650px]:pt-11',
        'min-[950px]:grid-cols-[1.1fr_0.9fr] min-[950px]:pt-16',
        className,
      )}
    >
      <div>
        <Eyebrow>Street photography, place by place</Eyebrow>

        <h1 className="mt-5 max-w-[760px] text-display-fluid">
          Start with a place. The frame{' '}
          {/* The one serif italic accent in the product, as in the prototype. */}
          <em className="font-serif font-normal tracking-[-0.09em] italic">follows</em>.
        </h1>

        <p className="mt-6 max-w-[390px] text-lead text-muted">
          Every photograph here is pinned to the place it was made, with the settings behind it.
          Begin with a city, a corner or a single frame, and find somewhere worth standing.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Button asChild size="lg">
            <Link href="/discover">
              Explore photographs
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="secondary" size="lg">
            <Link href={signedIn ? '/upload' : '/join'}>Share your work</Link>
          </Button>
        </div>
      </div>

      {featured ? (
        <CoverFrame photo={featured} eyebrow={featuredEyebrow} index={featuredIndex} />
      ) : (
        <NoCoverFrame />
      )}
    </section>
  );
}

function CoverFrame({
  photo,
  eyebrow,
  index,
}: {
  photo: PhotographCard;
  eyebrow: string;
  index: HeroIndex | null;
}) {
  const place = photo.location ? `${photo.location.city}, ${photo.location.country}` : null;

  return (
    <figure className={cn('relative overflow-hidden rounded-media bg-surface-sunken', MEDIA_HEIGHT)}>
      <Image
        src={photo.image.displayUrl}
        alt={photo.altText}
        fill
        sizes={IMAGE_SIZES.hero}
        priority
        placeholder={photo.image.blurDataUrl ? 'blur' : 'empty'}
        blurDataURL={photo.image.blurDataUrl}
        className="object-cover saturate-[0.82]"
      />

      {/* A short gradient across the caption band only.
          A text shadow alone was not enough: the frame behind this caption can
          be any value at all, and over a bright, busy one — a wall of
          advertising screens, snow, open sky — 10px uppercase stopped being
          readable, which is not acceptable for the line that credits the
          photographer. The gradient is kept shallow and weak, and the shadow is
          kept as well, so the frame still reads as a photograph rather than as
          a darkened thumbnail. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-ink/60 via-ink/25 to-transparent"
      />

      <figcaption className="absolute inset-x-[18px] bottom-[18px] flex items-end justify-between gap-4">
        <div className="min-w-0 [text-shadow:0_1px_8px_rgb(0_0_0/0.55)]">
          <p className="text-eyebrow text-on-ink uppercase">
            {eyebrow}
            {place ? ` · ${place}` : ''}
          </p>

          <p className="mt-1.5 text-lead font-semibold text-on-ink">
            <Link
              href={`/photographs/${photo.slug}`}
              className="before:absolute before:inset-0 before:content-['']"
            >
              {photo.title}
            </Link>
          </p>

          <p className="mt-1 text-meta text-on-ink-muted">
            <Link
              href={`/photographers/${photo.photographer.username}`}
              className="relative z-10 transition-colors duration-150 hover:text-on-ink"
            >
              {photo.photographer.displayName}
            </Link>
          </p>
        </div>

        {index ? (
          <span className="relative z-10 shrink-0 rounded-pill bg-surface/88 px-3 py-2 text-eyebrow text-ink uppercase tabular-nums">
            {pad(index.position)}
            <span aria-hidden> / </span>
            {pad(index.total)}
            <span className="sr-only">{`. ${index.note}`}</span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

function NoCoverFrame() {
  return (
    <div
      className={cn(
        'flex items-end rounded-media border border-dashed border-line bg-surface p-6',
        MEDIA_HEIGHT,
      )}
    >
      <p className="text-caption text-muted">
        No photographs have been published yet, so there is no cover frame to show. The first
        published photograph will appear here.
      </p>
    </div>
  );
}
