import { cn } from '@/lib/utils';

/**
 * What members have worked out about photographing a place.
 *
 * The provenance line is not decoration. These notes are opinions from people
 * who have stood there, checked by a moderator before they appear — they are
 * not a statement from whoever runs the place, and a reader deciding whether
 * to carry a tripod across a city needs to know which of the two they are
 * reading.
 */
export function ShootingNotes({
  notes,
  className,
}: {
  notes: readonly string[];
  className?: string;
}) {
  return (
    <section aria-labelledby="shooting-notes" className={cn('min-w-0', className)}>
      <h2 id="shooting-notes" className="text-title font-bold tracking-[-0.045em]">
        Shooting notes
      </h2>

      <p className="mt-2 max-w-[52ch] text-caption leading-relaxed text-muted">
        Written by members who have photographed here and reviewed by a moderator before
        publication. They are not official guidance from whoever manages the place.
      </p>

      {notes.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-line px-5 py-6 text-caption leading-relaxed text-muted">
          Nobody has contributed shooting notes for this place yet.
        </p>
      ) : (
        <ol className="mt-6 space-y-5">
          {notes.map((note, index) => (
            <li key={index} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 w-5 shrink-0 text-meta font-bold text-muted-soft tabular-nums"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="max-w-[58ch] text-body leading-relaxed text-ink-soft">{note}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
