'use client';

import { Check, Copy, MapPinOff } from 'lucide-react';
import { useId, useState } from 'react';

import { precisionLabel } from '@/lib/geo';
import { cn, formatCoordinates } from '@/lib/utils';
import type { Coordinates } from '@/types/domain';

/**
 * The published position of a place, and the truth about how exact it is.
 *
 * Three states, because a coordinate is a privacy decision rather than a
 * number: withheld entirely, deliberately coarsened, or published as recorded.
 * Nothing here ever reconstructs a point from something else on the page, and
 * the copy affordance hands over exactly the digits that were published —
 * `toFixed(precisionDecimals)` on an already-rounded value — so copying can
 * never widen the precision the location policy chose.
 *
 * A client component only because the copy button needs the clipboard. If the
 * clipboard is unavailable, it says so instead of reporting a copy that did
 * not happen.
 */
export function CoordinateDisclosure({
  coordinates,
  locationName,
  className,
}: {
  coordinates: Coordinates | null;
  locationName: string;
  className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const headingId = useId();

  const shell = cn('rounded-card border border-line bg-surface p-5', className);

  if (!coordinates) {
    return (
      <section aria-labelledby={headingId} className={shell}>
        <h2
          id={headingId}
          className="flex items-center gap-2 text-eyebrow text-muted uppercase"
        >
          <MapPinOff aria-hidden className="size-3.5" />
          Position withheld
        </h2>
        <p className="mt-2.5 text-body leading-relaxed text-ink-soft">
          No coordinate is published for {locationName}. FRAME withholds a point when a place is
          somebody’s home or workplace, when publishing its position would expose the people who
          use it, or when a moderator could not verify the point well enough to stand behind it.
        </p>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          The place itself is real and has been approved. Only its position is held back.
        </p>
      </section>
    );
  }

  const { latitude, longitude, precisionDecimals, isApproximate } = coordinates;
  const display = formatCoordinates(latitude, longitude, precisionDecimals);
  // Decimal degrees at the published precision: the form a map accepts, and the
  // only form that cannot imply more precision than was published.
  const copyable = `${latitude.toFixed(precisionDecimals)}, ${longitude.toFixed(precisionDecimals)}`;

  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(copyable);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <section aria-labelledby={headingId} className={shell}>
      <h2 id={headingId} className="text-eyebrow text-muted uppercase">
        {isApproximate ? 'Approximate position' : 'Position'}
      </h2>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-title font-bold tabular-nums">{display}</p>
        <button
          type="button"
          onClick={copyCoordinates}
          aria-label={`Copy the coordinates for ${locationName} as decimal degrees`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5',
            'text-meta font-semibold text-ink-soft',
            'transition-colors duration-150 hover:border-line-strong hover:text-ink',
          )}
        >
          {status === 'copied' ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {status === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p aria-live="polite" className="mt-1.5 min-h-4 text-meta text-muted">
        {status === 'copied' ? `Copied ${copyable} to the clipboard.` : null}
        {status === 'failed'
          ? 'The clipboard is not available here. Select the coordinates above and copy them by hand.'
          : null}
      </p>

      {isApproximate ? (
        <>
          <p className="mt-2 text-caption leading-relaxed text-ink-soft">
            This point is deliberately coarse. It is published to {precisionDecimals} decimal
            places, which places you within {precisionLabel(precisionDecimals)} of the spot rather
            than at a doorway.
          </p>
          <p className="mt-2 text-caption leading-relaxed text-muted">
            FRAME reduces precision for places where an exact position could expose the people who
            live, work or shelter there. The finer point is never published, here or anywhere else
            on the site.
          </p>
        </>
      ) : (
        <p className="mt-2 text-caption leading-relaxed text-muted">
          Published to {precisionDecimals} decimal places, which is accurate to{' '}
          {precisionLabel(precisionDecimals)}. Copied as decimal degrees, latitude first.
        </p>
      )}
    </section>
  );
}
