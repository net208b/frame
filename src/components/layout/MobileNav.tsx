'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { LogOut, Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { NavLink } from '@/components/layout/NavLink';
import type { MenuViewer } from '@/components/layout/UserMenu';
import { Avatar } from '@/components/photographer/Avatar';
import { ThemeToggle } from '@/components/system/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Navigation below the `lg` breakpoint.
 *
 * Radix's dialog supplies the parts that are easy to get subtly wrong by hand:
 * focus is trapped inside the panel, Escape closes it and focus returns to the
 * trigger. The panel also closes on navigation, so a viewer is never left
 * looking at a menu for the page they have already arrived on.
 *
 * It is also where the language and theme controls live on a small screen —
 * the header has no room for them there — so this panel, and not the header
 * row, is the only way a phone reaches either one.
 */

const PRIMARY_LINKS = [
  { href: '/discover', key: 'discover' },
  { href: '/map', key: 'map' },
  { href: '/locations', key: 'locations' },
  { href: '/collections', key: 'collections' },
  { href: '/community', key: 'community' },
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
  const locale = useLocale();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tTheme = useTranslations('theme');

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
        <span className="sr-only">{t('openNavigation')}</span>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        {/* `bg-scrim` rather than an opacity on the ink token: ink is the
            primary text colour, which is near-white in the dark theme, so a
            scrim built from it would brighten the page it is meant to dim. */}
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim backdrop-blur-[2px] data-[state=open]:motion-safe:animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            'fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto rounded-b-panel bg-paper',
            'px-5 pt-4 pb-7 shadow-modal data-[state=open]:motion-safe:animate-rise-in',
          )}
        >
          <RadixDialog.Title className="sr-only">{t('panelTitle')}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            {t('panelDescription')}
          </RadixDialog.Description>

          <div className="flex items-center justify-between">
            <Link
              href="/"
              onClick={close}
              className="flex items-center gap-2.5"
              aria-label={t('home')}
            >
              <BrandMark className="size-5" />
              <BrandWordmark className="text-[21px]" />
            </Link>
            <RadixDialog.Close className="grid size-9 place-items-center rounded-pill text-muted transition-colors hover:text-ink">
              <X className="size-4.5" aria-hidden />
              <span className="sr-only">{t('closeNavigation')}</span>
            </RadixDialog.Close>
          </div>

          {/* A real GET form, so search works without JavaScript — which means
              the action has to carry the locale itself. */}
          <form
            action={`/${locale}/search`}
            method="get"
            role="search"
            className="mt-6 flex items-end gap-2"
          >
            <TextField
              label={t('searchLabel')}
              name="q"
              type="search"
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              wrapperClassName="flex-1"
            />
            <Button type="submit">{tCommon('search')}</Button>
          </form>

          <nav aria-label={t('allSections')} className="mt-6">
            <ul className="flex flex-col gap-0.5">
              {PRIMARY_LINKS.map((link) => (
                <li key={link.href}>
                  <NavLink href={link.href} variant="stacked" onClick={close}>
                    {t(link.key)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-eyebrow text-muted uppercase">{tCommon('language')}</p>
              <LocaleSwitcher />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-eyebrow text-muted uppercase">{tTheme('label')}</p>
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            {viewer ? (
              <AccountSection viewer={viewer} canModerate={canModerate} onNavigate={close} />
            ) : (
              <div className="flex flex-col gap-2.5">
                <Button asChild variant="secondary" size="lg">
                  <Link href="/login" onClick={close}>
                    {t('logIn')}
                  </Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/join" onClick={close}>
                    {t('join')}
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
  const t = useTranslations('nav');

  const accountLinks = [
    { href: '/upload', label: t('upload') },
    { href: '/collections', label: t('myCollections') },
    { href: `/photographers/${viewer.username}`, label: t('myProfile') },
    { href: '/settings', label: t('settings') },
    ...(canModerate ? [{ href: '/moderation', label: t('moderation') }] : []),
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
          {t('signOut')}
        </button>
      </form>
    </div>
  );
}
