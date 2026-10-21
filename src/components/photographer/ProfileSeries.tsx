import { ArrowUpRight, Pencil } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { cn, formatCount } from '@/lib/utils';
import type { PhotoSeries } from '@/types/domain';

/**
 * A member's series on their profile: cover, title, standfirst, count. The
 * page decides which series are handed over (public for a visitor, all for the
 * owner), as it does for the shelf.
 */
export async function ProfileSeries({
  series,
  isSelf,
  className,
}: {
  series: readonly PhotoSeries[];
  isSelf: boolean;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'series' });
  const hasUnlisted = isSelf && series.some((entry) => entry.visibility === 'unlisted');

  return (
    <section className={cn(className)}>
      <SectionHead
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
        description={hasUnlisted ? t('profile.unlistedNote') : undefined}
        action={<p className="text-meta text-muted tabular-nums">{t('profile.count', { count: formatCount(series.length, locale) })}</p>}
      />

      <ul className="grid gap-8 md:grid-cols-2">
        {series.map((entry) => (
          <li key={entry.id} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Link href={`/series/${entry.slug}`} className="relative block aspect-[4/5] overflow-hidden rounded-[6px] bg-surface-sunken" aria-label={entry.title}>
              {entry.cover ? (
                <Image src={entry.cover.image.gridUrl} alt="" fill sizes="(max-width: 640px) 28vw, 160px" className="object-cover" />
              ) : null}
            </Link>
            <div className="min-w-0">
              <h3 className="text-title font-bold leading-tight text-balance">
                <Link href={`/series/${entry.slug}`} className="hover:underline">{entry.title}</Link>
              </h3>
              {entry.standfirst ? (
                <p className="mt-2 line-clamp-3 font-serif text-body italic leading-relaxed text-ink-soft">{entry.standfirst}</p>
              ) : null}
              <p className="mt-2 flex flex-wrap gap-x-2 text-meta text-muted tabular-nums">
                <span>{t('itemCount', { count: entry.items.length })}</span>
                {entry.opens > 0 ? <span>· {t('opens', { count: formatCount(entry.opens, locale) })}</span> : null}
                {isSelf && entry.visibility === 'unlisted' ? (
                  <span className="rounded-pill border border-line px-1.5 text-[10px] font-semibold uppercase tracking-wide">{t('profile.unlisted')}</span>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/series/${entry.slug}`}>
                    {t('profile.read')}
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </Link>
                </Button>
                {isSelf ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/settings?series=${entry.id}#settings-series`}>
                      <Pencil aria-hidden className="size-3.5" />
                      {t('profile.edit')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
