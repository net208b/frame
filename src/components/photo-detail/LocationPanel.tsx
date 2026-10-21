import { ArrowUpRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { StaticLocationMap } from '@/components/map/StaticLocationMap';
import { Eyebrow } from '@/components/ui/SectionHead';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { precisionLabel } from '@/lib/geo';
import { translatedText } from '@/lib/translation/applies';
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
 *
 * The disclosure is just as blunt in Thai as in English. A coarsened point says
 * that the precision was reduced deliberately, roughly how far the published
 * point can be from the real one, and why — a softer Thai sentence would be a
 * worse one, because a reader deciding whether to publish their own location
 * is reading this to find out what FRAME will do with it.
 */

const INTL_UNIT: Record<'km' | 'm', 'kilometer' | 'meter'> = {
  km: 'kilometer',
  m: 'meter',
};

/**
 * The published precision as a distance in the reader's language.
 *
 * `precisionLabel()` in `lib/geo.ts` owns the arithmetic that turns decimal
 * places into metres on the ground, and it returns English prose ("about 180
 * m"). The quantity is read back out of that string so the unit can be named by
 * `Intl` — "180 m" in English, "180 ม." in Thai. Recomputing the metres here
 * would put a second copy of a privacy figure in the tree, and the two copies
 * would eventually disagree.
 *
 * If that string's shape ever changes, its own words are shown instead. An
 * English unit inside a Thai sentence is a visible defect; a distance that is
 * quietly wrong is a dangerous one, and this is the direction to fail in.
 */
function approximateDistance(decimals: number, intlLocale: string): string {
  const label = precisionLabel(decimals);
  const match = /^about ([\d.]+) (km|m)$/.exec(label);
  const amount = Number(match?.[1]);
  const unit = match?.[2];

  if (!Number.isFinite(amount) || (unit !== 'km' && unit !== 'm')) {
    return label.replace(/^about\s+/, '');
  }

  return new Intl.NumberFormat(intlLocale, {
    style: 'unit',
    unit: INTL_UNIT[unit],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(amount);
}

export async function LocationPanel({
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
  const [t, common, locale] = await Promise.all([
    getTranslations('photo'),
    getTranslations('common'),
    getLocale(),
  ]);
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];

  if (!summary) {
    return (
      <section className={cn('min-w-0', className)}>
        <Eyebrow>{common('place')}</Eyebrow>
        <h2 className="mt-2 text-title font-bold">{t('place.noneTitle')}</h2>
        <p className="mt-3 text-caption leading-relaxed text-muted">{t('place.noneBody')}</p>
      </section>
    );
  }

  const coordinates = detail?.coordinates ?? null;
  // The detail's translations are the fuller set, but the summary carries the
  // name too, so the panel still names the place in the reader's language on a
  // frame whose place could not be read in full (0035).
  const name = translatedText(
    summary.name,
    detail?.translations.name ?? summary.translations.name,
    locale,
  );

  return (
    <section className={cn('min-w-0', className)}>
      <Eyebrow>{common('place')}</Eyebrow>
      <h2 className="mt-2 text-title font-bold">
        <Link
          href={`/locations/${summary.slug}`}
          className="inline-flex items-start gap-1.5 transition-colors duration-150 hover:text-ink-soft"
        >
          {name}
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
            name={name}
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
              {t('place.approximate', {
                distance: approximateDistance(coordinates.precisionDecimals, intlLocale),
              })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-caption leading-relaxed text-muted">{t('place.withheld')}</p>
      )}
    </section>
  );
}
