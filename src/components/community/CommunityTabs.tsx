import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The two halves of the community page: the people, and the books they bind.
 *
 * WHY A SUB-TAB AND NOT A FOURTH PRIMARY LINK. A photobook is something a
 * member makes out of work already on FRAME, so it belongs under the page about
 * members rather than beside it. The header stays at three links, which is the
 * point: a nav that grows by one every time a feature ships stops being a nav.
 *
 * WHY LINKS AND NOT ARIA TABS, the same reasoning as `ProfileTabs`: these are
 * ordinary links to `?view=…` and the server renders the one view asked for.
 * The address says which view it is, a shared link opens on it, the back button
 * works, and nothing waits for JavaScript to be revealed.
 */

export const COMMUNITY_VIEWS = ['photographers', 'photobooks', 'challenges'] as const;

export type CommunityView = (typeof COMMUNITY_VIEWS)[number];

/** `?view=` as a reader typed it, or the default when it is anything else. */
export function readCommunityView(value: string | string[] | undefined): CommunityView {
  const first = Array.isArray(value) ? value[0] : value;
  return COMMUNITY_VIEWS.find((view) => view === first) ?? 'photographers';
}

export async function CommunityTabs({
  active,
  className,
}: {
  active: CommunityView;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'community' });

  return (
    <nav aria-label={t('views.label')} className={cn('border-b border-line', className)}>
      <ul className="-mb-px flex flex-wrap gap-x-7 gap-y-1">
        {COMMUNITY_VIEWS.map((view) => {
          const current = view === active;
          return (
            <li key={view}>
              <Link
                // The default view is the bare address: the community page has
                // one canonical URL, and `?view=photographers` would be a
                // second one for the same page.
                href={view === 'photographers' ? '/community' : `/community?view=${view}`}
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 py-3 text-caption font-semibold transition-colors duration-150',
                  current
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {t(`views.${view}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
