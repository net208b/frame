import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { StaticLocationMap } from '@/components/map/StaticLocationMap';
import { Eyebrow } from '@/components/ui/SectionHead';
import { precisionLabel } from '@/lib/geo';
import { cn, formatCoordinates } from '@/lib/utils';
import type { LocationDetail, LocationSummary } from '@/types/domain';

/**
 * Where the frame was made.
 *
 * Coordinates are a privacy decision rather than a data field, so this panel
 * renders only what the domain object carries. `LocationDetail.coordinates` has
 * already been through `publishableCoordinates`: a sensitive place arrives
 * coarsened and a withheld one arrives as null. Nothing here recomputes,
 * re-rounds or re-derives a point, because every one of those would be a way to
 * widen precision after the policy had already narrowed it.
 */
export function LocationPanel({
  summary,
  detail,
  className,
}: {
  /** The place as the photograph carries it. Null when none was attached. */
  summary: LocationSummary | null;
  /** The full location record, which is where a publishable point lives. */
  detail: LocationDetail | null;
  className?: string;
}) {
  if (!summary) {
    return (
      <section className={cn('min-w-0', className)}>
        <Eyebrow>Place</Eyebrow>
        <h2 className="mt-2 text-title font-bold">No place attached</h2>
        <p className="mt-3 text-caption leading-relaxed text-muted">
          The photographer did not attach a place to this frame. Pinning a location is optional,
          and a photograph is never assigned one automatically from its file.
        </p>
      </section>
    );
  }

  const coordinates = detail?.coordinates ?? null;

  return (
    <section className={cn('min-w-0', className)}>
      <Eyebrow>Place</Eyebrow>
      <h2 className="mt-2 text-title font-bold">
        <Link
          href={`/locations/${summary.slug}`}
          className="inline-flex items-start gap-1.5 transition-colors duration-150 hover:text-ink-soft"
        >
          {summary.name}
          <ArrowUpRight aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
        </Link>
      </h2>

      <p className="mt-1.5 text-caption text-muted">
        {summary.city}, {summary.country}
      </p>

      {coordinates ? (
        <>
          <StaticLocationMap
            latitude={coordinates.latitude}
            longitude={coordinates.longitude}
            name={summary.name}
            isApproximate={coordinates.isApproximate}
            precisionDecimals={coordinates.precisionDecimals}
            heightClassName="h-52"
            className="mt-4"
          />

          <p className="mt-3 text-meta text-muted">
            <span className="tabular-nums">
              {formatCoordinates(
                coordinates.latitude,
                coordinates.longitude,
                coordinates.precisionDecimals,
              )}
            </span>
          </p>

          {coordinates.isApproximate ? (
            <p className="mt-2 text-meta leading-relaxed text-muted">
              This point is deliberately approximate, accurate to{' '}
              {precisionLabel(coordinates.precisionDecimals)}. The precision was reduced on
              purpose because publishing the exact spot could cause harm.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-caption leading-relaxed text-muted">
          No coordinate is published for this place, so there is no point to put on a map. That is
          either a privacy decision taken by a moderator or a location that has not been given one.
        </p>
      )}
    </section>
  );
}
