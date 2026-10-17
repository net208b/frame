'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface ChipProps {
  children: ReactNode;
  active?: boolean;
  /** Renders a link instead of a button, so filters stay shareable URLs. */
  href?: string;
  onClick?: () => void;
  count?: number;
  className?: string;
  /** Replaces the visible label for assistive tech when the label is terse. */
  ariaLabel?: string;
}

/**
 * The filter pill used across Discover, the map and location pages.
 *
 * When `href` is given it renders an anchor, which keeps every filter state a
 * real, shareable, back-button-friendly URL rather than hidden client state.
 */
export function Chip({
  children,
  active = false,
  href,
  onClick,
  count,
  className,
  ariaLabel,
}: ChipProps) {
  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-meta font-semibold',
    'transition-colors duration-150',
    active
      ? 'border-ink bg-ink text-on-ink'
      : 'border-line bg-transparent text-muted hover:border-line-strong hover:text-ink',
    className,
  );

  const content = (
    <>
      {children}
      {count !== undefined && (
        <span className={cn('tabular-nums', active ? 'text-on-ink-muted' : 'text-muted-soft')}>
          {count}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-current={active ? 'true' : undefined} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes} aria-pressed={active} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
