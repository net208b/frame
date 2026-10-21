import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { ChallengeDetail, ChallengeSummary } from '@/types/domain';

import { CreateChallengeForm } from './CreateChallengeForm';
import { formatInstant, localised } from './format';
import { JudgePanel } from './JudgePanel';

/**
 * The staff side of challenges, as a moderation queue: set the next one, and
 * judge whatever has closed. A closed challenge waiting for its results is
 * the item in this queue that needs a decision, so it is what the tab counts.
 */
export async function ChallengeDesk({
  locale,
  challenges,
  judging,
}: {
  locale: string;
  challenges: ChallengeSummary[];
  /** Full detail for each challenge waiting for results; staff see its awards. */
  judging: ChallengeDetail[];
}) {
  const t = await getTranslations({ locale, namespace: 'challenges' });

  return (
    <div className="space-y-10">
      {judging.map((challenge) => (
        <JudgePanel
          key={challenge.id}
          challengeId={challenge.id}
          title={localised(challenge.title, locale)}
          entries={challenge.entries.map((entry) => ({
            photographId: entry.photograph.id,
            slug: entry.photograph.slug,
            title: entry.photograph.title,
            photographer: entry.photograph.photographer.displayName,
            thumbUrl: entry.photograph.image.thumbUrl,
            award: entry.award,
            note: entry.note,
          }))}
        />
      ))}

      <CreateChallengeForm />

      <section aria-labelledby="all-challenges">
        <h2 id="all-challenges" className="text-title font-bold">
          {t('desk.allTitle')}
        </h2>
        {challenges.length === 0 ? (
          <p className="mt-3 text-body text-muted">{t('desk.none')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {challenges.map((challenge) => (
              <li key={challenge.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <Link href={`/challenges/${challenge.slug}`} className="font-semibold hover:text-accent-strong">
                  {localised(challenge.title, locale)}
                </Link>
                <span className="text-meta text-muted">
                  {t(`phase.${challenge.phase}`)} · {formatInstant(challenge.opensAt, locale)} →{' '}
                  {formatInstant(challenge.closesAt, locale)} · {challenge.entryCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
