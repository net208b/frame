import Image from 'next/image';

import { IMAGE_SIZES } from '@/lib/images/variants';
import { cn } from '@/lib/utils';

/** Up to two initials, for the fallback when a member has no avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0)?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';
  const letters = `${first}${last}`.toUpperCase();
  return letters || '?';
}

export function Avatar({
  src,
  name,
  size = 32,
  className,
  decorative = false,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
  /**
   * Set when adjacent text already names the person, so the avatar is not
   * announced twice. Left off, the name travels with the image instead.
   */
  decorative?: boolean;
}) {
  const shell = 'shrink-0 overflow-hidden rounded-pill border border-line';

  if (src) {
    return (
      <Image
        src={src}
        alt={decorative ? '' : name}
        width={size}
        height={size}
        sizes={IMAGE_SIZES.avatar}
        className={cn(shell, 'object-cover', className)}
      />
    );
  }

  return (
    <span
      className={cn(shell, 'grid place-items-center bg-surface-sunken font-bold text-ink-soft', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      <span aria-hidden>{initials(name)}</span>
      {decorative ? null : <span className="sr-only">{name}</span>}
    </span>
  );
}
