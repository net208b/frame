import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The section furniture used by every editorial surface in FRAME: an uppercase
 * eyebrow preceded by a short rule, a tight section heading, and an optional
 * note or action aligned to the baseline on the right.
 */

export function Eyebrow({
  children,
  className,
  onInk = false,
}: {
  children: ReactNode;
  className?: string;
  /** Use on an inverted editorial block, where ink-coloured text disappears. */
  onInk?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 text-eyebrow uppercase',
        onInk ? 'text-on-ink-muted' : 'text-muted',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('h-px w-[22px] shrink-0', onInk ? 'bg-on-ink-muted' : 'bg-muted-soft')}
      />
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  description,
  action,
  className,
  headingLevel = 'h2',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
  /**
   * Escape hatch so a page can reuse this furniture for its own h1 without a
   * second heading appearing above it. Defaults to the section level, h2.
   */
  headingLevel?: 'h1' | 'h2' | 'h3';
}) {
  const Heading = headingLevel;

  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-5',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading className={cn('text-section font-bold', eyebrow && 'mt-2')}>{title}</Heading>
      </div>

      {description || action ? (
        <div className="flex flex-wrap items-end justify-end gap-x-6 gap-y-3">
          {description ? (
            <p className="max-w-[20rem] text-caption text-muted">{description}</p>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
