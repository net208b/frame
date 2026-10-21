'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { Link, useRouter } from '@/i18n/navigation';
import { publishResults, setAward } from '@/server/actions/challenges';
import { CHALLENGE_AWARDS, type ChallengeAward } from '@/types/domain';

/**
 * Judging one closed challenge: an award and a note per entry, then one
 * publish. The numbers — one winner, two runners-up, five mentions — and the
 * finality of publication are the database's; this panel only offers them.
 */

export interface JudgeEntry {
  photographId: string;
  slug: string;
  title: string;
  photographer: string;
  thumbUrl: string;
  award: ChallengeAward | null;
  note: string | null;
}

export function JudgePanel({
  challengeId,
  title,
  entries,
}: {
  challengeId: string;
  title: string;
  entries: JudgeEntry[];
}) {
  const t = useTranslations('challenges');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      entries.map((entry) => [entry.photographId, { award: entry.award ?? '', note: entry.note ?? '' }]),
    ) as Record<string, { award: string; note: string }>,
  );

  function save(photographId: string) {
    const draft = drafts[photographId];
    if (!draft) return;
    startTransition(async () => {
      const result = await setAward({
        challengeId,
        photographId,
        award: draft.award === '' ? null : draft.award,
        note: draft.note,
      });
      if (result.ok) {
        toast.show(result.message ?? t('desk.saved'), 'success');
        router.refresh();
      } else {
        toast.show(result.error, 'danger');
      }
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishResults(challengeId);
      if (result.ok) {
        toast.show(result.message ?? t('desk.published'), 'success');
        router.refresh();
      } else {
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <section className="rounded-panel border border-line bg-surface p-5 lg:p-7">
      <h3 className="text-title font-bold">{t('desk.judgeTitle', { title })}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-body text-muted">{t('entries.empty')}</p>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {entries.map((entry) => {
            const draft = drafts[entry.photographId] ?? { award: '', note: '' };
            return (
              <li key={entry.photographId} className="grid gap-3 py-4 sm:grid-cols-[4rem_minmax(0,1fr)]">
                <Image src={entry.thumbUrl} alt="" width={64} height={64} sizes="64px"
                  className="size-16 rounded-media object-cover" />
                <div className="min-w-0">
                  <Link href={`/photographs/${entry.slug}`} className="text-body font-semibold hover:text-accent-strong">
                    {entry.title}
                  </Link>
                  <p className="text-caption text-muted">{entry.photographer}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t('desk.awardLabel', { title: entry.title })}
                      value={draft.award}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [entry.photographId]: { ...draft, award: event.target.value },
                        }))
                      }
                      className="h-9 rounded-card border border-line bg-paper px-2 text-caption"
                    >
                      <option value="">{t('desk.noAward')}</option>
                      {CHALLENGE_AWARDS.map((award) => (
                        <option key={award} value={award}>
                          {t(`award.${award}`)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={t('desk.noteLabel', { title: entry.title })}
                      placeholder={t('desk.notePlaceholder')}
                      value={draft.note}
                      maxLength={500}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [entry.photographId]: { ...draft, note: event.target.value },
                        }))
                      }
                      className="h-9 min-w-0 flex-1 rounded-card border border-line bg-paper px-2 text-caption"
                    />
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => save(entry.photographId)}>
                      {t('desk.save')}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 border-t border-line pt-5">
        <p className="text-meta text-muted">{t('desk.publishNote')}</p>
        <Button className="mt-3" loading={pending} onClick={publish}>
          {t('desk.publish')}
        </Button>
      </div>
    </section>
  );
}
