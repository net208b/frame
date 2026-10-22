'use client';

import { ArrowUpRight, Check, Copy, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { googleMapsPlaceUrl } from '@/lib/map/external-maps';
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

/**
 * Ground resolution of a decimal precision, in metres.
 *
 * `precisionLabel` in `lib/geo.ts` does the same arithmetic but returns an
 * English sentence fragment ("about 300 m"), which cannot be translated at the
 * point of use. The rounding below is deliberately identical to it, so the two
 * never disagree about the same coordinate; only the wording moves into the
 * message catalogue, where "about" belongs to the sentence around it.
 */
const METRES_PER_DEGREE = 111_320;

function precisionDistance(decimals: number, intlLocale: string): string {
  const metres = METRES_PER_DEGREE / 10 ** decimals;

  if (metres >= 1000) {
    return new Intl.NumberFormat(intlLocale, {
      style: 'unit',
      unit: 'kilometer',
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(Math.round(metres / 100) / 10);
  }

  return new Intl.NumberFormat(intlLocale, {
    style: 'unit',
    unit: 'meter',
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  }).format(Math.round(metres));
}

export function CoordinateDisclosure({
  coordinates,
  locationName,
  locale,
  className,
}: {
  coordinates: Coordinates | null;
  locationName: string;
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations('location');
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
          {t('coordinates.withheldTitle')}
        </h2>
        <p className="mt-2.5 text-body leading-relaxed text-ink-soft">
          {t('coordinates.withheldBody', { name: locationName })}
        </p>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          {t('coordinates.withheldNote')}
        </p>
      </section>
    );
  }

  const { latitude, longitude, precisionDecimals, isApproximate } = coordinates;
  const display = formatCoordinates(latitude, longitude, precisionDecimals);
  // Decimal degrees at the published precision: the form a map accepts, and the
  // only form that cannot imply more precision than was published.
  const copyable = `${latitude.toFixed(precisionDecimals)}, ${longitude.toFixed(precisionDecimals)}`;
  const distance = precisionDistance(precisionDecimals, INTL_LOCALES[locale]);

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
        {isApproximate ? t('coordinates.approximateTitle') : t('coordinates.exactTitle')}
      </h2>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-title font-bold tabular-nums">{display}</p>
        <button
          type="button"
          onClick={copyCoordinates}
          aria-label={t('coordinates.copyLabel', { name: locationName })}
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
          {status === 'copied' ? t('coordinates.copied') : t('coordinates.copy')}
        </button>

        {/* Leaves FRAME, on purpose: the one thing this platform will not do is
            route somebody somewhere, and the reader already has an app that
            does. The point handed over is the published one, rounded by
            `googleMapsPlaceUrl` to the precision printed above it. */}
        <a
          href={googleMapsPlaceUrl(coordinates)}
          target="_blank"
          rel="nofollow noopener noreferrer"
          aria-label={t('coordinates.openInMapsLabel', { name: locationName })}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5',
            'text-meta font-semibold text-ink-soft',
            'transition-colors duration-150 hover:border-line-strong hover:text-ink',
          )}
        >
          <ArrowUpRight aria-hidden className="size-3.5" />
          {t('coordinates.openInMaps')}
        </a>
      </div>

      <p aria-live="polite" className="mt-1.5 min-h-4 text-meta text-muted">
        {status === 'copied'
          ? t('coordinates.copiedStatus', { coordinates: copyable })
          : null}
        {status === 'failed' ? t('coordinates.copyFailed') : null}
      </p>

      {isApproximate ? (
        <>
          <p className="mt-2 text-caption leading-relaxed text-ink-soft">
            {t('coordinates.approximateBody', { decimals: precisionDecimals, distance })}
          </p>
          <p className="mt-2 text-caption leading-relaxed text-muted">
            {t('coordinates.approximateNote')}
          </p>
        </>
      ) : (
        <p className="mt-2 text-caption leading-relaxed text-muted">
          {t('coordinates.exactBody', { decimals: precisionDecimals, distance })}
        </p>
      )}
    </section>
  );
}
