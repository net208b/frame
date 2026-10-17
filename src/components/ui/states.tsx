import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The shared loading, empty and error states.
 *
 * They live in one file because they are one design decision: every surface in
 * FRAME resolves to exactly one of these three, so they must look like a set.
 */

/* ------------------------------------------------------------------------ */
/* Loading                                                                   */
/* ------------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-card', className)} aria-hidden />;
}

/**
 * Gallery skeleton with varied heights, because a grid of identical grey boxes
 * reads as a broken layout rather than as loading.
 */
export function GallerySkeleton({ count = 8 }: { count?: number }) {
  const heights = ['h-[300px]', 'h-[380px]', 'h-[260px]', 'h-[340px]'];

  return (
    <div className="masonry-columns" role="status" aria-label="Loading photographs">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <Skeleton className={cn('w-full rounded-media', heights[index % heights.length])} />
          <Skeleton className="mt-3 h-3.5 w-3/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-2/5 rounded-sm" />
        </div>
      ))}
      <span className="sr-only">Loading photographs</span>
    </div>
  );
}

export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3 rounded-sm', index === lines - 1 ? 'w-2/5' : 'w-full')}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Empty                                                                     */
/* ------------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-panel border border-dashed border-line',
        'px-6 py-16 text-center',
        className,
      )}
    >
      <h3 className="text-title font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-caption leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Error                                                                     */
/* ------------------------------------------------------------------------ */

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-panel border border-line',
        'bg-danger-bg px-6 py-14 text-center',
        className,
      )}
    >
      <h3 className="text-title font-semibold tracking-tight text-danger">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-caption leading-relaxed text-ink-soft">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Inline notice                                                             */
/* ------------------------------------------------------------------------ */

type NoticeTone = 'info' | 'warning' | 'success' | 'danger';

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: 'bg-info-bg text-info',
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-card px-4 py-3 text-caption leading-relaxed', NOTICE_TONES[tone], className)}
    >
      {title && <p className="font-bold">{title}</p>}
      <div className={cn(title && 'mt-1', 'text-ink-soft')}>{children}</div>
    </div>
  );
}
