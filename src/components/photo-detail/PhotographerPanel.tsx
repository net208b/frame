import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/photographer/Avatar';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { cn, truncate } from '@/lib/utils';
import type { PhotographerProfile, PhotographerSummary } from '@/types/domain';

/** Long enough to hear a voice, short enough that the profile is still worth a click. */
const BIOGRAPHY_EXCERPT_LENGTH = 220;

/**
 * Who made the frame.
 *
 * The summary always exists, because it travels with the photograph. The full
 * profile is a separate read, so a biography is shown when one has been loaded
 * and the panel simply does without when it has not — it never fills the space
 * with invented copy about the photographer. A biography is whatever the
 * photographer wrote, in whatever language they wrote it; it is never
 * translated and never machine-translated.
 */
export async function PhotographerPanel({
  photographer,
  profile,
  className,
}: {
  photographer: PhotographerSummary;
  profile: PhotographerProfile | null;
  className?: string;
}) {
  const [t, common] = await Promise.all([
    getTranslations('photo'),
    getTranslations('common'),
  ]);

  const href = `/photographers/${photographer.username}`;
  const basedIn = profile?.basedIn ?? photographer.basedIn;
  const biography = profile?.biography ?? null;

  return (
    <section className={cn('min-w-0', className)}>
      <Eyebrow>{common('photographer')}</Eyebrow>

      <div className="mt-3 flex items-start gap-4">
        <Avatar src={photographer.avatarUrl} name={photographer.displayName} size={52} decorative />

        <div className="min-w-0">
          <h2 className="text-title font-bold">
            <Link
              href={href}
              className="inline-flex items-start gap-1.5 transition-colors duration-150 hover:text-ink-soft"
            >
              {photographer.displayName}
              <ArrowUpRight aria-hidden className="mt-1 size-4 shrink-0 text-muted" />
            </Link>
          </h2>

          <p className="mt-1 text-meta text-muted">@{photographer.username}</p>

          {basedIn ? (
            <p className="mt-1.5 text-meta text-muted">
              {t.rich('photographer.basedIn', {
                place: (chunks) => <span className="text-ink-soft">{chunks}</span>,
                city: basedIn,
              })}
            </p>
          ) : null}
        </div>
      </div>

      {biography ? (
        <p className="mt-4 text-caption leading-relaxed text-ink-soft">
          {truncate(biography, BIOGRAPHY_EXCERPT_LENGTH)}
        </p>
      ) : null}

      <p className="mt-4">
        <Link
          href={href}
          className="text-caption font-bold underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-ink"
        >
          {t('photographer.portfolio')}
        </Link>
      </p>
    </section>
  );
}
