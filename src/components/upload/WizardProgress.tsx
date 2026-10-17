import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

import { STEP_IDS, STEP_META, type StepId } from './use-upload-draft';

/**
 * The seven-step rail.
 *
 * An ordered list, because that is what it is. The current step carries
 * `aria-current="step"`, a heavier weight and a drawn rule, so the position in
 * the sequence is never signalled by colour alone. A step the member has
 * already reached is a real button; one they have not is plain text marked
 * unavailable rather than a button that silently does nothing.
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
  const currentIndex = STEP_IDS.indexOf(current);

  return (
    <nav aria-label="Upload steps" className={className}>
      <ol className="flex flex-wrap gap-x-1 gap-y-2 md:flex-nowrap md:gap-x-2">
        {STEP_IDS.map((step, index) => {
          const meta = STEP_META[step];
          const isCurrent = step === current;
          const isDone = index < currentIndex;
          const reachable = !locked && index <= furthestIndex;

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
                {isDone ? <Check className="size-3" /> : meta.number}
              </span>
              <span className="whitespace-nowrap">{meta.title}</span>
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
                  <span className="sr-only">
                    {` — step ${meta.number} of ${STEP_IDS.length}, go back to it`}
                  </span>
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
                      ? ` — current step, ${meta.number} of ${STEP_IDS.length}`
                      : locked
                        ? ` — step ${meta.number} of ${STEP_IDS.length}, finished and no longer editable`
                        : ` — step ${meta.number} of ${STEP_IDS.length}, not reached yet`}
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
