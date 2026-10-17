import { cn, formatDate } from '@/lib/utils';
import type { LocationRestriction } from '@/types/domain';

/**
 * Access and photography restrictions, each with the source behind it.
 *
 * A restriction is a claim about what somebody is allowed to do, so it is only
 * ever shown with where the claim came from and when it was recorded. The type
 * makes `source` required for exactly that reason: an unsourced restriction is
 * a rumour the platform would be putting its name to, so it is not stored and
 * cannot be rendered.
 */

const KIND_LABELS: Record<LocationRestriction['kind'], string> = {
  permit: 'Permit required',
  'private-property': 'Private property',
  'no-tripod': 'No tripods',
  hours: 'Access hours',
  fee: 'Entry fee',
  other: 'Other restriction',
};

export function RestrictionList({
  restrictions,
  className,
}: {
  restrictions: readonly LocationRestriction[];
  className?: string;
}) {
  return (
    <section aria-labelledby="restrictions" className={cn('min-w-0', className)}>
      <h2 id="restrictions" className="text-title font-bold tracking-[-0.045em]">
        Access and restrictions
      </h2>

      {restrictions.length === 0 ? (
        <>
          <p className="mt-2 max-w-[52ch] text-caption leading-relaxed text-muted">
            A restriction is only listed once a moderator has recorded where the claim comes from.
          </p>
          <p className="mt-6 rounded-card border border-dashed border-line px-5 py-6 text-body leading-relaxed text-ink-soft">
            No restrictions have been verified for this place.{' '}
            <span className="text-muted">
              That is not the same as permission: it means nothing has been checked, not that
              everything is allowed. Look for signage when you arrive, and ask if you are unsure.
            </span>
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-[52ch] text-caption leading-relaxed text-muted">
            Each note carries its source and the date it was recorded. Conditions change, so treat
            an older note as a starting point rather than as the current rule.
          </p>

          <ul className="mt-6 space-y-3">
            {restrictions.map((restriction, index) => {
              const recorded = formatDate(restriction.recordedAt);

              return (
                <li key={index} className="rounded-card border border-line bg-surface p-5">
                  <h3 className="text-eyebrow text-ink uppercase">
                    {KIND_LABELS[restriction.kind]}
                  </h3>
                  <p className="mt-2.5 text-body leading-relaxed text-ink-soft">
                    {restriction.note}
                  </p>
                  <p className="mt-3 border-t border-line pt-3 text-meta leading-relaxed text-muted">
                    <span className="font-semibold text-ink-soft">Source: </span>
                    {restriction.source}
                  </p>
                  <p className="mt-1 text-meta text-muted-soft">
                    {recorded ? `Recorded ${recorded}` : 'The date this was recorded is not on file'}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
