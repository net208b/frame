import { MoveHorizontal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { LOCATION_POLICY } from '@/lib/config';
import type { LocationSummary } from '@/types/domain';

/**
 * Approved places close enough together to be worth a second look.
 *
 * FRAME cannot merge two places: there is no merge function and no table that
 * holds a merge request, so the control here records a flag for a person to
 * pick up and says exactly that. Labelling it "Merge" would be a button that
 * looks real and does something smaller than it claims, which is the one thing
 * this product is not allowed to ship.
 */

type Translator = Awaited<ReturnType<typeof getTranslations>>;

export interface DuplicatePair {
  a: LocationSummary;
  b: LocationSummary;
  distanceMetres: number;
}

/**
 * The gap between two places, as one sentence.
 *
 * The number goes through `Intl` with the active locale and the unit comes from
 * the catalogue, because "40 m apart" is a whole phrase in English and a whole
 * phrase in Thai, not a number with a suffix bolted on.
 */
function distanceText(t: Translator, metres: number, intlLocale: string): string {
  if (metres < 1000) {
    return t('duplicates.metresApart', { metres: Math.round(metres) });
  }
  return t('duplicates.kilometresApart', {
    kilometres: new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(metres / 1000),
  });
}

function optionsFor(pair: DuplicatePair, t: Translator): readonly DecisionOption[] {
  return [
    {
      value: 'dismiss',
      label: t('duplicates.options.keepBoth.label'),
      effect: t('duplicates.options.keepBoth.effect'),
      reasonRequired: false,
      reasonAudience: 'internal',
    },
    {
      value: 'request_changes',
      label: t('duplicates.options.flagForMerging.label'),
      effect: t('duplicates.options.flagForMerging.effect', {
        target: pair.b.name,
        other: pair.a.name,
      }),
      reasonRequired: true,
      reasonAudience: 'internal',
    },
  ];
}

export async function DuplicateLocationQueue({
  locale,
  pairs,
}: {
  locale: Locale;
  pairs: readonly DuplicatePair[];
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <section aria-labelledby="queue-duplicates">
      <SectionHead
        eyebrow={t('duplicates.eyebrow')}
        title={<span id="queue-duplicates">{t('duplicates.title')}</span>}
        description={t('duplicates.description', {
          radius: LOCATION_POLICY.duplicateRadiusMetres,
        })}
      />

      <QueueCapNote locale={locale} shown={pairs.length} />

      {pairs.length === 0 ? (
        <EmptyState
          title={t('duplicates.emptyTitle')}
          description={t('duplicates.emptyDescription', {
            radius: LOCATION_POLICY.duplicateRadiusMetres,
          })}
        />
      ) : (
        <ul className="border-t border-line">
          {pairs.map((pair) => (
            <DuplicateRow key={`${pair.a.id}-${pair.b.id}`} locale={locale} pair={pair} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function DuplicateRow({ locale, pair }: { locale: Locale; pair: DuplicatePair }) {
  const t = await getTranslations({ locale, namespace: 'moderation' });
  const intlLocale = INTL_LOCALES[locale];

  return (
    <li className="border-b border-line py-7 last:border-b-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="min-w-0">
          <h3 className="text-caption font-bold text-muted">
            <span className="text-ink">{pair.a.name}</span>
            <span className="mx-2 font-medium">{t('duplicates.and')}</span>
            <span className="text-ink">{pair.b.name}</span>
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <PlaceCard locale={locale} place={pair.a} />

            <p className="flex items-center gap-1.5 text-meta font-semibold text-muted sm:flex-col sm:gap-1 sm:px-1">
              <MoveHorizontal className="size-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">
                {distanceText(t, pair.distanceMetres, intlLocale)}
              </span>
            </p>

            <PlaceCard locale={locale} place={pair.b} />
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'duplicate', locationId: pair.b.id }}
            subjectLabel={t('duplicates.subject', { target: pair.b.name, other: pair.a.name })}
            options={optionsFor(pair, t)}
            reasonHint={t('duplicates.reasonHint')}
          />
        </div>
      </div>
    </li>
  );
}

async function PlaceCard({ locale, place }: { locale: Locale; place: LocationSummary }) {
  /*
   * The photograph count comes from `common`, which already states it as one
   * ICU message in both languages. It renders the number through `Intl` rather
   * than through `formatCount`, so a four-figure count reads "1,200
   * photographs" here instead of "1.2k" — which is the better reading in a
   * queue a moderator is comparing two entries in.
   */
  const common = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3.5">
      <Link
        href={`/locations/${place.slug}`}
        className="text-caption font-bold text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink"
      >
        {place.name}
      </Link>
      <p className="mt-1 text-meta text-muted">
        {[place.city, place.country].filter(Boolean).join(', ')}
        {place.countryCode ? ` (${place.countryCode})` : ''}
      </p>
      <p className="mt-1 text-meta text-muted-soft">
        {common('photographCount', { count: place.photographCount })}
      </p>
    </div>
  );
}
