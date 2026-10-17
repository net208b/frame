import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { CoordinateDisclosure } from '@/components/location/CoordinateDisclosure';
import { StaticLocationMap } from '@/components/map/StaticLocationMap';
import { CategoryTag } from '@/components/photo/CategoryTag';
import { Avatar } from '@/components/photographer/Avatar';
import { ReportDialog } from '@/components/system/ReportDialog';
import { cn, formatCount, formatDate } from '@/lib/utils';
import type { LocationDetail } from '@/types/domain';

/**
 * The masthead of a location page: what this place is, where it is, what it is
 * good for, and who vouched for it.
 *
 * The map and the coordinate disclosure sit together on purpose. A pin on its
 * own invites a reader to assume it is exact, so the sentence that says how
 * exact it actually is belongs directly beneath it.
 */
export function LocationHeader({
  location,
  className,
}: {
  location: LocationDetail;
  className?: string;
}) {
  const approved = formatDate(location.approvedAt);
  const submitter = location.submittedBy;

  return (
    <header className={cn('site-container border-b border-line pt-10 pb-12 lg:pt-14', className)}>
      {/* /locations is not in the main navigation, so the way back lives here. */}
      <Link
        href="/locations"
        className="inline-flex items-center gap-1.5 text-meta font-semibold text-muted transition-colors duration-150 hover:text-ink"
      >
        <ChevronLeft aria-hidden className="size-3.5" />
        All locations
      </Link>

      <h1 className="text-display-fluid mt-5 max-w-[22ch]">{location.name}</h1>

      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-lead text-muted">
        <span>
          {location.city}, {location.country}
        </span>
        <span className="rounded-pill border border-line px-2 py-1 text-eyebrow text-ink-soft uppercase">
          {location.countryCode}
          <span className="sr-only"> is the ISO country code</span>
        </span>
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
        <div className="min-w-0">
          {location.description ? (
            <p className="max-w-[56ch] text-lead leading-relaxed text-ink-soft">
              {location.description}
            </p>
          ) : (
            <p className="max-w-[56ch] text-lead leading-relaxed text-muted">
              No description has been written for this place yet.
            </p>
          )}

          <dl className="mt-9 flex flex-wrap gap-x-12 gap-y-6 border-t border-line pt-7">
            <div>
              <dt className="text-eyebrow text-muted uppercase">Photographs</dt>
              <dd className="mt-2 text-title font-bold tabular-nums">
                {formatCount(location.photographCount)}
              </dd>
            </div>

            {location.bestTimeOfDay ? (
              <div className="max-w-[26ch]">
                <dt className="text-eyebrow text-muted uppercase">Best time of day</dt>
                <dd className="mt-2 text-body font-semibold text-ink">{location.bestTimeOfDay}</dd>
              </div>
            ) : null}
          </dl>

          {location.categories.length > 0 ? (
            <div className="mt-8">
              <p id="location-categories" className="text-eyebrow text-muted uppercase">
                Good for
              </p>
              <ul
                aria-labelledby="location-categories"
                className="mt-3 flex flex-wrap gap-1.5"
              >
                {location.categories.map((category) => (
                  <li key={category}>
                    <CategoryTag category={category} tone="surface" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-line pt-6">
            <div className="flex min-w-0 items-center gap-2.5">
              {submitter ? (
                <Avatar src={submitter.avatarUrl} name={submitter.displayName} size={28} decorative />
              ) : null}
              <p className="text-meta leading-relaxed text-muted">
                {submitter ? (
                  <>
                    Submitted by{' '}
                    <Link
                      href={`/photographers/${submitter.username}`}
                      className="font-semibold text-ink-soft"
                    >
                      {submitter.displayName}
                    </Link>
                  </>
                ) : (
                  'Submitter not on record'
                )}
                {approved ? ` · Approved by a moderator on ${approved}` : ' · Approval date not recorded'}
              </p>
            </div>

            <ReportDialog
              subjectType="location"
              subjectId={location.id}
              subjectLabel={`${location.name}, ${location.city}`}
              triggerLabel="Report an incorrect location"
              triggerVariant="ghost"
            />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {location.coordinates ? (
            <StaticLocationMap
              latitude={location.coordinates.latitude}
              longitude={location.coordinates.longitude}
              name={location.name}
              isApproximate={location.coordinates.isApproximate}
              precisionDecimals={location.coordinates.precisionDecimals}
              heightClassName="h-[320px]"
              className="overflow-hidden rounded-media border border-line"
            />
          ) : null}

          <CoordinateDisclosure coordinates={location.coordinates} locationName={location.name} />
        </div>
      </div>
    </header>
  );
}
