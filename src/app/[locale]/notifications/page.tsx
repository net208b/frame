import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { NotificationList } from '@/components/notifications/NotificationList';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { requireViewer } from '@/lib/auth';
import { NOTIFICATION_PAGE_SIZE } from '@/lib/config';
import { getNotifications } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';

/**
 * What happened to this member's work.
 *
 * `noIndex`, like every page that is one member's own view: there is nothing
 * here for a search engine, and row-level security means nobody else could
 * read it anyway.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'notifications' });

  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/notifications',
    locale,
    noIndex: true,
  });
}

export default async function NotificationsPage({ params }: { params: LocaleParams }) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  await requireViewer('/notifications');
  const t = await getTranslations({ locale, namespace: 'notifications' });
  const notifications = await getNotifications(NOTIFICATION_PAGE_SIZE);

  return (
    <div className="site-container py-9 lg:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <SectionHead eyebrow={t('eyebrow')} title={t('title')} headingLevel="h1" />

        {notifications.length === 0 ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} className="mt-10" />
        ) : (
          <div className="mt-8">
            <NotificationList notifications={notifications} />
          </div>
        )}
      </div>
    </div>
  );
}
