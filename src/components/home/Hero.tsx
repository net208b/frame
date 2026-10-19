import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { IMAGE_SIZES } from '@/lib/images/variants';
import { cn } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * The opening spread.
 *
 * Two columns, bottom-aligned, collapsing to one under 650px exactly as the
 * prototype does. The left column carries the only h1 on the page; the right
 * carries the cover frame, which is the single priority image in the document.
 */

/**
 * The cover frame, why it is on the cover, and where it sits in the set it was
 * drawn from.
 *
 * One object rather than a photograph plus a loose index, because the two can
 * never legitimately disagree: a frame with no set behind it would leave the
 * caption with nothing honest to say about why it is there.
 *
 * The page decides only *which* set the frame came from. The wording for each
 * case lives in the message catalogue, so neither sentence is assembled outside
 * it.
 */
export interface HeroCover {
  photo: PhotographCard;
  /** Which set the frame was drawn from. Decides the eyebrow and the note. */
  kind: 'trending' | 'editors';
  position: number;
  /** How many frames the set holds — the denominator of the pill. */
  total: number;
}

/** Matches the prototype's three hero heights. */
const MEDIA_HEIGHT = 'h-[300px] min-[650px]:h-[330px] min-[950px]:h-[390px]';

function pad(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(2, '0');
}

export async function Hero({
  cover,
  signedIn,
  locale,
  className,
}: {
  cover: HeroCover | null;
  signedIn: boolean;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section
      className={cn(
        'grid items-end gap-7 pt-10',
        'min-[650px]:grid-cols-[1fr_0.8fr] min-[650px]:gap-9 min-[650px]:pt-11',
        'min-[950px]:grid-cols-[1.1fr_0.9fr] min-[950px]:pt-16',
        className,
      )}
    >
      <div>
        <Eyebrow>{t('hero.eyebrow')}</Eyebrow>

        {/* THE EMPHASISED WORD, which is a different device in each language.
            One message carries the whole headline and marks the accent with a
            tag, so each translator decides which word takes the emphasis.

            English sets it in Instrument Serif italic — the one serif accent in
            the product, and the device the prototype established.

            Thai cannot use it. Instrument Serif has no Thai glyphs, so
            `font-serif` on Thai text falls through the stack to Noto Sans Thai,
            and `italic` then makes the browser synthesise the slant. A
            synthetic slant shears the vowel and tone marks away from the base
            glyph they belong to — the exact failure this project's Thai
            typography work exists to prevent — and Thai has no italic
            tradition to read as emphasis in the first place, so the device
            would cost legibility and buy nothing.

            Thai gets the device Thai editorial typography actually uses:
            weight. The display sits at 780, so the accent goes to 900 — the top
            of the Noto Sans Thai variable range, which this layout already
            loads for the wordmark — against 780 around it. `not-italic` is not
            optional: `em` is italic by default, and that default is precisely
            the synthetic slant to avoid.

            Colour was the other candidate and was rejected. The palette's only
            accent is the lime `--color-accent`, which is used as a background
            and fails contrast as text on paper; and dimming the surrounding
            words so one stands out would have changed the headline's weight on
            the page in English too. */}
        <h1 className="mt-5 max-w-[760px] text-display-fluid">
          {t.rich('hero.headline', {
            accent: (chunks: ReactNode) =>
              locale === 'th' ? (
                <em className="font-black not-italic">{chunks}</em>
              ) : (
                <em className="font-serif font-normal tracking-[-0.09em] italic">{chunks}</em>
              ),
          })}
        </h1>

        <p className="mt-6 max-w-[390px] text-lead text-muted">{t('hero.lead')}</p>

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Button asChild size="lg">
            <Link href="/discover">
              {t('hero.explore')}
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="secondary" size="lg">
            <Link href={signedIn ? '/upload' : '/join'}>{t('hero.share')}</Link>
          </Button>
        </div>
      </div>

      {cover ? <CoverFrame cover={cover} locale={locale} /> : <NoCoverFrame locale={locale} />}
    </section>
  );
}

async function CoverFrame({ cover, locale }: { cover: HeroCover; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'home' });
  const photo = cover.photo;
  const place = photo.location ? `${photo.location.city}, ${photo.location.country}` : null;

  // Each case is spelled out rather than selected through a computed key, so
  // both sentences stay whole messages a translator reads in context.
  const isTrending = cover.kind === 'trending';
  const eyebrow = isTrending ? t('cover.trendingEyebrow') : t('cover.editorsEyebrow');
  const note = isTrending
    ? t('cover.trendingNote', { count: cover.total })
    : t('cover.editorsNote', { count: cover.total });

  return (
    <figure className={cn('relative overflow-hidden rounded-media bg-surface-sunken', MEDIA_HEIGHT)}>
      <Image
        src={photo.image.displayUrl}
        alt={photo.altText}
        fill
        sizes={IMAGE_SIZES.hero}
        priority
        placeholder={photo.image.blurDataUrl ? 'blur' : 'empty'}
        blurDataURL={photo.image.blurDataUrl}
        className="object-cover saturate-[0.82]"
      />

      {/* A short gradient across the caption band only.
          A text shadow alone was not enough: the frame behind this caption can
          be any value at all, and over a bright, busy one — a wall of
          advertising screens, snow, open sky — 10px uppercase stopped being
          readable, which is not acceptable for the line that credits the
          photographer. The gradient is kept shallow and weak, and the shadow is
          kept as well, so the frame still reads as a photograph rather than as
          a darkened thumbnail. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-ink/60 via-ink/25 to-transparent"
      />

      <figcaption className="absolute inset-x-[18px] bottom-[18px] flex items-end justify-between gap-4">
        <div className="min-w-0 [text-shadow:0_1px_8px_rgb(0_0_0/0.55)]">
          {/* `uppercase` is a no-op on Thai, which has no letter case, so the
              Thai eyebrow renders exactly as it is written in the catalogue. */}
          <p className="text-eyebrow text-on-ink uppercase">
            {eyebrow}
            {place ? ` · ${place}` : ''}
          </p>

          <p className="mt-1.5 text-lead font-semibold text-on-ink">
            <Link
              href={`/photographs/${photo.slug}`}
              className="before:absolute before:inset-0 before:content-['']"
            >
              {photo.title}
            </Link>
          </p>

          <p className="mt-1 text-meta text-on-ink-muted">
            <Link
              href={`/photographers/${photo.photographer.username}`}
              className="relative z-10 transition-colors duration-150 hover:text-on-ink"
            >
              {photo.photographer.displayName}
            </Link>
          </p>
        </div>

        <span className="relative z-10 shrink-0 rounded-pill bg-surface/88 px-3 py-2 text-eyebrow text-ink uppercase tabular-nums">
          {pad(cover.position)}
          <span aria-hidden> / </span>
          {pad(cover.total)}
          {/* A space, not a full stop, separates the digits from the sentence a
              screen reader reads next. Thai does not close a sentence with one,
              and the note is a whole message in both languages, so the
              punctuation cannot be added here. */}
          <span className="sr-only"> {note}</span>
        </span>
      </figcaption>
    </figure>
  );
}

async function NoCoverFrame({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <div
      className={cn(
        'flex items-end rounded-media border border-dashed border-line bg-surface p-6',
        MEDIA_HEIGHT,
      )}
    >
      <p className="text-caption text-muted">{t('cover.empty')}</p>
    </div>
  );
}
