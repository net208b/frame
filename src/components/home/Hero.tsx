import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { HomeGlobe } from '@/components/globe/HomeGlobe';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The opening spread.
 *
 * Two columns, bottom-aligned, collapsing to one under 650px exactly as the
 * prototype does. The left column carries the only h1 on the page.
 *
 * THE RIGHT COLUMN IS THE WORLD. It used to carry one trending photograph —
 * the page's single priority image, with a caption saying why it was there
 * and a "01 / 08" pill. The site's owner replaced it with a globe: every
 * country drawn, a point of light on each, turning until it finds the country
 * the visitor is in, with a box above it to find any other. The reasoning is
 * the site's own first line — start with a place — and a photograph, however
 * good, is one place; the globe is all of them.
 *
 * What the hero needs for that is small and comes from reads the page already
 * does: which countries hold approved places (from the map pins) and where
 * the visitor is (from the network, the same reading the map section uses).
 * Neither is a photograph, so this section no longer holds the priority
 * image, and the galleries below take their turn.
 */

export interface HeroGlobe {
  /** ISO alpha-2 → how many approved places FRAME has there. */
  placesByCountry: Record<string, number>;
  /** The visitor's country from the network, or null when it could not be placed. */
  visitorCountry: string | null;
}

export async function Hero({
  globe,
  signedIn,
  locale,
  className,
}: {
  globe: HeroGlobe;
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

      <HomeGlobe
        placesByCountry={globe.placesByCountry}
        visitorCountry={globe.visitorCountry}
        locale={locale}
      />
    </section>
  );
}
