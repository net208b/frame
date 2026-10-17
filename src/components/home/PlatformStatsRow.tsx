import { cn, formatCount } from '@/lib/utils';
import type { PlatformStats } from '@/types/domain';

/**
 * The four aggregate counts under the hero.
 *
 * `PlatformStats.isDemoData` decides the copy, not the styling. When the
 * numbers describe the bundled sample, the row says so in plain visible text
 * beside them and avoids any wording that would read as a measure of a real
 * community — a mock statistic presented as a real one is the single most
 * misleading thing this page could do.
 */
export function PlatformStatsRow({
  stats,
  className,
}: {
  stats: PlatformStats;
  className?: string;
}) {
  const items: Array<{ label: string; value: number }> = [
    { label: 'Photographs', value: stats.photographs },
    { label: 'Locations', value: stats.locations },
    { label: 'Countries', value: stats.countries },
    { label: 'Photographers', value: stats.photographers },
  ];

  return (
    <section aria-labelledby="home-stats-heading" className={cn('border-t border-line pt-6', className)}>
      <h2 id="home-stats-heading" className="sr-only">
        {stats.isDemoData ? 'The bundled demo dataset in numbers' : 'FRAME in numbers'}
      </h2>

      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
        <dl className="flex flex-wrap gap-x-10 gap-y-5">
          {items.map((item) => (
            // The value reads first and the label sits under it, as in the
            // prototype, while the term still precedes its description in the
            // document order a screen reader follows.
            <div key={item.label} className="flex flex-col-reverse">
              <dt className="mt-1.5 text-eyebrow text-muted uppercase">{item.label}</dt>
              <dd className="text-title font-bold tabular-nums">{formatCount(item.value)}</dd>
            </div>
          ))}
        </dl>

        {stats.isDemoData ? (
          <p className="max-w-[27rem] text-caption text-muted">
            <span className="font-bold text-ink">Sample figures.</span> No database is configured,
            so these four counts describe the demo dataset bundled with this build. They are not a
            measure of any community.
          </p>
        ) : null}
      </div>
    </section>
  );
}
