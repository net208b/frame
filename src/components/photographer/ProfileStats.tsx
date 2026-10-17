import { getLocale, getTranslations } from 'next-intl/server';

import { Eyebrow } from '@/components/ui/SectionHead';
import { cn, formatCount } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

/**
 * The three figures a profile is allowed to state, each one a count of
 * something the member actually published. The explanation under them is not
 * decoration: an appreciation total only means something if the reader knows
 * it counts members rather than clicks.
 *
 * The figures go through `formatCount` with the active locale, so a Thai page
 * reads 1.2 พัน where an English one reads 1.2k — the same number, counted the
 * way each language counts.
 */
export async function ProfileStats({
  photographer,
  className,
}: {
  photographer: PhotographerProfile;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });
  const common = await getTranslations({ locale, namespace: 'common' });

  const figures = [
    {
      id: 'photographs',
      label: common('photographs'),
      value: photographer.photographCount,
    },
    {
      id: 'appreciations',
      label: t('stats.appreciations'),
      value: photographer.appreciationsReceived,
    },
    {
      id: 'locations',
      label: t('stats.locationsAdded'),
      value: photographer.locationsContributed,
    },
  ];

  return (
    <section className={cn(className)}>
      <h2>
        <Eyebrow>{t('stats.eyebrow')}</Eyebrow>
      </h2>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-line border-y border-line">
        {figures.map((figure) => (
          <div key={figure.id} className="px-5 py-5 first:pl-0">
            <dt className="text-eyebrow text-muted-soft uppercase">{figure.label}</dt>
            <dd className="mt-2 text-title font-bold tabular-nums">
              {formatCount(figure.value, locale)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-meta text-muted">{t('stats.note')}</p>
    </section>
  );
}
