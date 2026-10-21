import { Images } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';

import { CategoryTag } from '@/components/photo/CategoryTag';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { translatedText } from '@/lib/translation/applies';
import { cn, formatCount } from '@/lib/utils';
import type { LocationSummary, PhotoCategory } from '@/types/domain';

/**
 * Metres for anything walkable, kilometres beyond that.
 *
 * The thresholds and the rounding are the ones this card has always used; only
 * the unit comes from `Intl` now, so a Thai reader gets `350 ม.` and `1.2 กม.`
 * instead of an English abbreviation glued on by hand.
 */
function formatDistance(metres: number, intlLocale: string): string | null {
  if (!Number.isFinite(metres) || metres < 0) return null;

  if (metres < 1000) {
    return new Intl.NumberFormat(intlLocale, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(Math.round(metres));
  }

  const km = metres / 1000;
  return new Intl.NumberFormat(intlLocale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
}

/**
 * This card is rendered from Discover, search, the map popover, collections and
 * the home page as well as the locations index, and the map popover is a Client
 * Component — so it reads its own locale and messages with the hooks, which
 * work in both environments, rather than taking a `locale` prop that four
 * foreign callers would have to pass.
 */
export function LocationCard({
  location,
  previewImageUrl,
  categories,
  distanceMetres,
  className,
}: {
  location: LocationSummary;
  previewImageUrl?: string | null;
  categories?: PhotoCategory[];
  distanceMetres?: number;
  className?: string;
}) {
  const t = useTranslations('location');
  const active = useLocale();
  // `useLocale` is typed as a plain string, so it is narrowed rather than cast;
  // an unrecognisable value formats in the default language instead of throwing.
  const intlLocale = isLocale(active) ? INTL_LOCALES[active] : INTL_LOCALES[DEFAULT_LOCALE];

  const distance = distanceMetres === undefined ? null : formatDistance(distanceMetres, intlLocale);

  return (
    <article
      className={cn(
        'relative flex items-start gap-4 rounded-card border border-line bg-surface p-4',
        'transition-colors duration-150 hover:border-line-strong',
        className,
      )}
    >
      {previewImageUrl ? (
        <Image
          src={previewImageUrl}
          // Decorative: the name and place beside it already identify the spot,
          // and nothing here can describe what the photograph shows.
          alt=""
          width={96}
          height={96}
          sizes="96px"
          className="size-24 shrink-0 rounded-media border border-line object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        {/* `tracking-tight` rather than an arbitrary value: the token resets to
            normal under `:root[lang='th']`, and negative tracking collides the
            vowel and tone marks that stack above and below a Thai glyph. */}
        <h3 className="text-body font-bold tracking-tight">
          <Link
            href={`/locations/${location.slug}`}
            className="before:absolute before:inset-0 before:content-['']"
          >
            {/* A card is a label, so the name takes the reader's language with
                no note and no toggle; the place's own page shows it as written
                and says a machine translated it (0035). */}
            {translatedText(location.name, location.translations.name, active)}
          </Link>
        </h3>

        <p className="mt-1 text-meta text-muted">
          {location.city}, {location.country}
        </p>

        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-muted-soft">
          <Images aria-hidden className="inline size-3" />
          <span className="tabular-nums">
            {t('card.photographCount', {
              count: location.photographCount,
              value: formatCount(location.photographCount, intlLocale),
            })}
          </span>
          {distance ? <span aria-hidden>·</span> : null}
          {distance ? (
            <span className="tabular-nums">{t('card.distanceAway', { distance })}</span>
          ) : null}
        </p>

        {categories && categories.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <li key={category}>
                <CategoryTag category={category} tone="outline" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
