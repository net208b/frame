import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Instrument_Serif, Inter, Noto_Sans_Thai } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { DemoNotice } from '@/components/system/DemoNotice';
import { ThemeScript } from '@/components/system/ThemeScript';
import { ToastProvider } from '@/components/system/Toast';
import { isLocale, LOCALES, type Locale } from '@/i18n/locales';
import { SITE } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';

/**
 * The document shell, one per language.
 *
 * This is the layout that renders `<html>` and `<body>`, because this is the
 * first place in the tree that knows which language the page is in — see the
 * comment in `src/app/layout.tsx` for why the root layout does not. The `lang`
 * attribute set here is what tells a screen reader which voice to use and what
 * `globals.css` keys the Thai typography off.
 *
 * Inter carries the whole interface, so it is loaded as a variable font: the
 * editorial display sizes sit at 780 and the wordmark at 900, which a fixed
 * set of static weights could not cover without several extra files.
 *
 * Instrument Serif is one accent word inside a display headline and nothing
 * else, so it is pinned to its single weight.
 *
 * Noto Sans Thai carries Thai text, and only Thai text. It is loaded as a
 * variable font for the same reason as Inter — the display weight of 780 and
 * the wordmark's 900 both have to exist, and IBM Plex Sans Thai stops at 700 —
 * and it is listed *after* Inter in the font stack, so Latin glyphs still come
 * from Inter and only the characters Inter has no glyph for fall through to it.
 * A Thai page therefore keeps the Latin identity of the design intact.
 */

const inter = Inter({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-inter',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument-serif',
});

const notoSansThai = Noto_Sans_Thai({
  // Thai only: the Latin in this family would otherwise be downloaded and
  // never drawn, because Inter is ahead of it in every font stack.
  subsets: ['thai'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-noto-thai',
});

const HOME_TITLE = `${SITE.name} — ${SITE.titleTagline}`;

interface LocaleLayoutProps {
  children: ReactNode;
  params: LocaleParams;
}

/**
 * Both languages are prerendered. Every static leaf below this layout inherits
 * these two values, which is what keeps a page that reads messages from
 * becoming dynamic.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);

  return {
    ...buildMetadata({
      title: HOME_TITLE,
      description: SITE.description,
      path: '/',
      locale,
    }),
    // The page titles below append "· FRAME" to whatever they set. This has to
    // be declared where the template applies, which is here rather than in the
    // root layout, so the spread above cannot flatten it back to a string.
    title: {
      default: HOME_TITLE,
      template: `%s · ${SITE.name}`,
    },
    applicationName: SITE.name,
    formatDetection: { telephone: false, address: false },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await readLocaleParams(params);

  // The `[locale]` segment matches anything, including a crawler asking for
  // `/sitemap.xml.gz`, so an unknown value is a 404 rather than a page rendered
  // in a language that does not exist.
  if (!isLocale(locale)) notFound();

  // Declares the locale for everything rendered below, so reading messages does
  // not force this request to be dynamic.
  setRequestLocale(locale);

  const t = await getTranslations('common');

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${instrumentSerif.variable} ${notoSansThai.variable}`}
      // `ThemeScript` adds `data-theme` to this element before React hydrates,
      // which is a difference between the server HTML and the client's first
      // render by design — it is the whole point of running before the paint.
      // The suppression covers this element's own attributes and nothing
      // below it, so a real mismatch inside the page is still reported.
      suppressHydrationWarning
    >
      <head>
        {/* First, and synchronous: the stored theme has to be on <html>
            before the browser paints, or every load flashes the system theme
            and then corrects itself. Everything else in the head is produced
            by the metadata API. */}
        <ThemeScript />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only-focusable bg-ink px-4 py-2.5 text-caption font-bold text-on-ink"
        >
          {t('skipToContent')}
        </a>

        {/* Hands the active locale and the message catalogue to the client
            components below. With no props it takes both from the request
            configuration this layout has already settled. */}
        <NextIntlClientProvider>
          <ToastProvider>
            <SiteHeader />
            {/* Directly under the header, so demo mode is impossible to miss. */}
            <DemoNotice />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
