import { getFormatter, getTranslations } from 'next-intl/server';

import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { Link } from '@/i18n/navigation';
import { isDemoMode, SITE } from '@/lib/config';

/**
 * The footer: quiet, hairline rule, no newsletter box.
 *
 * The credit line is the point of it. FRAME shows other people's work, so the
 * footer states plainly who owns that work and that the platform licenses
 * nothing on their behalf. That sentence is one message in each language, not
 * a sentence assembled from clauses — it is a statement about rights and it
 * has to read as one in both.
 *
 * The tagline beside the wordmark stays in English in every language, with the
 * product name: it is part of the identity rather than copy.
 */

const COLUMNS = [
  {
    heading: 'explore',
    links: [
      { href: '/discover', key: 'discover' },
      { href: '/map', key: 'map' },
      { href: '/locations', key: 'locations' },
      { href: '/collections', key: 'collections' },
    ],
  },
  {
    // The style landing pages. They are in the sitemap, but a page reachable
    // only from a sitemap is a page nothing links to, and the footer is where
    // this kind of link belongs: the header stays at three.
    heading: 'styles',
    links: [
      { href: '/discover/style/street', key: 'styleStreet' },
      { href: '/discover/style/night', key: 'styleNight' },
      { href: '/discover/style/documentary', key: 'styleDocumentary' },
    ],
  },
  {
    heading: 'community',
    links: [
      { href: '/community', key: 'community' },
      { href: '/photographers', key: 'photographers' },
      { href: '/join', key: 'join' },
      { href: '/upload', key: 'upload' },
    ],
  },
  {
    heading: 'policies',
    links: [
      { href: '/legal/terms', key: 'terms' },
      { href: '/legal/privacy', key: 'privacy' },
      { href: '/legal/copyright', key: 'copyright' },
      { href: '/legal/guidelines', key: 'guidelines' },
    ],
  },
] as const;

export async function SiteFooter() {
  const [t, tNav, format] = await Promise.all([
    getTranslations('footer'),
    // The wordmark here is the same link, with the same accessible name, as
    // the one in the header; it belongs to the navigation vocabulary rather
    // than being translated twice.
    getTranslations('nav'),
    getFormatter(),
  ]);

  // Through Intl, with grouping off. A year is the one number in the interface
  // that must not be grouped: `2,026` is not a year in any language.
  const year = format.number(new Date().getUTCFullYear(), { useGrouping: false });

  return (
    <footer className="mt-14 border-t border-line">
      <div className="site-container grid gap-10 py-11 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] md:gap-8">
        <div>
          <Link
            href="/"
            aria-label={tNav('home')}
            className="inline-flex items-center gap-2.5 text-ink"
          >
            <BrandMark className="size-5" />
            <BrandWordmark className="text-[20px]" />
          </Link>
          <p className="mt-3 text-caption text-muted">{SITE.tagline}</p>
        </div>

        {COLUMNS.map((column) => (
          // A plain section rather than a <nav>: the footer landmark already
          // groups these, and five navigation landmarks per page helps nobody.
          <div key={column.heading}>
            <h2 className="text-eyebrow text-muted uppercase">{t(`headings.${column.heading}`)}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-caption font-semibold text-ink-soft transition-colors hover:text-ink"
                  >
                    {t(`links.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="site-container flex flex-col gap-2 border-t border-line py-5 text-meta text-muted-soft sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
        <p>{t('copyrightLine', { year, name: SITE.name })}</p>
        <p className="max-w-xl leading-relaxed">
          {t('credit')}
          {/* A second sentence rather than a clause spliced into the first:
              the credit statement is true of every deployment, and this one is
              only true of a deployment running on the bundled sample. */}
          {isDemoMode() ? ` ${t('demoCredit')}` : ''}
        </p>
      </div>
    </footer>
  );
}
