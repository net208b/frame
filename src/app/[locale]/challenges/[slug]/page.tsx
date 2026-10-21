import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { EntryPanel } from '@/components/challenges/EntryPanel';
import { formatInstant, localised } from '@/components/challenges/format';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { PhotoCard } from '@/components/photo/PhotoCard';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { getViewer } from '@/lib/auth';
import { getChallenge, getChallengeCandidates } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import type { ChallengeAward, ChallengeEntry } from '@/types/domain';

/**
 * One challenge: the brief and its rules, the entry panel while it is open,
 * the editors' choices once they are published, and everything entered.
 *
 * Awards are shown only once published. Staff can read them earlier — row-
 * level security lets them, for judging — but this is the public page, and a
 * result shown here before it is announced would be an announcement.
 */

interface PageProps {
  params: LocaleParams<{ slug: string }>;
}

const loadChallenge = cache(getChallenge);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const challenge = await loadChallenge(slug);
  if (!challenge) return {};
  return buildMetadata({
    title: localised(challenge.title, locale),
    description: truncate(localised(challenge.brief, locale), 160),
    path: `/challenges/${challenge.slug}`,
    locale,
  });
}

const AWARD_GROUPS: readonly ChallengeAward[] = ['winner', 'runner_up', 'honourable_mention'];

export default async function ChallengePage({ params }: PageProps) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);

  const [challenge, viewer, t] = await Promise.all([
    loadChallenge(slug),
    getViewer(),
    getTranslations({ locale, namespace: 'challenges' }),
  ]);
  if (!challenge) notFound();

  const open = challenge.phase === 'open';
  const published = challenge.phase === 'closed';

  const candidates =
    open && viewer ? await getChallengeCandidates(challenge, viewer.id) : [];

  const awarded = (award: ChallengeAward): ChallengeEntry[] =>
    published ? challenge.entries.filter((entry) => entry.award === award) : [];
  const unawarded = published
    ? challenge.entries.filter((entry) => entry.award === null)
    : challenge.entries;

  return (
    <div className="site-container py-9 lg:py-14">
      <nav aria-label={t('breadcrumb.label')} className="mb-7 text-meta text-muted">
        <Link href="/community?view=challenges" className="hover:text-ink">
          {t('breadcrumb.challenges')}
        </Link>
      </nav>

      <header className="max-w-[60ch]">
        <Eyebrow>{t(`phase.${challenge.phase}`)}</Eyebrow>
        <h1 className="mt-4 text-display-fluid">{localised(challenge.title, locale)}</h1>
        <p className="mt-6 text-lead leading-relaxed whitespace-pre-line text-ink-soft">
          {localised(challenge.brief, locale)}
        </p>

        <dl className="mt-8 grid gap-x-8 gap-y-3 text-meta sm:grid-cols-2">
          <div>
            <dt className="text-eyebrow text-muted uppercase">{t('rules.opens')}</dt>
            <dd className="mt-1">{formatInstant(challenge.opensAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-eyebrow text-muted uppercase">{t('rules.closes')}</dt>
            <dd className="mt-1">{formatInstant(challenge.closesAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-eyebrow text-muted uppercase">{t('rules.allowance')}</dt>
            <dd className="mt-1">{t('rules.allowanceValue', { count: challenge.maxEntries })}</dd>
          </div>
          <div>
            <dt className="text-eyebrow text-muted uppercase">{t('rules.work')}</dt>
            <dd className="mt-1">{challenge.requiresNewWork ? t('rules.newWorkOnly') : t('rules.anyWork')}</dd>
          </div>
        </dl>
        <p className="mt-6 text-meta leading-relaxed text-muted">{t('rules.judging')}</p>
      </header>

      {open ? (
        <div className="mt-12 max-w-3xl">
          {viewer ? (
            <EntryPanel
              challengeId={challenge.id}
              maxEntries={challenge.maxEntries}
              requiresNewWork={challenge.requiresNewWork}
              candidates={candidates.map((candidate) => ({
                id: candidate.photograph.id,
                title: candidate.photograph.title,
                thumbUrl: candidate.photograph.image.thumbUrl,
                entered: candidate.entered,
                eligible: candidate.eligible,
              }))}
            />
          ) : (
            <p className="rounded-card border border-line bg-surface px-4 py-4 text-body">
              <Link
                href={`/login?next=${encodeURIComponent(`/challenges/${challenge.slug}`)}`}
                className="font-semibold underline underline-offset-2"
              >
                {t('entry.signIn')}
              </Link>
            </p>
          )}
        </div>
      ) : null}

      {published ? (
        <section aria-labelledby="challenge-results" className="mt-16">
          <h2 id="challenge-results" className="text-section font-bold">
            {t('results.title')}
          </h2>
          {AWARD_GROUPS.map((award) => {
            const entries = awarded(award);
            if (entries.length === 0) return null;
            return (
              <div key={award} className="mt-8">
                <h3 className="text-eyebrow text-muted uppercase">{t(`award.${award}`)}</h3>
                <ul className={award === 'winner' ? 'mt-4 max-w-3xl' : 'mt-4 grid gap-8 sm:grid-cols-2 lg:grid-cols-3'}>
                  {entries.map((entry) => (
                    <li key={entry.photograph.id} className="min-w-0">
                      <PhotoCard photo={entry.photograph} priority={award === 'winner'} />
                      {entry.note ? (
                        <p className="mt-3 text-body leading-relaxed text-ink-soft">“{entry.note}”</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      <section aria-labelledby="challenge-entries" className="mt-16">
        <h2 id="challenge-entries" className="text-section font-bold">
          {published ? t('entries.restTitle') : t('entries.title')}{' '}
          <span className="text-muted">· {challenge.entryCount}</span>
        </h2>
        {unawarded.length === 0 ? (
          <p className="mt-4 text-body text-muted">{t('entries.empty')}</p>
        ) : (
          <MasonryGallery photos={unawarded.map((entry) => entry.photograph)} className="mt-7" />
        )}
      </section>
    </div>
  );
}
