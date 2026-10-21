'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { enterChallenge, withdrawEntry } from '@/server/actions/challenges';

/**
 * A member's side of an open challenge: their own published photographs,
 * which are entered, and a button on each.
 *
 * The allowance and the new-work rule are shown here so a member does not
 * have to find out by being refused — but the database refuses all the same,
 * and when it does its own sentence is what the toast says.
 */

export interface EntryCandidate {
  id: string;
  title: string;
  thumbUrl: string;
  entered: boolean;
  eligible: boolean;
}

export function EntryPanel({
  challengeId,
  candidates,
  maxEntries,
  requiresNewWork,
}: {
  challengeId: string;
  candidates: EntryCandidate[];
  maxEntries: number;
  requiresNewWork: boolean;
}) {
  const t = useTranslations('challenges');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const enteredCount = candidates.filter((candidate) => candidate.entered).length;
  const full = enteredCount >= maxEntries;

  function act(candidate: EntryCandidate) {
    startTransition(async () => {
      try {
        const input = { challengeId, photographId: candidate.id };
        const result = candidate.entered ? await withdrawEntry(input) : await enterChallenge(input);
        if (result.ok) {
          router.refresh();
        } else {
          toast.show(result.error, 'danger');
        }
      } catch {
        toast.show(t('entry.failed'), 'danger');
      }
    });
  }

  return (
    <section aria-labelledby="entry-panel" className="rounded-panel border border-line bg-surface p-5 lg:p-7">
      <h2 id="entry-panel" className="text-title font-bold">
        {t('entry.title')}
      </h2>
      <p role="status" className="mt-2 text-meta text-muted">
        {t('entry.allowance', { entered: enteredCount, max: maxEntries })}
        {requiresNewWork ? ` ${t('entry.newWorkNote')}` : ''}
      </p>

      {candidates.length === 0 ? (
        <p className="mt-5 text-body text-muted">{t('entry.noPhotographs')}</p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {candidates.map((candidate) => {
            const blocked = !candidate.entered && (!candidate.eligible || full);
            return (
              <li
                key={candidate.id}
                className={cn(
                  'flex items-center gap-3 rounded-card border p-2.5',
                  candidate.entered ? 'border-accent-strong' : 'border-line',
                )}
              >
                <Image
                  src={candidate.thumbUrl}
                  alt=""
                  width={56}
                  height={56}
                  sizes="56px"
                  className="size-14 shrink-0 rounded-media object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold">{candidate.title}</p>
                  {!candidate.eligible && !candidate.entered ? (
                    <p className="text-caption text-muted">{t('entry.tooOld')}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant={candidate.entered ? 'secondary' : 'primary'}
                  disabled={pending || blocked}
                  onClick={() => act(candidate)}
                >
                  {candidate.entered ? t('entry.withdraw') : t('entry.enter')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
