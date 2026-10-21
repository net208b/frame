import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AdminShell } from '@/components/admin/AdminShell';
import { buildInbox, type InboxKind } from '@/components/admin/inbox';
import { LiveList } from '@/components/admin/LiveList';
import { intlLocaleOf } from '@/components/challenges/format';
import { EmptyState } from '@/components/ui/states';
import { withLocalePrefix } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer, isAdmin } from '@/lib/auth';
import {
  getChallenges,
  getDiscoverFeed,
  getFeatures,
  getLocations,
  getModerationQueues,
  normaliseDiscoverQuery,
} from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { cn, formatRelative } from '@/lib/utils';

/**
 * The inbox: everything waiting on the admin, newest first, one row each.
 * Rendered on every request — it is one person's working view and changes
 * with every decision.
 */
export const dynamic = 'force-dynamic';

const KIND_TONE: Record<InboxKind, string> = {
  upload: 'bg-accent text-accent-ink',
  place: 'bg-surface-sunken text-ink',
  report: 'bg-danger/15 text-danger',
  challenge: 'bg-surface-sunken text-ink',
  feature: 'bg-surface-sunken text-ink',
};

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'admin' });
  return buildMetadata({ title: t('title'), description: t('inbox.lead'), path: '/adminnet208b', locale, noIndex: true });
}

/** How many of the latest published things the Live tab shows. */
const LIVE_LIMIT = 24;

export default async function AdminInboxPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);
  if (!isAdmin(await getViewer())) redirect(withLocalePrefix('/adminnet208b/login', locale));

  const query = await searchParams;
  const tab = (Array.isArray(query?.tab) ? query?.tab[0] : query?.tab) === 'live' ? 'live' : 'inbox';

  const [t, queues, challenges, features, published, places] = await Promise.all([
    getTranslations({ locale, namespace: 'admin' }),
    getModerationQueues(),
    getChallenges(),
    getFeatures(),
    tab === 'live'
      ? getDiscoverFeed(normaliseDiscoverQuery({ sort: 'recent', pageSize: LIVE_LIMIT }))
      : Promise.resolve(null),
    tab === 'live' ? getLocations({ page: 1 }) : Promise.resolve(null),
  ]);
  const items = buildInbox(queues, challenges, features);
  const intlLocale = intlLocaleOf(locale);

  const tabs = (
    <nav aria-label={t('tabs.label')} className="mt-6 flex gap-6 border-b border-line">
      {(['inbox', 'live'] as const).map((key) => (
        <Link
          key={key}
          href={key === 'inbox' ? '/adminnet208b' : '/adminnet208b?tab=live'}
          aria-current={tab === key ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 py-3 text-caption font-semibold',
            tab === key ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {key === 'inbox' ? t('tabs.inbox', { count: items.length }) : t('tabs.live')}
        </Link>
      ))}
    </nav>
  );

  if (tab === 'live') {
    return (
      <AdminShell locale={locale}>
        <h1 className="text-section font-bold">{t('live.title')}</h1>
        <p className="mt-2 max-w-prose text-body text-muted">{t('live.lead')}</p>
        {tabs}
        <div className="mt-8">
          <LiveList locale={locale} photographs={published?.items ?? []} places={places?.items ?? []} />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell locale={locale}>
      <h1 className="text-section font-bold">{t('inbox.title', { count: items.length })}</h1>
      <p className="mt-2 max-w-prose text-body text-muted">{t('inbox.lead')}</p>
      {tabs}

      {items.length === 0 ? (
        <EmptyState title={t('inbox.emptyTitle')} description={t('inbox.emptyDescription')} className="mt-8" />
      ) : (
        <ol className="mt-8 divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <Link
                href={item.href}
                className="flex items-center gap-4 px-2 py-4 transition-colors duration-150 hover:bg-surface-sunken"
              >
                {item.thumbUrl ? (
                  <Image src={item.thumbUrl} alt="" width={64} height={64} sizes="64px" className="size-16 shrink-0 rounded-media object-cover" />
                ) : (
                  <span className="size-16 shrink-0 rounded-media bg-surface-sunken" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-pill px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', KIND_TONE[item.kind])}>
                      {t(`kinds.${item.kind}`)}
                    </span>
                    {item.signals > 0 ? (
                      <span className="text-caption font-semibold text-danger">
                        {t('inbox.signals', { count: item.signals })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-body font-semibold">{item.title}</p>
                  <p className="text-caption text-muted">
                    {item.by ? t('inbox.by', { name: item.by }) : t('inbox.byStaff')}
                    {item.createdAt ? ` · ${formatRelative(item.createdAt, new Date(), intlLocale)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-caption font-semibold text-ink-soft">{t('inbox.open')} →</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </AdminShell>
  );
}
