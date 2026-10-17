import { MoveHorizontal } from 'lucide-react';
import Link from 'next/link';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { formatCount } from '@/lib/utils';
import type { LocationSummary } from '@/types/domain';

/**
 * Approved places close enough together to be worth a second look.
 *
 * FRAME cannot merge two places: there is no merge function and no table that
 * holds a merge request, so the control here records a flag for a person to
 * pick up and says exactly that. Labelling it "Merge" would be a button that
 * looks real and does something smaller than it claims, which is the one thing
 * this product is not allowed to ship.
 */

export interface DuplicatePair {
  a: LocationSummary;
  b: LocationSummary;
  distanceMetres: number;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m apart`;
  return `${(metres / 1000).toFixed(1)} km apart`;
}

function optionsFor(pair: DuplicatePair): readonly DecisionOption[] {
  return [
    {
      value: 'dismiss',
      label: 'Keep both',
      effect:
        'Records that this pair was looked at and both places are real. Nothing about either place changes.',
      reasonRequired: false,
      reasonAudience: 'internal',
    },
    {
      value: 'request_changes',
      label: 'Flag for merging',
      effect: `Writes a note to the audit trail against “${pair.b.name}”, naming “${pair.a.name}”. Nothing is merged — FRAME has no merge, so say in the reason which entry should survive and a person will do it.`,
      reasonRequired: true,
      reasonAudience: 'internal',
    },
  ];
}

export function DuplicateLocationQueue({ pairs }: { pairs: readonly DuplicatePair[] }) {
  return (
    <section aria-labelledby="queue-duplicates">
      <SectionHead
        eyebrow="Queue"
        title={<span id="queue-duplicates">Possible duplicates</span>}
        description={`Approved places within ${LOCATION_POLICY.duplicateRadiusMetres} metres of each other, closest first.`}
      />

      <QueueCapNote shown={pairs.length} />

      {pairs.length === 0 ? (
        <EmptyState
          title="No places are overlapping"
          description={`No two approved places sit within ${LOCATION_POLICY.duplicateRadiusMetres} metres of each other. A park and the café across its path can legitimately be metres apart, so this scan only ever produces candidates.`}
        />
      ) : (
        <ul className="border-t border-line">
          {pairs.map((pair) => (
            <DuplicateRow key={`${pair.a.id}-${pair.b.id}`} pair={pair} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DuplicateRow({ pair }: { pair: DuplicatePair }) {
  return (
    <li className="border-b border-line py-7 last:border-b-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="min-w-0">
          <h3 className="text-caption font-bold text-muted">
            <span className="text-ink">{pair.a.name}</span>
            <span className="mx-2 font-medium">and</span>
            <span className="text-ink">{pair.b.name}</span>
          </h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <PlaceCard place={pair.a} />

            <p className="flex items-center gap-1.5 text-meta font-semibold text-muted sm:flex-col sm:gap-1 sm:px-1">
              <MoveHorizontal className="size-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{formatDistance(pair.distanceMetres)}</span>
            </p>

            <PlaceCard place={pair.b} />
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'duplicate', locationId: pair.b.id }}
            subjectLabel={`“${pair.b.name}”, against “${pair.a.name}”`}
            options={optionsFor(pair)}
            reasonHint="Say which entry should survive and why. This is read by whoever does the merge, and it is kept in the audit trail."
          />
        </div>
      </div>
    </li>
  );
}

function PlaceCard({ place }: { place: LocationSummary }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3.5">
      <Link
        href={`/locations/${place.slug}`}
        className="text-caption font-bold text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink"
      >
        {place.name}
      </Link>
      <p className="mt-1 text-meta text-muted">
        {[place.city, place.country].filter(Boolean).join(', ')}
        {place.countryCode ? ` (${place.countryCode})` : ''}
      </p>
      <p className="mt-1 text-meta text-muted-soft">
        {formatCount(place.photographCount)}{' '}
        {place.photographCount === 1 ? 'photograph' : 'photographs'}
      </p>
    </div>
  );
}
