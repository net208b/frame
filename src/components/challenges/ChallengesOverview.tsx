import { Award, CalendarClock, Gavel } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PhotoCard } from '@/components/photo/PhotoCard';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { cn, formatCount } from '@/lib/utils';
import type { ChallengeSummary } from '@/types/domain';

import { daysUntil, formatInstant, intlLocaleOf, localised } from './format';

/**
 * The challenges view of the community page.
 *
 * What is open now comes first, because it is the one thing on this page a
 * member can still act on. Then whatever is being judged, the next one
 * announced, and the past ones with their winners — the archive is what shows
 * a newcomer what a challenge here looks like.
 */
export async function ChallengesOverview({
  challenges,
  locale,
}: {
  challenges: ChallengeSummary[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'challenges' });
  const intlLocale = intlLocaleOf(locale);

  const open = challenges.find((challenge) => challenge.phase === 'open') ?? null;
  const judging = challenges.filter((challenge) => challenge.phase === 'judging');
  const upcoming = challenges
    .filter((challenge) => challenge.phase === 'upcoming')
    .sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt))
    .at(0);
  const past = challenges.filter((challenge) => challenge.phase === 'closed');

  return (
    <div className="mt-10 space-y-16">
      <section>
        <SectionHead eyebrow={t('overview.openEyebrow')} title={t('overview.openTitle')} />

        {open ? (
          <article className="mt-6 rounded-panel border border-line bg-surface p-6 lg:p-9">
            <Eyebrow>{t('phase.open')}</Eyebrow>
            <h3 className="mt-3 text-section font-bold">
              <Link href={`/challenges/${open.slug}`} className="hover:text-accent-strong">
                {localised(open.title, locale)}
              </Link>
            </h3>
            <p className="mt-4 max-w-prose text-body leading-relaxed whitespace-pre-line text-ink-soft">
              {localised(open.brief, locale)}
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-meta text-muted">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4" aria-hidden />
                <dt className="sr-only">{t('overview.closes')}</dt>
                <dd>
                  {t('overview.closesIn', {
                    days: daysUntil(open.closesAt),
                    date: formatInstant(open.closesAt, locale),
                  })}
                </dd>
              </div>
              <div>
                <dt className="sr-only">{t('overview.entries')}</dt>
                <dd>{t('overview.entryCount', { count: open.entryCount, formatted: formatCount(open.entryCount, intlLocale) })}</dd>
              </div>
            </dl>
            <Link
              href={`/challenges/${open.slug}`}
              className="mt-7 inline-flex h-10 items-center rounded-pill bg-ink px-5 text-caption font-bold text-on-ink hover:bg-ink-soft"
            >
              {t('overview.enterCta')}
            </Link>
          </article>
        ) : (
          <EmptyState
            title={t('overview.noneOpenTitle')}
            description={
              upcoming
                ? t('overview.nextOpens', {
                    title: localised(upcoming.title, locale),
                    date: formatInstant(upcoming.opensAt, locale),
                  })
                : t('overview.noneOpenDescription')
            }
            className="mt-6"
          />
        )}
      </section>

      {judging.length > 0 ? (
        <section aria-labelledby="challenge-judging">
          <h2 id="challenge-judging" className="flex items-center gap-2 text-title font-bold">
            <Gavel className="size-5" aria-hidden />
            {t('overview.judgingTitle')}
          </h2>
          <ul className="mt-4 space-y-2">
            {judging.map((challenge) => (
              <li key={challenge.id}>
                <Link href={`/challenges/${challenge.slug}`} className="text-body font-semibold hover:text-accent-strong">
                  {localised(challenge.title, locale)}
                </Link>{' '}
                <span className="text-meta text-muted">
                  · {t('overview.entryCount', { count: challenge.entryCount, formatted: formatCount(challenge.entryCount, intlLocale) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open && upcoming ? (
        <p className="text-meta text-muted">
          {t('overview.nextOpens', {
            title: localised(upcoming.title, locale),
            date: formatInstant(upcoming.opensAt, locale),
          })}
        </p>
      ) : null}

      <section aria-labelledby="challenge-past">
        <h2 id="challenge-past" className="flex items-center gap-2 text-title font-bold">
          <Award className="size-5" aria-hidden />
          {t('overview.pastTitle')}
        </h2>
        {past.length === 0 ? (
          <p className="mt-3 text-body text-muted">{t('overview.pastEmpty')}</p>
        ) : (
          <ul className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((challenge) => (
              <li key={challenge.id} className={cn('min-w-0')}>
                {challenge.winner ? <PhotoCard photo={challenge.winner} /> : null}
                <p className="mt-3 text-eyebrow text-muted uppercase">{t('overview.winnerOf')}</p>
                <Link
                  href={`/challenges/${challenge.slug}`}
                  className="mt-1 block text-body font-semibold hover:text-accent-strong"
                >
                  {localised(challenge.title, locale)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
