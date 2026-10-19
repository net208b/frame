import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { MapCanvas } from '@/components/map/MapCanvas';
import { MapUnavailable } from '@/components/map/MapUnavailable';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
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

export async function MapTeaser({
  pins,
  totalPinCount,
  locale,
  className,
}: {
  /** A sample for the teaser. The full set lives on /map. */
  pins: MapPin[];
  totalPinCount: number;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });
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
        <Eyebrow onInk>{t('map.eyebrow')}</Eyebrow>

        {/* This heading sets its own size, leading and tracking rather than
            taking a size token, so the Thai overrides in globals.css — which
            key off the tokens and the two fluid utilities — cannot reach it.
            Negative tracking on Thai collides the tone marks with their
            neighbours, so the pair is chosen here instead: Latin keeps the
            display tracking the prototype specified, Thai resets it and takes
            the same leading as the Thai display size. */}
        <h2
          className={cn(
            'mt-4 text-[clamp(2rem,4vw,3.0625rem)] font-bold',
            locale === 'th' ? 'leading-[1.18] tracking-normal' : 'leading-[0.98] tracking-[-0.075em]',
          )}
        >
          {t('map.title')}
        </h2>

        <p className="mt-3 max-w-[310px] text-caption text-on-ink-muted">{t('map.description')}</p>

        <Button asChild variant="accent" className="mt-6">
          <Link href="/map">
            {t('map.open')}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </Button>

        {/* `tabular-nums` sits on the whole sentence rather than on a span
            around the number. It only affects digits, so the words are
            unchanged — and it means the count does not have to be spliced into
            the middle of the sentence as separate markup, which Thai cannot
            take. `count` selects the English plural; `formatted` carries the
            compact figure the rest of the product uses for counts. */}
        <p className="mt-4 text-meta text-on-ink-muted tabular-nums">
          {totalPinCount > 0
            ? t('map.pinCount', {
                count: totalPinCount,
                formatted: formatCount(totalPinCount, locale),
              })
            : t('map.noPins')}
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
              <p className="pointer-events-none absolute top-5 left-5 z-10 rounded-field bg-surface px-3 py-2.5 text-eyebrow text-ink uppercase tabular-nums shadow-popover">
                {t('map.sample', { count: pins.length })}
              </p>
            ) : null}
          </>
        ) : (
          /* The provider-unavailable copy lives inside MapUnavailable, which is
             shared with /map and is not translated here — see the note in the
             handover. It takes no copy props, so this block cannot supply it. */
          <MapUnavailable heightClassName={MAP_HEIGHT} className="rounded-none border-0" />
        )}
      </div>
    </section>
  );
}
