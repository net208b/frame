'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { useUploadFormat } from './format';
import { STEP_COUNT, STEP_IDS, type StepId } from './use-upload-draft';

/**
 * The seven-step rail.
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
      <ol className="flex flex-wrap gap-x-1 gap-y-2 md:flex-nowrap md:gap-x-2">
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
              <span className="whitespace-nowrap">{t(`steps.${step}.title`)}</span>
            </span>
          );

          const shared = cn(
            'block border-t-2 pt-2 pr-3 text-meta transition-colors duration-150',
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
