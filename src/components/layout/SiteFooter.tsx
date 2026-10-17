import Link from 'next/link';

import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { isDemoMode, SITE } from '@/lib/config';

/**
 * The footer: quiet, hairline rule, no newsletter box.
 *
 * The credit line is the point of it. FRAME shows other people's work, so the
 * footer states plainly who owns that work and that the platform licenses
 * nothing on their behalf.
 */

const COLUMNS = [
  {
    heading: 'Explore',
    links: [
      { href: '/discover', label: 'Discover' },
      { href: '/map', label: 'Map' },
      { href: '/locations', label: 'Locations' },
      { href: '/collections', label: 'Collections' },
    ],
  },
  {
    heading: 'Community',
    links: [
      { href: '/community', label: 'Community' },
      { href: '/join', label: 'Join FRAME' },
      { href: '/upload', label: 'Upload' },
    ],
  },
  {
    heading: 'Policies',
    links: [
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/copyright', label: 'Copyright and takedown' },
      { href: '/legal/guidelines', label: 'Community guidelines' },
    ],
  },
] as const;

export function SiteFooter() {
  const year = new Date().getUTCFullYear();

  return (
    <footer className="mt-14 border-t border-line">
      <div className="site-container grid gap-10 py-11 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:gap-8">
        <div>
          <Link href="/" aria-label="FRAME, home" className="inline-flex items-center gap-2.5 text-ink">
            <BrandMark className="size-5" />
            <BrandWordmark className="text-[20px]" />
          </Link>
          <p className="mt-3 text-caption text-muted">{SITE.tagline}</p>
        </div>

        {COLUMNS.map((column) => (
          // A plain section rather than a <nav>: the footer landmark already
          // groups these, and five navigation landmarks per page helps nobody.
          <div key={column.heading}>
            <h2 className="text-eyebrow text-muted uppercase">{column.heading}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-caption font-semibold text-ink-soft transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="site-container flex flex-col gap-2 border-t border-line py-5 text-meta text-muted-soft sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
        <p>
          © {year} {SITE.name}
        </p>
        <p className="max-w-xl leading-relaxed">
          Every photograph belongs to the photographer who made it and is shown with their credit.
          FRAME licenses nothing on their behalf.
          {isDemoMode()
            ? ' The sample photographs in this deployment come from Unsplash under the Unsplash licence.'
            : ''}
        </p>
      </div>
    </footer>
  );
}
