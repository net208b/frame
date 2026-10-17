'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEventHandler, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A navigation link that knows whether it is the current page.
 *
 * The active state is never carried by colour alone: it also sets
 * `aria-current="page"`, a heavier weight and a drawn rule, so the current
 * section is legible to a screen reader, to someone who cannot distinguish
 * the two greys, and in a high-contrast theme.
 */

export interface NavLinkProps {
  href: string;
  children: ReactNode;
  /** `inline` is the header row; `stacked` is the mobile panel list. */
  variant?: 'inline' | 'stacked';
  /** Matches the href exactly instead of also matching its sub-paths. */
  exact?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

function isActivePath(pathname: string, href: string, exact: boolean): boolean {
  if (exact || href === '/') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({
  href,
  children,
  variant = 'inline',
  exact = false,
  className,
  onClick,
}: NavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href, exact);

  if (variant === 'stacked') {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex items-center rounded-field px-4 py-3 text-lead transition-colors duration-150',
          active ? 'bg-surface font-bold text-ink' : 'font-semibold text-ink-soft hover:text-ink',
          className,
        )}
      >
        {active && (
          <span
            aria-hidden
            className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-pill bg-ink"
          />
        )}
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative text-body transition-colors duration-150',
        active ? 'font-bold text-ink' : 'font-semibold text-ink-soft hover:text-ink',
        className,
      )}
    >
      {children}
      {active && <span aria-hidden className="absolute -bottom-2 left-0 h-px w-full bg-ink" />}
    </Link>
  );
}
