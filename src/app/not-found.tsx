import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/locales';
import { SITE } from '@/lib/config';
import { cn } from '@/lib/utils';

/**
 * The 404 for an address that has no language at all.
 *
 * `src/app/[locale]/not-found.tsx` is the one a reader normally meets: it has a
 * header, a footer and the page's own language, because by then the request is
 * inside the locale segment. This file is the fallback for the requests that
 * never get that far — a single-segment address the middleware skips, such as
 * `/missing.png`, which matches the `[locale]` segment as a locale that does not
 * exist. Without it those requests would land on Next's built-in 404 inside a
 * root layout that renders no `<html>`, and the reader would get a framework
 * error instead of a 404.
 *
 * It therefore renders its own document, and it is deliberately plain. The
 * stylesheet is here, because the root layout imports it, so the colours and
 * spacing are the real ones; the web fonts are not, because they are declared by
 * the locale layout that this page is standing in for. System sans on an
 * address like `/missing.png` is the right trade.
 *
 * English, and `lang` says so: there is no locale to read and no reason to
 * guess one. The way out points at `/en`, which is where every visitor lands.
 */

export const metadata: Metadata = {
  title: `Page not found · ${SITE.name}`,
  description: 'There is nothing at this address on FRAME.',
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
        <main className="max-w-[46ch]">
          <p className="text-eyebrow text-muted uppercase">Error 404</p>

          <h1 className="mt-4 text-section font-bold">Nothing at this address.</h1>

          <p className="mt-5 text-body leading-relaxed text-muted">
            This address does not match a page on {SITE.name}. It is not a page in one of our
            languages either, which usually means the link was assembled by hand or by a crawler.
          </p>

          {/* A full document load rather than a client transition: this page is
              outside the application's own layout, so there is no router here to
              navigate within. */}
          <a
            href={`/${DEFAULT_LOCALE}`}
            className={cn(
              'mt-8 inline-flex items-center rounded-pill bg-ink px-5 py-3',
              'text-caption font-bold text-on-ink transition-opacity hover:opacity-90',
            )}
          >
            Go to the {SITE.name} home page
          </a>
        </main>
      </body>
    </html>
  );
}
