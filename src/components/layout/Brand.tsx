import { cn } from '@/lib/utils';

/**
 * The FRAME identity: a heavy ring with a single lime dot, plus the wordmark.
 *
 * Both parts are decorative on their own — whoever renders them is responsible
 * for the accessible name of the surrounding link — so the mark is hidden from
 * assistive technology and the wordmark is plain text.
 */

export function BrandMark({ className }: { className?: string }) {
  return (
    // Geometry matches src/app/icon.svg so the tab icon and the in-page mark
    // are the same drawing at two sizes.
    <svg
      viewBox="0 0 32 32"
      className={cn('size-6 shrink-0 text-ink', className)}
      aria-hidden
      focusable="false"
    >
      {/* The lens ring. currentColor lets the mark invert on ink blocks. */}
      <circle cx="14" cy="14" r="8.5" fill="none" stroke="currentColor" strokeWidth="6" />
      {/* The one lime note in the identity: the shutter indicator. */}
      <circle
        cx="25"
        cy="25"
        r="4.4"
        fill="var(--color-accent)"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-[23px] leading-none font-black tracking-[-0.09em]', className)}>
      FRAME
    </span>
  );
}
