import { Images } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { CategoryTag } from '@/components/photo/CategoryTag';
import { cn, formatCount } from '@/lib/utils';
import type { LocationSummary, PhotoCategory } from '@/types/domain';

/** Metres for anything walkable, kilometres beyond that. */
function formatDistance(metres: number): string | null {
  if (!Number.isFinite(metres) || metres < 0) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function LocationCard({
  location,
  previewImageUrl,
  categories,
  distanceMetres,
  className,
}: {
  location: LocationSummary;
  previewImageUrl?: string | null;
  categories?: PhotoCategory[];
  distanceMetres?: number;
  className?: string;
}) {
  const distance = distanceMetres === undefined ? null : formatDistance(distanceMetres);

  return (
    <article
      className={cn(
        'relative flex items-start gap-4 rounded-card border border-line bg-surface p-4',
        'transition-colors duration-150 hover:border-line-strong',
        className,
      )}
    >
      {previewImageUrl ? (
        <Image
          src={previewImageUrl}
          // Decorative: the name and place beside it already identify the spot,
          // and nothing here can describe what the photograph shows.
          alt=""
          width={96}
          height={96}
          sizes="96px"
          className="size-24 shrink-0 rounded-media border border-line object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <h3 className="text-body font-bold tracking-[-0.035em]">
          <Link
            href={`/locations/${location.slug}`}
            className="before:absolute before:inset-0 before:content-['']"
          >
            {location.name}
          </Link>
        </h3>

        <p className="mt-1 text-meta text-muted">
          {location.city}, {location.country}
        </p>

        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-muted-soft">
          <Images aria-hidden className="inline size-3" />
          <span className="tabular-nums">
            {formatCount(location.photographCount)}{' '}
            {location.photographCount === 1 ? 'photograph' : 'photographs'}
          </span>
          {distance ? <span aria-hidden>·</span> : null}
          {distance ? <span className="tabular-nums">{distance} away</span> : null}
        </p>

        {categories && categories.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <li key={category}>
                <CategoryTag category={category} tone="outline" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
