import { ArrowUpRight, Camera, CircleDashed, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ComponentType } from 'react';

import { MapCanvas } from '@/components/map/MapCanvas';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { isMapConfigured } from '@/lib/config';
import type { MapPin } from '@/lib/data/repository';
import type { VisitorPlace } from '@/lib/geo/visitor';
import { cn } from '@/lib/utils';

/**
 * The opening band: a live map, already on the reader's own city.
 *
 * It replaces the inverted map teaser that used to sit near the foot of the
 * page. The teaser was a panel beside some prose, and with nothing approved yet
 * it had nothing to put in the panel, so one of the first things a new reader
 * met was a sentence explaining that there was nothing to see. A map of the city
 * they are standing in is a better answer to "what is this site": FRAME is about
 * places, and this one starts on a place the reader knows before a single
 * photograph has been uploaded.
 *
 * WHERE IT OPENS. `visitorPlace()` reads the geolocation the platform resolved
 * from the request's IP address — see that module for what that is and is not.
 * Three cases, and the copy says which: a city it can name, a country it can
 * place but not name a city in, and nothing at all, where the map opens on the
 * world view exactly as it did before. The lead discloses the method, because a
 * page that knows your city without being asked should say how, in its own
 * words, at the point where you are reading it.
 *
 * WHAT IT IS NOT. Not a substitute for the map page: no filtering, no selection
 * and no place list, and the buttons lead there for all three. The map itself is
 * a WebGL canvas no screen reader can use, so nothing here is said by the map
 * alone — the city is in the chip, the state is in the card, and the three notes
 * are text.
 */

/** Tall enough to read as the opening spread; capped so it is not a whole screen. */
const BAND_HEIGHT = 'h-[56vh] min-h-[22rem] lg:h-[74vh] lg:min-h-[32rem] lg:max-h-[44rem]';

interface Note {
  key: 'moderated' | 'rounded' | 'gear';
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

/**
 * Three facts about how FRAME treats a place. Each is something the product
 * actually does, not a selling point: a moderator really does approve every
 * place, a sensitive position really is published as an area, and the gear
 * really is on every frame. A card here that was not true elsewhere would be the
 * worst kind of decoration.
 */
const NOTES: Note[] = [
  { key: 'moderated', Icon: ShieldCheck },
  { key: 'rounded', Icon: CircleDashed },
  { key: 'gear', Icon: Camera },
];

export async function CityMap({
  pins,
  totalPinCount,
  place,
  signedIn,
  locale,
  className,
}: {
  /** A sample for the band. The full set lives on /map. */
  pins: MapPin[];
  totalPinCount: number;
  place: VisitorPlace;
  signedIn: boolean;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  // `city` is passed on every call, empty string included: ICU resolves the
  // arguments of a `select` message whichever branch wins, so a missing one
  // throws even when the branch that mentions it was not chosen.
  const values = { precision: place.precision, city: place.city ?? '' };
  const mapReady = isMapConfigured();

  return (
    <section
      aria-labelledby="home-city-heading"
      className={cn(
        'mt-7 overflow-hidden rounded-panel border border-line bg-surface-sunken',
        className,
      )}
    >
      <div className="relative grid">
        {/*
          The map and the text share one grid cell from `lg` up, which is what
          puts the words over the map without a second copy of them in the
          document. Below that they are two stacked rows: a headline over a map
          is unreadable at phone width, and a scrim heavy enough to fix it would
          hide the city the band exists to show. The map comes first in both, so
          the first thing a reader meets is where they are.
        */}
        <div className={cn('relative lg:[grid-area:1/1]', BAND_HEIGHT)}>
          {mapReady ? (
            <MapCanvas
              pins={pins}
              initialCenter={place.centre}
              initialZoom={place.zoom}
              scrollZoom={false}
              heightClassName="h-full"
              className="h-full"
            />
          ) : (
            /* Maps are switched off for this deployment. The band keeps its
               shape and claims nothing it cannot show. */
            <div aria-hidden className="h-full w-full bg-surface-sunken" />
          )}

          {/*
            Bottom-left, not top-left: the plate above fades from the paper
            colour, and a chip under the opaque end of it would be invisible.
            MapLibre keeps its attribution bottom-right, so the two do not meet.
          */}
          {mapReady ? (
            <p
              className={cn(
                'pointer-events-none absolute bottom-4 left-4 z-10 inline-flex items-center gap-2',
                'rounded-pill border border-line bg-surface px-3 py-1.5 text-meta text-ink-soft',
                'shadow-popover',
              )}
            >
              <span aria-hidden className="size-1.5 rounded-pill bg-accent-strong" />
              {t('city.openedOn', values)}
            </p>
          ) : null}

          {totalPinCount === 0 ? (
            /* Centred on the map, which is where "there is nothing here yet"
               belongs. It is the honest state of a new deployment, and it is
               said once — the paragraph under the old teaser said it too, and
               two sentences about the same emptiness is one too many. */
            <div
              className={cn(
                'absolute top-1/2 left-1/2 z-10 w-[min(23rem,calc(100%-2.5rem))]',
                '-translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface',
                'p-5 text-center shadow-popover',
              )}
            >
              <p className="text-body font-semibold">{t('city.emptyTitle', values)}</p>
              <p className="mt-1.5 text-meta leading-relaxed text-muted">{t('city.emptyBody')}</p>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            'relative z-20 px-6 py-7 lg:[grid-area:1/1] lg:px-10 lg:py-10',
            // The plate. A map is a busy ground and this is editorial type, so
            // the paper colour is brought back up behind the words and faded out
            // below them — in both themes, since both define `--color-paper`.
            // Pointer events pass through so the map stays draggable; the
            // buttons take them back.
            'lg:pointer-events-none lg:bg-gradient-to-b lg:from-paper lg:via-paper/85 lg:to-transparent',
            'flex flex-col items-start lg:items-center lg:text-center',
          )}
        >
          <Eyebrow>{t('city.eyebrow')}</Eyebrow>

          <h2
            id="home-city-heading"
            className={cn(
              'mt-3 max-w-[22ch] text-section-fluid font-bold text-balance',
              locale === 'th' && 'leading-[1.3]',
            )}
          >
            {t('city.heading', values)}
          </h2>

          <p className="mt-3 max-w-[58ch] text-caption leading-relaxed text-muted">
            {t('city.lead', values)}
          </p>

          <div className="pointer-events-auto mt-6 flex flex-wrap items-center gap-2.5 lg:justify-center">
            <Button asChild size="lg">
              <Link href="/map">
                {t('city.openMap')}
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </Button>

            <Button asChild variant="secondary" size="lg">
              <Link href={signedIn ? '/upload' : '/join'}>{t('city.addPlace')}</Link>
            </Button>
          </div>
        </div>
      </div>

      {/*
        The notes, as a row under the map rather than as cards floating on it.
        Floating them does look better on a wide screen, and there is no
        arrangement of three that survives every width: on a phone-width map they
        cover the city, and hiding one at a breakpoint means a reader at that
        width is simply not told something the others are.
      */}
      <ul className="grid gap-4 border-t border-line px-6 py-6 sm:grid-cols-3 lg:px-10">
        {NOTES.map(({ key, Icon }) => (
          <li key={key}>
            <Icon aria-hidden className="size-4 text-ink-soft" />
            <p className="mt-2.5 text-caption font-semibold">{t(`city.notes.${key}.title`)}</p>
            <p className="mt-1 text-meta leading-relaxed text-muted">
              {t(`city.notes.${key}.body`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
