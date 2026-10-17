import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { DemoNotice } from '@/components/system/DemoNotice';
import { ToastProvider } from '@/components/system/Toast';
import { SITE, siteUrl } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';

import './globals.css';

/**
 * Inter carries the whole interface, so it is loaded as a variable font: the
 * editorial display sizes sit at 780 and the wordmark at 900, which a fixed
 * set of static weights could not cover without several extra files.
 *
 * Instrument Serif is one accent word inside a display headline and nothing
 * else, so it is pinned to its single weight.
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

const HOME_TITLE = `${SITE.name} — ${SITE.tagline}`;

export const metadata: Metadata = {
  ...buildMetadata({ title: HOME_TITLE, description: SITE.description, path: '/' }),
  metadataBase: new URL(siteUrl()),
  title: {
    default: HOME_TITLE,
    template: `%s · ${SITE.name}`,
  },
  applicationName: SITE.name,
  formatDetection: { telephone: false, address: false },
};

export const viewport: Viewport = {
  // Matches --color-paper, so the browser chrome does not flash a different
  // background before the first paint.
  themeColor: '#f8f8f5',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={SITE.locale} className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only-focusable bg-ink px-4 py-2.5 text-caption font-bold text-on-ink"
        >
          Skip to content
        </a>

        <ToastProvider>
          <SiteHeader />
          {/* Directly under the header, so demo mode is impossible to miss. */}
          <DemoNotice />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
