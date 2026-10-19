'use client';

import { useLocale, useTranslations } from 'next-intl';

import { LOCALE_LABELS, LOCALES } from '@/i18n/locales';
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
 * `usePathname` here returns the path without its locale prefix, which is what
 * makes `href` the same page in the other language. It does not carry the query
 * string: switching language on a filtered Discover view returns the unfiltered
 * one. Reading the query string in the header would opt every page in the
 * application out of static rendering, which is a worse trade than losing a
 * filter on the rare occasion somebody changes language mid-browse.
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
export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const pathname = usePathname();
  const t = useTranslations('common');

  return (
    <nav
      aria-label={t('language')}
      className={cn(
        'flex items-center gap-0.5 rounded-pill border border-line bg-surface p-0.5',
        className,
      )}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;

        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
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
    </nav>
  );
}
