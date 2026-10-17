import type { Metadata } from 'next';
import Link from 'next/link';

import { MapExplorer } from '@/components/map/MapExplorer';
import { SELECTED_PARAM } from '@/components/map/map-style';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { getMapPins } from '@/lib/data/repository';
import { precisionLabel } from '@/lib/geo';
import { buildMetadata } from '@/lib/seo';
import { formatCount } from '@/lib/utils';

export const metadata: Metadata = buildMetadata({
  title: 'Map',
  description:
    'Every approved street-photography location on one map, with the photographs made at each place. Positions that are deliberately imprecise are marked as such.',
  path: '/map',
});

type SearchParams = Record<string, string | string[] | undefined>;

/** A query string can repeat a key; the first value wins. */
function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value.at(0) : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  // Read on the server so a shared link arrives with its place already chosen
  // rather than selecting itself a moment after hydration.
  const selectedSlug = firstValue(resolved[SELECTED_PARAM]);

  const pins = await getMapPins();
  const approximateCount = pins.filter((pin) => pin.isApproximate).length;

  return (
    <div className="site-container pt-8 pb-14">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-6">
        <div className="min-w-0">
          <Eyebrow>Explore by place</Eyebrow>
          {/* Quiet on purpose: the map is the content, and a display headline
              would push it below the fold. It is still the page's one h1. */}
          <h1 className="mt-2 text-title font-bold">The places, mapped.</h1>
        </div>

        {pins.length > 0 ? (
          // Worded for the marking rather than the drawing, because without a
          // configured provider there is no map and nothing is drawn at all.
          <p className="max-w-[54ch] text-caption leading-relaxed text-muted">
            <span className="tabular-nums">{formatCount(pins.length)}</span>{' '}
            {pins.length === 1 ? 'place is' : 'places are'} pinned, each submitted by a member and
            approved by a moderator.{' '}
            {approximateCount > 0 ? (
              <>
                <span className="tabular-nums">{formatCount(approximateCount)}</span>{' '}
                {approximateCount === 1 ? 'is marked' : 'are marked'} approximate: the exact point
                is withheld because the place is privacy-sensitive, leaving it accurate only to{' '}
                {precisionLabel(LOCATION_POLICY.reducedCoordinateDecimals)}.
              </>
            ) : (
              <>None is approximate at present; one whose point was withheld would say so.</>
            )}
          </p>
        ) : null}
      </header>

      {pins.length === 0 ? (
        <section aria-labelledby="map-empty-heading">
          {/* The empty state's own title is an h3, so this keeps the order sane. */}
          <h2 id="map-empty-heading" className="sr-only">
            Places on the map
          </h2>
          <EmptyState
            title="No place has a position that may be published"
            description="A pin needs an approved location with a coordinate the privacy policy permits us to publish. Nothing on file meets both conditions yet, so there is nothing to draw. Places whose position is withheld still appear in the location list."
            action={
              <Button asChild variant="secondary">
                <Link href="/locations">Browse the location list</Link>
              </Button>
            }
          />
        </section>
      ) : (
        <MapExplorer pins={pins} initialSelectedSlug={selectedSlug} />
      )}
    </div>
  );
}
