'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bookmark, ChevronDown, LogOut, Rss, Settings, ShieldCheck, Upload, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, type ComponentType, type ReactNode } from 'react';

import { Avatar } from '@/components/photographer/Avatar';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The signed-in account menu.
 *
 * It takes a plain object rather than the `Viewer` returned by `getViewer()`,
 * and a pre-computed `canModerate`, because the authorisation decision belongs
 * on the server. Hiding the Moderation item is a courtesy; `/moderation`
 * re-checks the role on every request regardless of what this menu renders.
 */

export interface MenuViewer {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

const ITEM_CLASS = cn(
  'flex w-full cursor-pointer items-center gap-2.5 rounded-field px-3 py-2.5 text-left',
  'text-caption font-semibold text-ink-soft outline-none',
  'data-[highlighted]:bg-surface-sunken data-[highlighted]:text-ink',
);

export function UserMenu({
  viewer,
  canModerate,
  className,
}: {
  viewer: MenuViewer;
  canModerate: boolean;
  className?: string;
}) {
  const t = useTranslations('nav');

  // Sign-out is a real form POST, but it is NOT fired by a `type="submit"`
  // button inside the menu item: Radix owns the item's activation and the
  // native submit never reached the form, so clicking did nothing at all. The
  // item's `onSelect` calls `requestSubmit()` on this form instead — the same
  // real POST, triggered by the one handler Radix guarantees runs.
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <>
      {/* Outside the dropdown's portal, so it survives the menu unmounting on
          select — `requestSubmit` below needs it in the DOM at that moment. */}
      <form ref={signOutForm} action="/auth/signout" method="post" className="hidden" />

      <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          'flex items-center gap-1.5 rounded-pill p-0.5 text-muted transition-colors hover:text-ink',
          className,
        )}
        // One message with the name inside it, not a label stitched together
        // from a fragment and a variable: Thai puts no space before the name
        // and English does, and only the message file can know that.
        aria-label={t('accountMenu', { name: viewer.displayName })}
      >
        <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={34} decorative />
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          collisionPadding={16}
          className={cn(
            'z-50 min-w-[246px] rounded-card border border-line bg-surface p-1.5',
            'shadow-popover data-[state=open]:motion-safe:animate-rise-in',
          )}
        >
          <div className="px-3 pt-2 pb-3">
            <p className="text-body font-bold text-ink">{viewer.displayName}</p>
            <p className="text-meta text-muted">@{viewer.username}</p>
          </div>

          <DropdownMenu.Separator className="mx-1 mb-1.5 h-px bg-line" />

          <MenuLink href="/upload" icon={Upload}>
            {t('upload')}
          </MenuLink>
          <MenuLink href="/feed" icon={Rss}>
            {t('feed')}
          </MenuLink>
          <MenuLink href="/collections" icon={Bookmark}>
            {t('myCollections')}
          </MenuLink>
          <MenuLink href={`/photographers/${viewer.username}`} icon={User}>
            {t('myProfile')}
          </MenuLink>
          <MenuLink href="/settings" icon={Settings}>
            {t('settings')}
          </MenuLink>
          {canModerate && (
            <MenuLink href="/moderation" icon={ShieldCheck}>
              {t('moderation')}
            </MenuLink>
          )}

          <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />

          <DropdownMenu.Item
            // `requestSubmit`, not `.submit()`, so the POST goes through the
            // form's action and method exactly as a click on a submit button
            // would — the route still sees a same-origin form POST.
            onSelect={() => signOutForm.current?.requestSubmit()}
            className={ITEM_CLASS}
          >
            <LogOut className="size-4 shrink-0 text-muted" aria-hidden />
            {t('signOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item asChild>
      <Link href={href} className={ITEM_CLASS}>
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        {children}
      </Link>
    </DropdownMenu.Item>
  );
}
