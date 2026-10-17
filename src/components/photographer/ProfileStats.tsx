import { Eyebrow } from '@/components/ui/SectionHead';
import { cn, formatCount } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

/**
 * The three figures a profile is allowed to state, each one a count of
 * something the member actually published. The explanation under them is not
 * decoration: an appreciation total only means something if the reader knows
 * it counts members rather than clicks.
 */
export function ProfileStats({
  photographer,
  className,
}: {
  photographer: PhotographerProfile;
  className?: string;
}) {
  const figures = [
    { label: 'Photographs', value: photographer.photographCount },
    { label: 'Appreciations', value: photographer.appreciationsReceived },
    { label: 'Locations added', value: photographer.locationsContributed },
  ];

  return (
    <section className={cn(className)}>
      <h2>
        <Eyebrow>Contributions</Eyebrow>
      </h2>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-line border-y border-line">
        {figures.map((figure) => (
          <div key={figure.label} className="px-5 py-5 first:pl-0">
            <dt className="text-eyebrow text-muted-soft uppercase">{figure.label}</dt>
            <dd className="mt-2 text-title font-bold tabular-nums">
              {formatCount(figure.value)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-meta text-muted">
        Appreciations are counted once per member and can be withdrawn again.
      </p>
    </section>
  );
}
