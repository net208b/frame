import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/photographer/Avatar';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { PhotographerSummary } from '@/types/domain';

/**
 * "by {name}" with an avatar. Deliberately light: it appears on every card in
 * a gallery as well as on the photograph page.
 *
 * The credit is one message with the name inside it, not the word "by" followed
 * by a link. English puts the credit in front of the name and Thai puts
 * "โดย" there with no space after it, so the position of the link has to be the
 * translator's decision — hence `t.rich` and a `<name>` tag in the message
 * rather than two fragments joined in JSX.
 */
export async function PhotographerByline({
  photographer,
  avatarSize = 24,
  className,
}: {
  photographer: PhotographerSummary;
  avatarSize?: number;
  className?: string;
}) {
  const t = await getTranslations('photo');

  return (
    <p className={cn('flex items-center gap-2 text-meta text-muted', className)}>
      <Avatar
        src={photographer.avatarUrl}
        name={photographer.displayName}
        size={avatarSize}
        decorative
      />
      <span className="min-w-0 truncate">
        {t.rich('byline.by', {
          name: (chunks) => (
            <Link
              href={`/photographers/${photographer.username}`}
              className="font-bold text-ink-soft transition-colors duration-150 hover:text-ink"
            >
              {chunks}
            </Link>
          ),
          photographer: photographer.displayName,
        })}
      </span>
    </p>
  );
}
