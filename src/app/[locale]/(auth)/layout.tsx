import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';

/**
 * The chrome the five account pages share.
 *
 * One column, one measure, nothing competing with the form. The brand sits at
 * the top as a way back out, and a short typographic panel closes the page.
 *
 * There is deliberately no photograph here. The only images this build can
 * reach are the bundled demo frames, and putting one behind a sign-in form
 * would credit a photographer for a page they had nothing to do with — the
 * same misrepresentation the demo notice exists to prevent. A quiet panel says
 * what FRAME is without borrowing anyone's work to do it.
 *
 * THE ACCENT WORD. The panel's headline sets one word in Instrument Serif
 * italic, which is the house device for a display line. Instrument Serif has no
 * Thai glyphs, and `--font-serif` falls through to a generic serif the browser
 * synthesises an oblique for — so a Thai word in that span would be drawn in a
 * different face, slanted by the rasteriser, with its tone marks dragged out of
 * position. The Thai message therefore carries no `<accent>` tag at all and the
 * line is set entirely in Noto Sans Thai. `t.rich` renders whatever the message
 * contains, so the decision lives in the catalogue rather than in a condition
 * here.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'auth' });

  return (
    <div className="site-container py-12 lg:py-20">
      <div className="mx-auto w-full max-w-[33rem]">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-ink transition-opacity hover:opacity-70"
        >
          <BrandMark className="size-7" />
          <BrandWordmark />
          <span className="sr-only">{t('shell.backHome')}</span>
        </Link>

        <div className="mt-10">{children}</div>

        <aside className="on-ink mt-14 rounded-panel bg-ink-surface px-7 py-8 text-on-ink">
          <Eyebrow onInk>{t('shell.whyEyebrow')}</Eyebrow>
          <p className="mt-3 text-title font-bold">
            {t.rich('shell.whyTitle', {
              accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
            })}
          </p>
          <p className="mt-3 text-caption leading-relaxed text-on-ink-muted">
            {t('shell.whyBody')}
          </p>
        </aside>
      </div>
    </div>
  );
}
