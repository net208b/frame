import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { buildMetadata } from '@/lib/seo';

/**
 * The 404.
 *
 * Useful rather than apologetic: on a platform where members remove their own
 * work and moderators remove other people's, a missing page usually has a
 * reason, and naming the likely ones saves somebody wondering whether the site
 * is broken. The routes out are the three that always have something on them.
 */
export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Page not found',
    description: 'There is nothing at this address on FRAME.',
    path: '/',
    noIndex: true,
  }),
  // The requested address is not knowable here, and the root layout would
  // otherwise have this page advertise the homepage as its canonical URL.
  alternates: { canonical: null },
};

const REASONS = [
  'The address was mistyped, or the link that brought you here was built by hand.',
  'The photographer removed the photograph, or a moderator removed it after a report.',
  'The location has been submitted but not approved yet, so it has no public page.',
  'A collection that used to be public has been made private by its owner.',
] as const;

export default function NotFound() {
  return (
    <div className="site-container py-16 lg:py-24">
      <div className="max-w-2xl">
        <Eyebrow>Error 404</Eyebrow>

        <h1 className="mt-4 text-display-fluid">
          Nothing at this <em className="font-serif font-normal italic">address.</em>
        </h1>

        <p className="mt-6 text-lead leading-relaxed text-muted">
          The page you asked for is not here. That is usually one of four things.
        </p>

        <ul className="mt-5 space-y-2.5 border-t border-line pt-5">
          {REASONS.map((reason) => (
            <li key={reason} className="flex gap-3 text-caption leading-relaxed text-ink-soft">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-muted-soft" />
              {reason}
            </li>
          ))}
        </ul>

        <div className="mt-9 flex flex-wrap items-center gap-2.5">
          <Button asChild size="lg">
            <Link href="/discover">Browse photographs</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/map">Open the map</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">Back to the homepage</Link>
          </Button>
        </div>

        <p className="mt-8 text-caption text-muted">
          If you were looking for something in particular, searching for the place or the
          photographer by name is usually quicker than guessing a URL.{' '}
          <Link
            href="/search"
            className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
          >
            Search FRAME
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
