'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { LOCALE_LABELS, LOCALES, type Locale } from '@/i18n/locales';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The language switch.
 *
 * Two real links rather than a menu. Each one points at the page the reader is
 * already on, in the other language, so it works with no JavaScript, it can be
 * opened in a new tab, and the address it goes to is the address they would
 * share. A select element would have needed script to do anything at all.
 *
 * Each language is named in its own language — English, ไทย — because somebody
 * looking for Thai cannot be expected to find it under the English word for it.
 * `lang` on the anchor tells a screen reader which voice to read the label in,
 * and `hreflang` says what it will get on the other side.
 *
 * WHY THE QUERY STRING IS CARRIED, AND WHY IT IS BEHIND A BOUNDARY.
 *
 * This used to drop the query string, with a reason that was true: reading it
 * in the header opts every page in the application out of static rendering, and
 * that was judged a worse trade than losing a filter. The trade got worse as
 * the query string came to hold more — a Discover view is now a category, a
 * place, three gear filters, an ordering, a page AND whether it is drawn as a
 * map — so switching language on a filtered map returned the unfiltered
 * gallery. On a site whose whole promise is that every page reads in both
 * languages, the switch was the one control that could not keep your place.
 *
 * It is carried now, without giving up static rendering, because
 * `useSearchParams()` lives below a Suspense boundary: Next renders the
 * fallback into the static HTML and resolves the real value on the client.
 * Before hydration — and with JavaScript off — the links are the bare path,
 * which is exactly what they were before, so nothing is worse than it was. The
 * two branches render identical markup and differ only in the `href`, so there
 * is no flash of a different control.
 *
 * The change announces itself because it is a navigation: Next's route
 * announcer reads the new page's title, which is in the new language, and the
 * `lang` attribute on `<html>` changes with it so a screen reader switches
 * voice. That is why this is a link and not a button that mutates state —
 * nothing here has to tell assistive technology what happened, because what
 * happened is a page load.
 *
 * `aria-current="true"` rather than `"page"`: both links point at the page the
 * reader is already on, so what is current here is the language, not the page.
 */

function LocaleLinks({ search }: { search: string }) {
  const active = useLocale();
  const pathname = usePathname();

  return (
    <>
      {LOCALES.map((locale) => {
        const isActive = locale === active;

        return (
          <Link
            key={locale}
            // The raw query string rather than a parsed object: a repeated key
            // is kept exactly as it arrived, and this component has no business
            // deciding which repeat wins — the page's own parser does that.
            href={`${pathname}${search}`}
            locale={locale as Locale}
            lang={locale}
            hrefLang={locale}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'rounded-pill px-3 py-2 text-meta font-semibold transition-colors duration-150',
              isActive
                ? 'bg-ink text-on-ink'
                : 'text-muted hover:text-ink focus-visible:text-ink',
            )}
          >
            {LOCALE_LABELS[locale]}
          </Link>
        );
      })}
    </>
  );
}

/** The half that reads the query string, and therefore needs the boundary. */
function LocaleLinksWithQuery() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return <LocaleLinks search={search ? `?${search}` : ''} />;
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common');

  return (
    <nav
      aria-label={t('language')}
      className={cn(
        'flex items-center gap-0.5 rounded-pill border border-line bg-surface p-0.5',
        className,
      )}
    >
      {/* The fallback is the same two links without the query — the behaviour
          this control had before, and what a reader with no JavaScript keeps. */}
      <Suspense fallback={<LocaleLinks search="" />}>
        <LocaleLinksWithQuery />
      </Suspense>
    </nav>
  );
}
