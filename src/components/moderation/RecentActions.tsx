import { getTranslations } from 'next-intl/server';

import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import { MODERATION_DECISION_MESSAGE_KEYS } from '@/lib/validation/moderation';
import type { ModerationAction } from '@/types/domain';

/**
 * The audit trail, read-only.
 *
 * `moderation_actions` is append-only in the database — no update or delete
 * privilege is granted to any application role — so there is nothing to edit
 * here and no control that pretends otherwise. A decision that turns out to be
 * wrong is corrected by recording the new one, which is why the trail is read
 * as a sequence rather than a current state.
 *
 * The reason column shows what a moderator wrote, in the language they wrote it
 * in. It is their words on the record, so it is never run through a translator
 * — the decision beside it is the part this app names, and that is translated.
 */

/** A quiet tone per outcome. The decision is spelled out either way. */
const DECISION_TONES: Record<ModerationAction['decision'], string> = {
  approve: 'text-success',
  dismiss: 'text-muted',
  request_changes: 'text-warning',
  reject: 'text-danger',
  remove_content: 'text-danger',
  suspend_account: 'text-danger',
  change_role: 'text-ink',
  delete: 'text-danger',
};

export async function RecentActions({
  locale,
  actions,
}: {
  locale: Locale;
  actions: readonly ModerationAction[];
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });
  const intlLocale = INTL_LOCALES[locale];

  return (
    <section aria-labelledby="queue-actions">
      <SectionHead
        eyebrow={t('actions.eyebrow')}
        title={<span id="queue-actions">{t('actions.title')}</span>}
        description={t('actions.description')}
      />

      <QueueCapNote locale={locale} shown={actions.length} />

      {actions.length === 0 ? (
        <EmptyState
          title={t('actions.emptyTitle')}
          description={t('actions.emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">{t('actions.caption')}</caption>
            <thead>
              <tr className="border-y border-line">
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  {t('actions.columns.decision')}
                </th>
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  {t('actions.columns.subject')}
                </th>
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  {t('actions.columns.reason')}
                </th>
                <th scope="col" className="py-2.5 pr-4 text-eyebrow text-muted uppercase">
                  {t('actions.columns.moderator')}
                </th>
                <th scope="col" className="py-2.5 text-eyebrow text-muted uppercase">
                  {t('actions.columns.when')}
                </th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.id} className="border-b border-line align-top">
                  <th
                    scope="row"
                    className={cn(
                      'py-3.5 pr-4 text-caption font-bold whitespace-nowrap',
                      DECISION_TONES[action.decision],
                    )}
                  >
                    {t(MODERATION_DECISION_MESSAGE_KEYS[action.decision])}
                  </th>
                  <td className="py-3.5 pr-4 text-caption text-ink-soft">
                    {t(`actions.subject.${action.subjectType}`)}{' '}
                    <span className="font-mono text-meta text-muted" title={action.subjectId}>
                      {action.subjectId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="max-w-[26rem] py-3.5 pr-4 text-caption leading-relaxed text-ink-soft">
                    {action.reason ?? (
                      <span className="text-muted">
                        {action.decision === 'approve' || action.decision === 'dismiss'
                          ? t('actions.noneNeeded')
                          : t('actions.noneRecorded')}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 pr-4 text-caption whitespace-nowrap">
                    <Link
                      href={`/photographers/${action.moderator.username}`}
                      className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                    >
                      {action.moderator.displayName}
                    </Link>
                  </td>
                  <td className="py-3.5 text-caption whitespace-nowrap text-muted">
                    <time
                      dateTime={action.createdAt}
                      title={formatDate(action.createdAt, intlLocale) ?? undefined}
                    >
                      {formatRelative(action.createdAt, new Date(), intlLocale)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
