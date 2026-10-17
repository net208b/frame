import { Search } from 'lucide-react';
import Link from 'next/link';

import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { MobileNav } from '@/components/layout/MobileNav';
import { NavLink } from '@/components/layout/NavLink';
import { UserMenu, type MenuViewer } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { getViewer, isModerator } from '@/lib/auth';

/**
 * The application header.
 *
 * A Server Component, so the session is read once per request and never
 * mirrored into client state that could drift from it. Only the three pieces
 * that genuinely need interactivity — the account menu, the mobile panel and
 * the active-route marking — are client leaves.
 */

const PRIMARY_LINKS = [
  { href: '/discover', label: 'Discover' },
  { href: '/map', label: 'Map' },
  { href: '/community', label: 'Community' },
] as const;

export async function SiteHeader() {
  const viewer = await getViewer();
  const canModerate = isModerator(viewer);

  // Only the fields the client leaves actually render. The role stays on the
  // server; `/moderation` authorises every request for itself.
  const menuViewer: MenuViewer | null = viewer
    ? {
        username: viewer.username,
        displayName: viewer.displayName,
        avatarUrl: viewer.avatarUrl,
      }
    : null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-[14px]">
      <div className="site-container flex h-16 items-center justify-between gap-4 lg:h-[76px]">
        <Link href="/" aria-label="FRAME, home" className="flex items-center gap-2.5 text-ink">
          <BrandMark className="size-6" />
          <BrandWordmark className="lg:text-[25px]" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {PRIMARY_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/search"
            className="inline-flex size-10 items-center justify-center rounded-pill border border-line bg-surface text-caption font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink lg:w-auto lg:gap-2 lg:px-3.5"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="sr-only lg:not-sr-only">Search</span>
          </Link>

          {menuViewer ? (
            <UserMenu viewer={menuViewer} canModerate={canModerate} />
          ) : (
            <>
              <Button asChild variant="secondary" className="hidden lg:inline-flex">
                <Link href="/login">Log in</Link>
              </Button>
              <Button
                asChild
                className="h-9 px-3.5 text-[11px] lg:h-10 lg:px-[18px] lg:text-caption"
              >
                <Link href="/join">Join FRAME</Link>
              </Button>
            </>
          )}

          <MobileNav viewer={menuViewer} canModerate={canModerate} className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
