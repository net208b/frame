'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { NavLink } from '@/components/layout/NavLink';
import type { MenuViewer } from '@/components/layout/UserMenu';
import { Avatar } from '@/components/photographer/Avatar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * Navigation below the `lg` breakpoint.
 *
 * Radix's dialog supplies the parts that are easy to get subtly wrong by hand:
 * focus is trapped inside the panel, Escape closes it and focus returns to the
 * trigger. The panel also closes on navigation, so a viewer is never left
 * looking at a menu for the page they have already arrived on.
 */

const PRIMARY_LINKS = [
  { href: '/discover', label: 'Discover' },
  { href: '/map', label: 'Map' },
  { href: '/locations', label: 'Locations' },
  { href: '/collections', label: 'Collections' },
  { href: '/community', label: 'Community' },
] as const;

export function MobileNav({
  viewer,
  canModerate,
  className,
}: {
  viewer: MenuViewer | null;
  canModerate: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation, decided during render rather than in an effect: an
  // effect would let the panel paint once over the page it was navigating away
  // from. Clicking a link inside the panel also closes it directly, which
  // covers the case where the destination is the page already shown.
  const [syncedPath, setSyncedPath] = useState(pathname);
  if (pathname !== syncedPath) {
    setSyncedPath(pathname);
    if (open) setOpen(false);
  }

  const close = () => setOpen(false);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger
        className={cn(
          'grid size-10 place-items-center rounded-pill border border-line bg-surface text-ink-soft',
          'transition-colors hover:border-line-strong hover:text-ink',
          className,
        )}
      >
        <Menu className="size-4.5" aria-hidden />
        <span className="sr-only">Open navigation</span>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-[2px] data-[state=open]:motion-safe:animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            'fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto rounded-b-panel bg-paper',
            'px-5 pt-4 pb-7 shadow-modal data-[state=open]:motion-safe:animate-rise-in',
          )}
        >
          <RadixDialog.Title className="sr-only">Site navigation</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            Navigate FRAME, search the archive and reach your account.
          </RadixDialog.Description>

          <div className="flex items-center justify-between">
            <Link href="/" onClick={close} className="flex items-center gap-2.5" aria-label="FRAME, home">
              <BrandMark className="size-5" />
              <BrandWordmark className="text-[21px]" />
            </Link>
            <RadixDialog.Close className="grid size-9 place-items-center rounded-pill text-muted transition-colors hover:text-ink">
              <X className="size-4.5" aria-hidden />
              <span className="sr-only">Close navigation</span>
            </RadixDialog.Close>
          </div>

          <form action="/search" method="get" role="search" className="mt-6 flex items-end gap-2">
            <TextField
              label="Search FRAME"
              name="q"
              type="search"
              placeholder="Photographs, places, photographers"
              autoComplete="off"
              wrapperClassName="flex-1"
            />
            <Button type="submit">Search</Button>
          </form>

          <nav aria-label="All sections" className="mt-6">
            <ul className="flex flex-col gap-0.5">
              {PRIMARY_LINKS.map((link) => (
                <li key={link.href}>
                  <NavLink href={link.href} variant="stacked" onClick={close}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 border-t border-line pt-5">
            {viewer ? (
              <AccountSection viewer={viewer} canModerate={canModerate} onNavigate={close} />
            ) : (
              <div className="flex flex-col gap-2.5">
                <Button asChild variant="secondary" size="lg">
                  <Link href="/login" onClick={close}>
                    Log in
                  </Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/join" onClick={close}>
                    Join FRAME
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function AccountSection({
  viewer,
  canModerate,
  onNavigate,
}: {
  viewer: MenuViewer;
  canModerate: boolean;
  onNavigate: () => void;
}) {
  const accountLinks = [
    { href: '/upload', label: 'Upload a photograph' },
    { href: '/collections', label: 'My collections' },
    { href: `/photographers/${viewer.username}`, label: 'My profile' },
    ...(canModerate ? [{ href: '/moderation', label: 'Moderation' }] : []),
  ];

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={38} decorative />
        <div className="min-w-0">
          <p className="truncate text-body font-bold text-ink">{viewer.displayName}</p>
          <p className="truncate text-meta text-muted">@{viewer.username}</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-0.5">
        {accountLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              className="block rounded-field px-4 py-2.5 text-body font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <form action="/auth/signout" method="post" className="mt-3">
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-field px-4 py-2.5 text-body font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
        >
          <LogOut className="size-4 shrink-0 text-muted" aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}
