'use client';

import { Award, BadgeCheck, Bell, Heart, ImageUp, MessageSquare, Newspaper, Reply, ShieldCheck, Star, UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition, type ComponentType } from 'react';

import { Avatar } from '@/components/photographer/Avatar';
import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link, useRouter } from '@/i18n/navigation';
import { cn, formatRelative } from '@/lib/utils';
import { markNotificationsRead } from '@/server/actions/notifications';
import type { AppNotification, NotificationKind } from '@/types/domain';

/**
 * The notification list.
 *
 * Each row is a sentence and a link to the thing it is about. The sentence is
 * one whole message per kind per language, because the two languages do not
 * put the actor and the subject in the same order, and a sentence assembled
 * from fragments reads like neither.
 *
 * An unread row is marked, but nothing is marked read just by being looked at:
 * the member says when, with the button. Reading is theirs to declare, and a
 * list that quietly empties itself is a list you cannot come back to.
 */

const ICONS: Record<NotificationKind, ComponentType<{ className?: string }>> = {
  comment: MessageSquare,
  reply: Reply,
  appreciation: Heart,
  follow: UserPlus,
  photograph_published: ImageUp,
  challenge_award: Award,
  editors_pick: Star,
  featured: Newspaper,
  admin_notice: ShieldCheck,
};

/**
 * Where a row goes when it is clicked.
 *
 * Null when the frozen slug is missing — which happens only for a row written
 * before its subject had one — and then the row is still shown, as text,
 * rather than as a link to nowhere.
 */
function hrefFor(notification: AppNotification): string | null {
  if (!notification.subjectSlug) return null;
  if (notification.subjectType === 'profile') {
    return `/photographers/${notification.subjectSlug}`;
  }
  if (notification.subjectType === 'challenge') {
    return `/challenges/${notification.subjectSlug}`;
  }
  if (notification.subjectType === 'feature') {
    return `/features/${notification.subjectSlug}`;
  }
  return `/photographs/${notification.subjectSlug}`;
}

export function NotificationList({ notifications }: { notifications: AppNotification[] }) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = notifications.filter((notification) => notification.readAt === null).length;

  function markAll() {
    startTransition(async () => {
      try {
        const result = await markNotificationsRead(null);
        if (result.ok) {
          router.refresh();
        } else {
          toast.show(result.error, 'danger');
        }
      } catch {
        toast.show(t('markFailed'), 'danger');
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-caption font-semibold text-ink tabular-nums">
          {unread > 0 ? t('unreadCount', { count: unread }) : t('allRead')}
        </p>
        {unread > 0 ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={markAll}>
            {t('markAll')}
          </Button>
        ) : null}
      </div>

      <ol className="mt-6 divide-y divide-line border-y border-line">
        {notifications.map((notification) => {
          /*
            'featured' carries two different pieces of news, told apart by
            what they are ABOUT: a photograph appearing in an editorial
            feature (subject_type 'feature'), and the member themselves being
            featured as a photographer (subject_type 'profile', migration
            0046). Both are genuinely "featured" and the database allows both
            pairs, so the subject decides the sentence rather than a second
            kind that would have meant the same word twice.
          */
          const aboutThem =
            notification.kind === 'featured' && notification.subjectType === 'profile';
          const Icon = aboutThem ? BadgeCheck : ICONS[notification.kind];
          const href = hrefFor(notification);
          const actorName = notification.actor?.displayName ?? t('someone');
          const sentence = t(aboutThem ? 'sentence.featuredProfile' : `sentence.${notification.kind}`, {
            name: actorName,
            subject: notification.subjectLabel,
          });

          const row = (
            <div className="flex items-start gap-3">
              {notification.actor ? (
                <Avatar
                  src={notification.actor.avatarUrl}
                  name={notification.actor.displayName}
                  size={36}
                  decorative
                />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-pill border border-line bg-surface-sunken text-muted">
                  <Bell className="size-4" aria-hidden />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-body leading-relaxed text-ink">{sentence}</p>
                {notification.message ? (
                  <p className="mt-2 rounded-card border border-line bg-surface-sunken px-3 py-2 text-body leading-relaxed whitespace-pre-line text-ink-soft">
                    {notification.message}
                  </p>
                ) : null}
                <p className="mt-1 flex items-center gap-1.5 text-caption text-muted">
                  <Icon className="size-3.5" aria-hidden />
                  {formatRelative(notification.createdAt, new Date(), intlLocale)}
                </p>
              </div>

              {notification.readAt === null ? (
                <span
                  className="mt-2 size-2 shrink-0 rounded-pill bg-accent"
                  aria-label={t('unreadMarker')}
                />
              ) : null}
            </div>
          );

          return (
            <li
              key={notification.id}
              className={cn('py-4', notification.readAt === null && 'bg-surface-sunken/40')}
            >
              {href ? (
                <Link
                  href={href}
                  className="block rounded-card px-2 transition-colors duration-150 hover:bg-surface-sunken"
                >
                  {row}
                </Link>
              ) : (
                <div className="px-2">{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
