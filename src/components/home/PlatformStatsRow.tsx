import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '@/i18n/locales';
import { cn, formatCount } from '@/lib/utils';
import type { PlatformStats } from '@/types/domain';

/**
 * The four aggregate counts under the hero.
 *
 * `PlatformStats.isDemoData` decides the copy, not the styling. When the
 * numbers describe the bundled sample, the row says so in plain visible text
 * beside them and avoids any wording that would read as a measure of a real
 * community — a mock statistic presented as a real one is the single most
 * misleading thing this page could do. That obligation is identical in both
 * languages: `home.stats.demoNote` in `th.json` names the sample as plainly as
 * the English does, and states outright that the figures measure no community.
 *
 * The counts themselves go through `formatCount` with the active locale, so a
 * Thai reader gets Thai compact numbers rather than English ones.
 */
export async function PlatformStatsRow({
  stats,
  locale,
  className,
}: {
  stats: PlatformStats;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  // Keyed by the field name rather than by the label, because the label is now
  // translated and a React key must not change with the language.
  const items: Array<{ id: string; label: string; value: number }> = [
    { id: 'photographs', label: t('stats.photographs'), value: stats.photographs },
    { id: 'locations', label: t('stats.locations'), value: stats.locations },
    { id: 'countries', label: t('stats.countries'), value: stats.countries },
    { id: 'photographers', label: t('stats.photographers'), value: stats.photographers },
  ];

  return (
    <section aria-labelledby="home-stats-heading" className={cn('border-t border-line pt-6', className)}>
      <h2 id="home-stats-heading" className="sr-only">
        {stats.isDemoData ? t('stats.headingDemo') : t('stats.headingReal')}
      </h2>

      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <dl className="flex flex-wrap gap-x-10 gap-y-5">
          {items.map((item) => (
            // The value reads first and the label sits under it, as in the
            // prototype, while the term still precedes its description in the
            // document order a screen reader follows.
            <div key={item.id} className="flex flex-col-reverse">
              <dt className="mt-1.5 text-eyebrow text-muted uppercase">{item.label}</dt>
              <dd className="text-title font-bold tabular-nums">
                {formatCount(item.value, locale)}
              </dd>
            </div>
          ))}
        </dl>

        {stats.isDemoData ? (
          <p className="max-w-[27rem] text-caption text-muted">
            {t.rich('stats.demoNote', {
              strong: (chunks: ReactNode) => (
                <span className="font-bold text-ink">{chunks}</span>
              ),
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
