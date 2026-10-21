import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { AdminShell } from '@/components/admin/AdminShell';
import { buildInbox, type InboxKind } from '@/components/admin/inbox';
import { intlLocaleOf } from '@/components/challenges/format';
import { EmptyState } from '@/components/ui/states';
import { withLocalePrefix } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer, isAdmin } from '@/lib/auth';
import { getChallenges, getFeatures, getModerationQueues } from '@/lib/data/repository';
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

export default async function AdminInboxPage({ params }: { params: LocaleParams }) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);
  if (!isAdmin(await getViewer())) redirect(withLocalePrefix('/adminnet208b/login', locale));

  const [t, queues, challenges, features] = await Promise.all([
    getTranslations({ locale, namespace: 'admin' }),
    getModerationQueues(),
    getChallenges(),
    getFeatures(),
  ]);
  const items = buildInbox(queues, challenges, features);
  const intlLocale = intlLocaleOf(locale);

  return (
    <AdminShell locale={locale}>
      <h1 className="text-section font-bold">{t('inbox.title', { count: items.length })}</h1>
      <p className="mt-2 max-w-prose text-body text-muted">{t('inbox.lead')}</p>

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
