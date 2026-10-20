import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { MapExplorer } from '@/components/map/MapExplorer';
import { SELECTED_PARAM } from '@/components/map/map-style';
import { precisionParts } from '@/components/map/precision';
import { Eyebrow } from '@/components/ui/SectionHead';
import { LOCATION_POLICY } from '@/lib/config';
import { getMapPins } from '@/lib/data/repository';
import { visitorPlace } from '@/lib/geo/visitor';
import { buildMetadata } from '@/lib/seo';
import { formatCount } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'map' });

  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/map',
    locale,
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

/** A query string can repeat a key; the first value wins. */
function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value.at(0) : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export default async function MapPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<SearchParams>;
}) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'map' });

  // Read on the server so a shared link arrives with its place already chosen
  // rather than selecting itself a moment after hydration.
  const selectedSlug = firstValue(resolved[SELECTED_PARAM]);

  // The geolocation headers make this page vary by reader, which it did not
  // before. It is the camera for an empty map and nothing else — see
  // `visitorPlace()` — so the cost is one header read per request.
  const [pins, place] = await Promise.all([getMapPins(), visitorPlace()]);
  const approximateCount = pins.filter((pin) => pin.isApproximate).length;

  return (
    <div className="site-container pt-8 pb-14">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 pb-6">
        <div className="min-w-0">
          <Eyebrow>{t('page.eyebrow')}</Eyebrow>
          {/* Quiet on purpose: the map is the content, and a display headline
              would push it below the fold. It is still the page's one h1. */}
          <h1 className="mt-2 text-title font-bold">{t('page.heading')}</h1>
        </div>

        {pins.length > 0 ? (
          // Worded for the marking rather than the drawing, because without a
          // configured provider there is no map and nothing is drawn at all.
          //
          // `tabular-nums` sits on the paragraph rather than on a span around
          // each figure: the counts are inside the message now, so that the
          // whole sentence is one translatable unit and Thai is not assembled
          // by splicing a number into the middle of a phrase.
          <p className="max-w-[54ch] text-caption leading-relaxed tabular-nums text-muted">
            {t('page.pinned', {
              count: pins.length,
              formatted: formatCount(pins.length, locale),
            })}{' '}
            {approximateCount > 0
              ? t('page.approximate', {
                  count: approximateCount,
                  formatted: formatCount(approximateCount, locale),
                  precision: t(
                    'precision',
                    precisionParts(LOCATION_POLICY.reducedCoordinateDecimals),
                  ),
                })
              : t('page.noneApproximate')}
          </p>
        ) : null}
      </header>

      {/* Always the explorer, even with nothing pinned: the map opens on the
          reader's own city and says on top of itself that no place has been
          approved yet. Replacing it with a panel of prose, which is what this
          did before, left the one page about places with no map on it. */}
      <MapExplorer
        pins={pins}
        initialSelectedSlug={selectedSlug}
        fallbackCamera={{ centre: place.centre, zoom: place.zoom }}
      />
    </div>
  );
}
