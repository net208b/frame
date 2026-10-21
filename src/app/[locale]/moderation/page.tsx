import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { ChallengeDesk } from '@/components/challenges/ChallengeDesk';
import { DuplicateLocationQueue } from '@/components/moderation/DuplicateLocationQueue';
import {
  ADMIN_ONLY_QUEUES,
  DEFAULT_QUEUE,
  isQueueKey,
  QueueTabs,
  type QueueKey,
} from '@/components/moderation/QueueTabs';
import { RecentActions } from '@/components/moderation/RecentActions';
import { ReportQueue } from '@/components/moderation/ReportQueue';
import { SubmissionQueue } from '@/components/moderation/SubmissionQueue';
import { SuspiciousUploadQueue } from '@/components/moderation/SuspiciousUploadQueue';
import { TeamPanel } from '@/components/moderation/TeamPanel';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Eyebrow } from '@/components/ui/SectionHead';
import { getViewer, isAdmin, isModerator, requireModerator } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import {
  getChallenge,
  getChallenges,
  getMapPins,
  getModerationQueues,
  getStaffMembers,
} from '@/lib/data/repository';

/**
 * The moderation dashboard.
 *
 * Built as a working queue rather than a dashboard: dense rows, hairline
 * separators, the decision controls beside the item they belong to, and no
 * summary tile that nobody acts on. Which queue is open is a query parameter,
 * so the whole page stays a Server Component and a moderator can send a
 * colleague the exact queue they are looking at.
 *
 * The role is checked here as well as in the layout. It costs nothing — the
 * session is read once per request and cached — and it means the page does not
 * depend on a parent layout having been rendered this time round.
 *
 * The locale is handed down to every queue rather than read again inside them.
 * They need it twice over: once for their copy, and once for `Intl` — the dates
 * and counts on these rows are formatted in the reader's language, which is the
 * part of a translation that is easiest to leave half-done.
 */

// Staff pages are per-viewer and change with every decision: never served
// from a prerendered copy or a cache.
export const dynamic = 'force-dynamic';

/** Takes the first value, because `?queue=a&queue=b` is one choice, not two. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ModerationPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<{ queue?: string | string[] }>;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const demo = isDemoMode();
  if (!demo) await requireModerator();

  // Map pins are read for one reason: they are the only repository call that
  // returns location ids alongside their slugs, and a duplicate signal or a
  // reported place arrives carrying an id. Without it every such reference
  // degrades to a search, which is a worse link to hand a moderator.
  const [t, resolved, queues, viewer, pins, challenges] = await Promise.all([
    getTranslations({ locale, namespace: 'moderation' }),
    searchParams,
    getModerationQueues(),
    getViewer(),
    getMapPins(),
    getChallenges(),
  ]);

  // Places that withhold their coordinates have no pin, so they are absent
  // here and the queues fall back to a search link for them.
  const locationSlugById: Record<string, string> = {};
  for (const pin of pins) locationSlugById[pin.id] = pin.slug;

  // The team tab belongs to administrators. Anyone else who asks for it by URL
  // gets the default queue, exactly as for a queue name that does not exist.
  const admin = isAdmin(viewer);
  const requested = firstValue(resolved.queue);
  const active: QueueKey =
    isQueueKey(requested) && (admin || !ADMIN_ONLY_QUEUES.has(requested)) ? requested : DEFAULT_QUEUE;
  const staff = active === 'team' ? await getStaffMembers() : [];

  // A closed challenge with no published results is the one challenge item
  // that waits on a decision; its full detail is read only on its own tab.
  const awaitingResults = challenges.filter((challenge) => challenge.phase === 'judging');
  const judging =
    active === 'challenges'
      ? (await Promise.all(awaitingResults.map((challenge) => getChallenge(challenge.slug)))).filter(
          (challenge): challenge is NonNullable<typeof challenge> => challenge !== null,
        )
      : [];

  const counts: Record<QueueKey, number> = {
    submissions: queues.submissions.length,
    reports: queues.reports.length,
    challenges: awaitingResults.length,
    uploads: queues.suspiciousUploads.length,
    duplicates: queues.possibleDuplicates.length,
    actions: queues.recentActions.length,
    team: staff.length,
  };

  const outstanding = counts.submissions + counts.reports + counts.uploads;

  return (
    <div className="site-container py-10 lg:py-12">
      <header>
        <Eyebrow>{t('page.eyebrow')}</Eyebrow>
        <h1 className="mt-2.5 text-section-fluid font-bold">{t('page.title')}</h1>
        <p className="mt-3.5 max-w-[48rem] text-lead text-muted">
          {outstanding === 0
            ? t('page.nothingWaiting')
            : demo
              ? t('page.waitingInSample', { count: outstanding })
              : t('page.waiting', { count: outstanding })}{' '}
          {t('page.signalsAreNotVerdicts')} {t('page.reasonAudience')}
        </p>
        {viewer && isModerator(viewer) ? (
          <p className="mt-2.5 text-meta text-muted-soft">
            {t('page.signedInAs', {
              name: viewer.displayName,
              username: viewer.username,
              role: t(`page.role.${viewer.role}`),
            })}
          </p>
        ) : null}

        {demo ? (
          <p className="mt-2.5 max-w-[48rem] text-meta leading-relaxed text-muted-soft">
            {t('page.openOnlyInDemo')}
          </p>
        ) : null}

        <CapabilityNotice
          capability="database"
          action={t('page.capabilityAction')}
          className="mt-6 max-w-[48rem]"
        />
      </header>

      <QueueTabs
        locale={locale}
        active={active}
        counts={counts}
        showAdminQueues={admin}
        className="mt-9"
      />

      <div className="pt-9">
        {active === 'submissions' && (
          <SubmissionQueue
            locale={locale}
            submissions={queues.submissions}
            locationSlugById={locationSlugById}
          />
        )}
        {active === 'reports' && (
          <ReportQueue
            locale={locale}
            reports={queues.reports}
            locationSlugById={locationSlugById}
          />
        )}
        {active === 'uploads' && (
          <SuspiciousUploadQueue locale={locale} uploads={queues.suspiciousUploads} />
        )}
        {active === 'duplicates' && (
          <DuplicateLocationQueue locale={locale} pairs={queues.possibleDuplicates} />
        )}
        {active === 'challenges' && (
          <ChallengeDesk locale={locale} challenges={challenges} judging={judging} />
        )}
        {active === 'actions' && <RecentActions locale={locale} actions={queues.recentActions} />}
        {active === 'team' && admin && (
          <TeamPanel locale={locale} staff={staff} viewerId={viewer?.id ?? null} />
        )}
      </div>
    </div>
  );
}
