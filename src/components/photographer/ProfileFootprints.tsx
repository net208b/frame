import { MapPin as MapPinIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { FootprintsCanvas } from '@/components/photographer/FootprintsCanvas';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import { cn, formatCount } from '@/lib/utils';

/**
 * My Footprints: the places one member has actually published a frame from.
 *
 * WHAT IT IS. A map fitted to that member's own range, with the same pins and
 * the same card as the rest of FRAME, beside a list of the places grouped by
 * country. It is the one thing on a profile that is about *where* somebody
 * photographs rather than what they photograph, and for a street photographer
 * that is half of the work.
 *
 * THE COUNTS ARE THEIRS. Every number here is the number of this member's
 * frames, never the place's total — see `photographerMapPins()`, which is a
 * separate query for exactly that reason. A profile that said "40 photographs"
 * at a corner because forty other members had been there would be putting
 * somebody else's work in this member's name, and the description says in so
 * many words whose frames are being counted.
 *
 * WHEN IT IS NOT HERE. With no pins there is no section, with one exception:
 * the member looking at their own profile is told why, because "no footprints"
 * is a thing they can act on — a place is added while uploading and a moderator
 * approves it — whereas for a visitor an empty map band on a stranger's profile
 * is just furniture. The portfolio section above already says when somebody has
 * published nothing at all.
 *
 * THE LIST IS NOT DECORATION. The map is a WebGL canvas that no screen reader
 * can read and that renders nothing at all when maps are switched off for a
 * deployment, so every place on it is also a link in the list beside it. That is
 * the accessible copy of this section, not a summary of it.
 */

/** One country, as the list beside the map groups them. */
interface CountryGroup {
  code: string;
  name: string;
  pins: MapPin[];
  /** This member's frames in this country, across all of its places. */
  frames: number;
}

/**
 * Grouped by country code and sorted by how much work is there, most first,
 * with each country's places sorted the same way. A member who has photographed
 * one street in Lisbon and four years of Bangkok should see Bangkok first; the
 * alternative — alphabetical — buries the body of the work behind whatever
 * country happens to start with an A.
 */
function groupByCountry(pins: readonly MapPin[]): CountryGroup[] {
  const groups = new Map<string, CountryGroup>();

  for (const pin of pins) {
    // The code is the key and the name is the label: two places may spell the
    // country differently in their row, and the code is what the data is keyed
    // on everywhere else on the site.
    const code = pin.countryCode.toUpperCase();
    const existing = groups.get(code);

    if (existing) {
      existing.pins.push(pin);
      existing.frames += pin.photographCount;
      continue;
    }

    groups.set(code, {
      code,
      name: pin.country,
      pins: [pin],
      frames: pin.photographCount,
    });
  }

  for (const group of groups.values()) {
    group.pins.sort((a, b) => b.photographCount - a.photographCount);
  }

  return [...groups.values()].sort((a, b) => b.frames - a.frames);
}

export async function ProfileFootprints({
  pins,
  photographerName,
  isSelf,
  className,
}: {
  pins: MapPin[];
  photographerName: string;
  isSelf: boolean;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });

  if (pins.length === 0) {
    if (!isSelf) return null;

    return (
      <section className={cn(className)}>
        <SectionHead eyebrow={t('footprints.eyebrow')} title={t('footprints.title')} />
        <EmptyState
          title={t('footprints.selfEmptyTitle')}
          description={t('footprints.selfEmptyDescription')}
        />
      </section>
    );
  }

  const countries = groupByCountry(pins);
  const mapReady = isMapConfigured();

  return (
    <section className={cn(className)}>
      <SectionHead
        eyebrow={t('footprints.eyebrow')}
        title={t('footprints.title')}
        description={t('footprints.description', { name: photographerName })}
        action={
          <p className="text-meta text-muted tabular-nums">
            {t('footprints.summary', { places: pins.length, countries: countries.length })}
          </p>
        }
      />

      <div
        className={cn(
          'grid gap-5',
          // The list keeps its own column only when there is a map to put
          // beside it. With maps switched off it is the whole section and runs
          // the full width, as a list of links should.
          mapReady && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]',
        )}
      >
        {mapReady ? (
          <div className="overflow-hidden rounded-panel border border-line bg-surface-sunken">
            {/*
              Tall enough that the anchored card has somewhere to go: the card is
              about 265px and `MapCanvas` places it above, below or beside the
              pin depending on what fits, so a short panel leaves it nothing to
              choose between.
            */}
            <FootprintsCanvas pins={pins} heightClassName="h-[26rem] lg:h-[32rem]" />
          </div>
        ) : null}

        <div
          className={cn(
            'rounded-panel border border-line bg-surface',
            // Its own scroll when it is the column beside the map, so a member
            // with sixty places does not stretch the section down the page. At
            // phone width, and when it stands alone, it is simply a list.
            mapReady && 'lg:max-h-[32rem] lg:overflow-y-auto',
          )}
        >
          <ul className="divide-y divide-line">
            {countries.map((country) => (
              <li key={country.code} className="px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-caption font-semibold">{country.name}</p>
                  <p className="shrink-0 text-meta text-muted tabular-nums">
                    {t('footprints.countryFrames', { count: country.frames })}
                  </p>
                </div>

                <ul className="mt-2 space-y-1.5">
                  {country.pins.map((pin) => (
                    <li key={pin.id}>
                      <Link
                        href={`/locations/${pin.slug}`}
                        className="group flex items-baseline justify-between gap-3"
                      >
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <MapPinIcon
                            aria-hidden
                            className="mt-0.5 size-3 shrink-0 self-start text-muted"
                          />
                          <span className="min-w-0">
                            <span className="text-meta group-hover:underline">{pin.name}</span>
                            <span className="text-meta text-muted"> · {pin.city}</span>
                          </span>
                        </span>

                        <span className="shrink-0 text-meta text-muted tabular-nums">
                          {formatCount(pin.photographCount, locale)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
