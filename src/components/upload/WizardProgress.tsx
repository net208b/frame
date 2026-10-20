'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { useUploadFormat } from './format';
import { STEP_COUNT, STEP_IDS, type StepId } from './use-upload-draft';

/**
 * The seven-step rail.
 *
 * BELOW `md` IT IS SEVEN DISCS AND NO NAMES. Seven step names do not fit
 * across a phone — each is wider than the seventh of the row it is given, and
 * they ran over each other's numbers. The names stay in the accessibility tree
 * at every width, and the sentence below the rail names the current step in
 * full, so nothing is lost by drawing only the numbers.
 *
 * An ordered list, because that is what it is. The current step carries
 * `aria-current="step"`, a heavier weight and a drawn rule, so the position in
 * the sequence is never signalled by colour alone. A step the member has
 * already reached is a real button; one they have not is plain text marked
 * unavailable rather than a button that silently does nothing.
 *
 * `'use client'` is explicit although only a client component renders this: the
 * step names are read from the message catalogue with `useTranslations`, which
 * a server render of this file would have no provider for.
 */
export function WizardProgress({
  current,
  furthestIndex,
  onSelect,
  locked = false,
  className,
}: {
  current: StepId;
  furthestIndex: number;
  onSelect: (step: StepId) => void;
  /** The upload has finished, so no step may be revisited. */
  locked?: boolean;
  className?: string;
}) {
  const t = useTranslations('upload');
  const format = useUploadFormat();
  const currentIndex = STEP_IDS.indexOf(current);

  return (
    <nav aria-label={t('progress.railLabel')} className={className}>
      <ol className="flex gap-x-1 md:gap-x-2">
        {STEP_IDS.map((step, index) => {
          const number = index + 1;
          const isCurrent = step === current;
          const isDone = index < currentIndex;
          const reachable = !locked && index <= furthestIndex;
          const counters = { number, total: STEP_COUNT };

          const label = (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-pill text-[10px] font-bold tabular-nums',
                  // A tick for a finished step, a filled disc for the current
                  // one, an outlined number for one not reached: the state is
                  // in the shape as well as the weight, never in colour alone.
                  isCurrent
                    ? 'bg-ink text-on-ink'
                    : isDone
                      ? 'border border-line-strong bg-surface text-ink'
                      : 'border border-line text-muted',
                )}
              >
                {isDone ? <Check className="size-3" /> : format.plain(number)}
              </span>
              {/*
                Hidden from sight below `md`, and not from a screen reader.
                Seven names cannot fit across a phone: each one is wider than
                the seventh of the row it gets, and `whitespace-nowrap` made
                them run over the next step's disc rather than wrap — which is
                what a member photographed and sent in. The sentence under this
                rail already says which step this is and what it asks for, so
                the discs alone are the whole rail at that width.
              */}
              <span className="sr-only whitespace-nowrap md:not-sr-only">
                {t(`steps.${step}.title`)}
              </span>
            </span>
          );

          const shared = cn(
            'block border-t-2 pt-2 text-meta transition-colors duration-150 md:pr-3',
            isCurrent
              ? 'border-ink font-bold text-ink'
              : isDone
                ? 'border-line-strong font-semibold text-ink-soft'
                : 'border-line text-muted',
          );

          return (
            <li key={step} className="min-w-0 flex-1">
              {reachable && !isCurrent ? (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className={cn(shared, 'w-full text-left hover:text-ink')}
                >
                  {label}
                  <span className="sr-only">{t('progress.srGoBack', counters)}</span>
                </button>
              ) : (
                <span
                  className={shared}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={reachable ? undefined : true}
                >
                  {label}
                  <span className="sr-only">
                    {isCurrent
                      ? t('progress.srCurrent', counters)
                      : locked
                        ? t('progress.srLocked', counters)
                        : t('progress.srNotReached', counters)}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
