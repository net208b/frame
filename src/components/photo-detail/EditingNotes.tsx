import { Eyebrow } from '@/components/ui/SectionHead';
import { cn, formatDate } from '@/lib/utils';
import type { EditingDetails } from '@/types/domain';

/**
 * What happened after the shutter.
 *
 * Kept apart from the capture settings on purpose: a reader learning from this
 * page needs to be able to tell what the camera did from what was decided
 * later, and a single merged list of "details" hides exactly that difference.
 *
 * The capture date appears only when `capturedAt` is set, which the domain type
 * already defines as "EXIF held a date *and* the owner chose to publish it" —
 * so there is no consent decision left to make here.
 */
export function EditingNotes({
  editing,
  capturedAt,
  className,
}: {
  editing: EditingDetails;
  capturedAt: string | null;
  className?: string;
}) {
  const captured = capturedAt ? formatDate(capturedAt) : null;
  const hasEditing = Boolean(editing.software || editing.notes);

  // Nothing to separate from the capture settings, so the block stays away
  // rather than standing there as an empty heading.
  if (!hasEditing && !captured) return null;

  return (
    <section className={cn('min-w-0', className)}>
      <Eyebrow>After the shutter</Eyebrow>
      <h2 className="mt-2 text-title font-bold">Editing</h2>

      {!hasEditing && captured ? (
        <p className="mt-3 text-caption leading-relaxed text-muted">
          No editing was recorded for this frame.
        </p>
      ) : null}

      <dl className="mt-4 text-caption">
        {captured && capturedAt ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5 pt-0">
            <dt className="text-meta text-muted">Taken</dt>
            <dd className="font-semibold text-ink">
              <time dateTime={capturedAt}>{captured}</time>
            </dd>
          </div>
        ) : null}

        {editing.software ? (
          <div
            className={cn(
              'flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5',
              captured ? 'border-t border-line' : 'pt-0',
            )}
          >
            <dt className="text-meta text-muted">Edited in</dt>
            <dd className="font-semibold text-ink">{editing.software}</dd>
          </div>
        ) : null}
      </dl>

      {editing.notes ? (
        <div className="mt-3">
          <h3 className="text-meta text-muted">The photographer’s notes</h3>
          <p className="mt-1.5 text-caption leading-relaxed text-ink-soft">{editing.notes}</p>
        </div>
      ) : null}
    </section>
  );
}
