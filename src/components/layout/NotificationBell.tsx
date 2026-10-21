import { Bell } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { getUnreadNotificationCount } from '@/lib/data/repository';
import { cn, formatCount } from '@/lib/utils';

/**
 * The bell.
 *
 * A link with a count, not a dropdown: the list is a page, and a panel that
 * fetches on open would be a second way to read the same rows. The count is
 * read on the server with the rest of the header, so there is no flash of a
 * wrong number and no client request on every page view.
 *
 * Past ninety-nine it reads "99+", because the exact figure stops being
 * information and the badge stops fitting. The accessible label always says
 * the real number, since a screen reader has room for it.
 */
export async function NotificationBell({ className }: { className?: string }) {
  const [locale, unread] = await Promise.all([getLocale(), getUnreadNotificationCount()]);
  const t = await getTranslations({ locale, namespace: 'notifications' });

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? t('bellWithCount', { count: unread }) : t('bell')}
      className={cn(
        'relative inline-flex size-10 items-center justify-center rounded-pill border border-line bg-surface text-ink-soft transition-colors hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      <Bell className="size-4" aria-hidden />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-pill bg-accent px-1 py-0.5 text-[10px] font-bold text-accent-ink tabular-nums"
        >
          {unread > 99 ? '99+' : formatCount(unread, locale)}
        </span>
      ) : null}
    </Link>
  );
}
