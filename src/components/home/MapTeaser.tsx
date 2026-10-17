import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { MapCanvas } from '@/components/map/MapCanvas';
import { MapUnavailable } from '@/components/map/MapUnavailable';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { cn, formatCount } from '@/lib/utils';

/**
 * The inverted editorial block from the prototype.
 *
 * The `on-ink` class switches the focus ring to the accent, because the ink
 * outline supplied by globals.css would vanish against this surface. The map
 * side is the real map when a style URL is configured and the honest fallback
 * when it is not: a decorative picture of a map would suggest a capability this
 * deployment does not have.
 */
const MAP_HEIGHT = 'h-full min-h-[300px]';

export function MapTeaser({
  pins,
  totalPinCount,
  className,
}: {
  /** A sample for the teaser. The full set lives on /map. */
  pins: MapPin[];
  totalPinCount: number;
  className?: string;
}) {
  const mapReady = isMapConfigured();
  const showsSample = pins.length > 0 && pins.length < totalPinCount;

  return (
    <section
      className={cn(
        'on-ink mt-[74px] grid overflow-hidden rounded-panel bg-ink-surface text-on-ink',
        'min-[650px]:grid-cols-2',
        className,
      )}
    >
      <div className="flex flex-col items-start justify-center p-7 min-[650px]:p-10">
        <Eyebrow onInk>Explore by place</Eyebrow>

        <h2 className="mt-4 text-[clamp(2rem,4vw,3.0625rem)] leading-[0.98] font-bold tracking-[-0.075em]">
          Every pin is somewhere to stand.
        </h2>

        <p className="mt-3 max-w-[310px] text-caption text-on-ink-muted">
          Each pin is a place a member submitted and a moderator approved, with the photographs made
          there and any access notes on file.
        </p>

        <Button asChild variant="accent" className="mt-6">
          <Link href="/map">
            Open the map
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </Button>

        <p className="mt-4 text-meta text-on-ink-muted">
          {totalPinCount > 0 ? (
            <>
              <span className="tabular-nums">{formatCount(totalPinCount)}</span>{' '}
              {totalPinCount === 1 ? 'approved place is' : 'approved places are'} pinned on the full
              map.
            </>
          ) : (
            'No places have been approved yet, so the map has nothing to show.'
          )}
        </p>
      </div>

      <div className="relative min-h-[300px] bg-ink-surface-soft">
        {mapReady ? (
          <>
            {/* MapCanvas writes its own notes (attribution, status) in `text-muted`,
                which is a light-surface colour. On this inverted block those
                direct children need the on-ink equivalent to stay readable. */}
            <MapCanvas
              pins={pins}
              heightClassName={MAP_HEIGHT}
              className="[&>p]:text-on-ink-muted"
            />
            {showsSample ? (
              <p className="pointer-events-none absolute top-5 left-5 z-10 rounded-field bg-surface px-3 py-2.5 text-eyebrow text-ink uppercase shadow-popover">
                A sample of <span className="tabular-nums">{pins.length}</span> places
              </p>
            ) : null}
          </>
        ) : (
          <MapUnavailable heightClassName={MAP_HEIGHT} className="rounded-none border-0" />
        )}
      </div>
    </section>
  );
}
