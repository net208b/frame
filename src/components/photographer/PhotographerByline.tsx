import Link from 'next/link';

import { Avatar } from '@/components/photographer/Avatar';
import { cn } from '@/lib/utils';
import type { PhotographerSummary } from '@/types/domain';

/**
 * "by {name}" with an avatar. Deliberately light: it appears on every card in
 * a gallery as well as on the photograph page.
 */
export function PhotographerByline({
  photographer,
  avatarSize = 24,
  className,
}: {
  photographer: PhotographerSummary;
  avatarSize?: number;
  className?: string;
}) {
  return (
    <p className={cn('flex items-center gap-2 text-meta text-muted', className)}>
      <Avatar
        src={photographer.avatarUrl}
        name={photographer.displayName}
        size={avatarSize}
        decorative
      />
      <span className="min-w-0 truncate">
        by{' '}
        <Link
          href={`/photographers/${photographer.username}`}
          className="font-bold text-ink-soft transition-colors duration-150 hover:text-ink"
        >
          {photographer.displayName}
        </Link>
      </span>
    </p>
  );
}
