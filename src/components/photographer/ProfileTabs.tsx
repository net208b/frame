import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The views a profile is divided into.
 *
 * WHY LINKS AND NOT TABS. These are built as ordinary links to `?view=…`, and
 * the server renders the one view that was asked for. Nothing is hidden in the
 * page waiting for JavaScript to reveal it: the address says which view it is,
 * a shared link opens on it, the back button works, and the whole thing
 * functions before hydration. ARIA tabs would mean keyboard handling, panels in
 * the DOM for every view, and an address that forgets which one you were on —
 * three costs for an appearance.
 *
 * WHY ONLY SOME. A view appears here only when the member has something in it:
 * a map with no pins and an empty collections shelf are not sections of a
 * portfolio, they are furniture. With one view left there is no bar at all,
 * because a single tab is not a choice. The page decides what exists; this
 * draws what it is given.
 *
 * WHY NO COUNTS on the labels. The number of frames is already under the
 * portfolio's own heading, and the places are counted in the footprints
 * summary. Repeating them here would be two places to keep in step for no new
 * information.
 */

export const PROFILE_VIEWS = ['frames', 'photobook', 'footprints', 'collections'] as const;

export type ProfileView = (typeof PROFILE_VIEWS)[number];

/** `?view=` as a reader typed it, or the default when it is anything else. */
export function readProfileView(
  value: string | string[] | undefined,
  available: readonly ProfileView[],
): ProfileView {
  const first = Array.isArray(value) ? value[0] : value;
  const match = PROFILE_VIEWS.find((view) => view === first);
  // An address naming a view this member does not have falls back rather than
  // 404s: the profile is still the profile, and the frames are what it opens on.
  return match && available.includes(match) ? match : 'frames';
}

export async function ProfileTabs({
  username,
  active,
  views,
  className,
}: {
  username: string;
  active: ProfileView;
  /** In the order they should appear, as the page worked out. */
  views: readonly ProfileView[];
  className?: string;
}) {
  if (views.length < 2) return null;

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });

  return (
    <nav
      aria-label={t('tabs.label')}
      className={cn('border-b border-line', className)}
    >
      <ul className="-mb-px flex flex-wrap gap-x-7 gap-y-1">
        {views.map((view) => {
          const current = view === active;
          return (
            <li key={view}>
              <Link
                // The default view is the bare address. A profile has one
                // canonical URL and `?view=frames` would be a second one for
                // the same page.
                href={
                  view === 'frames'
                    ? `/photographers/${username}`
                    : `/photographers/${username}?view=${view}`
                }
                // Switching view must not throw the reader back to the top of
                // the page: the bar they just used is halfway down it.
                scroll={false}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 py-3 text-caption font-semibold transition-colors duration-150',
                  current
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {t(`tabs.${view}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
