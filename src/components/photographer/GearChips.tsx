import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { buildProfileGearHref, type GearFacet } from '@/lib/gear-filter';
import { cn, formatCount } from '@/lib/utils';

/**
 * The gear this member's frames were shot on, as a row of filters above the
 * gallery. Counted from the published photographs' own EXIF, so a chip can
 * only ever lead to frames that exist — and the row does not appear at all
 * when there is only one kind of gear, because one chip is not a choice.
 *
 * Links, like the profile tabs: the address carries the filter, the server
 * renders the filtered gallery, and a shared link opens already filtered.
 */
export async function GearChips({
  username,
  facets,
  active,
  total,
  className,
}: {
  username: string;
  facets: readonly GearFacet[];
  active: GearFacet | null;
  total: number;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });

  const chip = (current: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-meta font-semibold',
      'transition-colors duration-150 tabular-nums',
      current
        ? 'border-ink bg-ink text-on-ink'
        : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
    );

  return (
    <nav aria-label={t('gearFilter.label')} className={cn(className)}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={buildProfileGearHref(username, null)}
            scroll={false}
            aria-current={active ? undefined : 'true'}
            className={chip(active === null)}
          >
            {t('gearFilter.all')}
            <span className="opacity-70">· {formatCount(total, locale)}</span>
          </Link>
        </li>
        {facets.map((facet) => {
          const current = active?.key === facet.key;
          return (
            <li key={facet.key}>
              <Link
                href={buildProfileGearHref(username, facet.key)}
                scroll={false}
                aria-current={current ? 'true' : undefined}
                className={chip(current)}
              >
                {facet.label}
                <span className="opacity-70">· {formatCount(facet.count, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
