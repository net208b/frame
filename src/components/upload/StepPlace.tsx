'use client';

import { Info, MapPin, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { evaluateLocationSubmission, isValidLatitude, isValidLongitude, precisionLabel } from '@/lib/geo';
import { describeExifGpsPolicy } from '@/lib/images/exif';
import { cn } from '@/lib/utils';
import { searchApprovedLocations } from '@/server/actions/locations';
import type { LocationSummary, SubmissionSignal } from '@/types/domain';

import type { PlaceMode, UploadDraft } from './use-upload-draft';

/**
 * Step 3 — the place.
 *
 * Three honest answers, and the member picks one: no place at all, one of the
 * places a moderator has already approved, or a proposal for somewhere new.
 *
 * What this step will not do is decide that a place exists. The checks below
 * run as the member types and are described as checks, because that is all they
 * are: a coordinate inside a country's bounding box is not evidence of
 * anything, and approval stays a human decision. The position the camera
 * recorded is offered once, as a question, and copied in only if the member
 * says so.
 */

const MODE_OPTIONS: Array<{ value: PlaceMode; label: string; description: string }> = [
  {
    value: 'none',
    label: 'No place for now',
    description:
      'Publish without a location. You can tell us where it was made later without re-uploading.',
  },
  {
    value: 'existing',
    label: 'An approved FRAME location',
    description: 'Search the places already on the map and pick the one this frame was made at.',
  },
  {
    value: 'propose',
    label: 'Propose a new place',
    description:
      'Somewhere FRAME does not have yet. A moderator reads every proposal before it appears.',
  },
];

const SIGNAL_SEVERITY: Record<SubmissionSignal['severity'], { label: string; tone: string }> = {
  info: { label: 'For information', tone: 'text-info' },
  warn: { label: 'Worth a second look', tone: 'text-warning' },
  high: { label: 'Needs attention', tone: 'text-danger' },
};

function SignalList({ signals }: { signals: SubmissionSignal[] }) {
  if (signals.length === 0) {
    return (
      <p className="text-meta leading-relaxed text-muted">
        The coordinate checks found nothing to flag. That is not the same as FRAME knowing this
        place exists — a moderator still reads the proposal.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {signals.map((signal, index) => {
        const severity = SIGNAL_SEVERITY[signal.severity];
        return (
          <li key={`${signal.kind}-${index}`} className="flex gap-2.5">
            {signal.severity === 'info' ? (
              <Info className={cn('mt-0.5 size-3.5 shrink-0', severity.tone)} aria-hidden />
            ) : (
              <TriangleAlert
                className={cn('mt-0.5 size-3.5 shrink-0', severity.tone)}
                aria-hidden
              />
            )}
            <p className="text-meta leading-relaxed text-ink-soft">
              <span className={cn('font-bold', severity.tone)}>{severity.label}.</span>{' '}
              {signal.message}
              {signal.relatedLabel ? ` (${signal.relatedLabel})` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function LocationPicker({
  selected,
  onSelect,
  error,
}: {
  selected: LocationSummary | null;
  onSelect: (location: LocationSummary | null) => void;
  error?: string;
}) {
  const groupId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // The search is debounced from the change handler rather than from an effect.
  // Typing is the event that should start a search, so driving it from an
  // effect means re-deriving that event from a state change — and the effect
  // then has to set state synchronously on every keystroke, which cascades
  // renders. `generation` makes a late response from an earlier keystroke
  // discard itself instead of overwriting a newer result.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Stops an in-flight response from calling setState after unmount.
      generation.current += 1;
    },
    [],
  );

  function handleQueryChange(next: string) {
    setQuery(next);

    if (timer.current) clearTimeout(timer.current);
    generation.current += 1;
    const attempt = generation.current;

    const trimmed = next.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(() => {
      void searchApprovedLocations(trimmed).then((result) => {
        if (generation.current !== attempt) return;
        setSearching(false);
        if (result.ok) {
          setResults(result.data);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(result.error);
        }
      });
    }, 300);
  }

  return (
    <div>
      <TextField
        label="Search approved places"
        type="search"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        error={error}
        hint="Search by place, city or country. Two characters is enough to start."
        placeholder="Shinjuku, Copenhagen, Bangkok…"
        autoComplete="off"
      />

      <p aria-live="polite" className="mt-3 text-meta text-muted">
        {searching
          ? 'Searching…'
          : query.trim().length < 2
            ? ''
            : searchError
              ? ''
              : results.length === 0
                ? 'No approved place matches that. If FRAME does not have it yet, propose it instead.'
                : `${results.length} ${results.length === 1 ? 'place' : 'places'} found.`}
      </p>

      {searchError ? (
        <Notice tone="warning" className="mt-3">
          {searchError}
        </Notice>
      ) : null}

      {results.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="sr-only">Choose the place this frame was made at</legend>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {results.map((location) => {
              const id = `${groupId}-${location.id}`;
              return (
                <li key={location.id}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <input
                      id={id}
                      type="radio"
                      name={groupId}
                      className="mt-1 size-4 shrink-0 accent-ink"
                      checked={selected?.id === location.id}
                      onChange={() => onSelect(location)}
                    />
                    <label htmlFor={id} className="min-w-0 cursor-pointer">
                      <span className="block text-body font-semibold">{location.name}</span>
                      <span className="block text-meta text-muted">
                        {location.city}, {location.country} ·{' '}
                        {location.photographCount === 1
                          ? '1 photograph'
                          : `${location.photographCount} photographs`}
                      </span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}

      {selected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
          <MapPin className="size-4 shrink-0 text-accent-strong" aria-hidden />
          <p className="min-w-0 flex-1 text-caption">
            <span className="font-semibold">{selected.name}</span>
            <span className="text-muted">
              {' '}
              — {selected.city}, {selected.country}
            </span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Clear this choice
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ProposalForm({ draft }: { draft: UploadDraft }) {
  const { state, errors } = draft;
  const { proposal } = state;

  const latitude = Number(proposal.latitude);
  const longitude = Number(proposal.longitude);
  const hasPoint =
    proposal.latitude.trim().length > 0 &&
    proposal.longitude.trim().length > 0 &&
    isValidLatitude(latitude) &&
    isValidLongitude(longitude);

  // Run against the coordinate rules only. The duplicate check needs every
  // approved place on the map, which is a server read, so it runs when the
  // proposal is sent and the result is shown to the moderator.
  const signals = hasPoint
    ? evaluateLocationSubmission({
        latitude,
        longitude,
        countryCode: proposal.countryCode.trim().toUpperCase(),
      })
    : [];

  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        <TextField
          label="Place name"
          required
          value={proposal.proposedName}
          maxLength={120}
          onChange={(event) => draft.updateProposal({ proposedName: event.target.value })}
          error={errors.proposedName}
          hint="What a photographer would call it, not a postal address."
          placeholder="Omoide Yokocho"
          autoComplete="off"
        />
        <TextField
          label="City"
          required
          value={proposal.city}
          maxLength={80}
          onChange={(event) => draft.updateProposal({ city: event.target.value })}
          error={errors.city}
          placeholder="Tokyo"
          autoComplete="off"
        />
        <TextField
          label="Country"
          required
          value={proposal.country}
          maxLength={80}
          onChange={(event) => draft.updateProposal({ country: event.target.value })}
          error={errors.country}
          placeholder="Japan"
          autoComplete="off"
        />
        <TextField
          label="Country code"
          required
          value={proposal.countryCode}
          maxLength={2}
          onChange={(event) =>
            draft.updateProposal({ countryCode: event.target.value.toUpperCase() })
          }
          error={errors.countryCode}
          hint="Two letters, ISO 3166-1 — JP, DK, TH."
          placeholder="JP"
          autoComplete="off"
          className="uppercase"
        />
        <TextField
          label="Latitude"
          required
          inputMode="decimal"
          value={proposal.latitude}
          onChange={(event) => draft.updateProposal({ latitude: event.target.value })}
          error={errors.latitude}
          placeholder="35.693990"
          autoComplete="off"
        />
        <TextField
          label="Longitude"
          required
          inputMode="decimal"
          value={proposal.longitude}
          onChange={(event) => draft.updateProposal({ longitude: event.target.value })}
          error={errors.longitude}
          placeholder="139.700377"
          autoComplete="off"
        />
      </div>

      <TextAreaField
        label="Note for the moderator"
        wrapperClassName="mt-6"
        rows={3}
        maxLength={600}
        value={proposal.note}
        onChange={(event) => draft.updateProposal({ note: event.target.value })}
        error={errors.note}
        hint="Optional. Access, opening hours, whether photography is restricted — anything a moderator should know before this goes on a public map."
      />

      <section aria-labelledby="proposal-checks" className="mt-7 rounded-card border border-line bg-surface p-4">
        <h4 id="proposal-checks" className="text-eyebrow text-muted uppercase">
          Automatic checks
        </h4>
        <div className="mt-3" aria-live="polite">
          {hasPoint ? (
            <SignalList signals={signals} />
          ) : (
            <p className="text-meta leading-relaxed text-muted">
              Enter a latitude, a longitude and a country code and the coordinate checks run here
              as you type.
            </p>
          )}
        </div>
      </section>

      <Notice tone="info" title="What happens to a proposed place" className="mt-5">
        <p>
          Your proposal is queued for a moderator and does not appear on the map until one approves
          it. Your photograph does not wait for that: it publishes now, with the place marked
          pending, and is credited to the location once it is approved.
        </p>
        <p className="mt-2">
          A published point is rounded to {precisionLabel(LOCATION_POLICY.publicCoordinateDecimals)}{' '}
          rather than shown exactly, and further still for anywhere a moderator marks as sensitive.
          Two proposals within {LOCATION_POLICY.duplicateRadiusMetres} m of each other are flagged
          as possible duplicates for a person to compare.
        </p>
      </Notice>
    </div>
  );
}

function ExifGpsQuestion({ draft }: { draft: UploadDraft }) {
  const gps = draft.state.exif?.gps ?? null;
  if (!gps) return null;

  if (draft.state.gpsChoice !== 'unanswered') {
    return (
      <Notice
        tone={draft.state.gpsChoice === 'used' ? 'info' : 'success'}
        title={
          draft.state.gpsChoice === 'used'
            ? 'Using the position from the file'
            : 'The position in the file stays out of this'
        }
        className="mt-6"
      >
        <p>
          {draft.state.gpsChoice === 'used'
            ? 'The coordinates below were copied from the file because you chose to use them. Edit them freely — they are a starting point, not a fact.'
            : 'Nothing from the file’s position has been copied anywhere, and none of it will be stored.'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => draft.answerGps('unanswered')}
        >
          Change this answer
        </Button>
      </Notice>
    );
  }

  return (
    <section
      aria-labelledby="exif-gps-question"
      className="mt-6 rounded-panel border border-line bg-surface p-5"
    >
      <h3 id="exif-gps-question" className="text-title font-semibold tracking-tight">
        This file records where it was taken
      </h3>
      <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
        {describeExifGpsPolicy()}
      </p>
      <p className="mt-3 text-caption font-semibold">
        The file says {gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => draft.answerGps('used')}>
          Use it to start a proposal
        </Button>
        <Button variant="ghost" onClick={() => draft.answerGps('declined')}>
          Leave the position out
        </Button>
      </div>
    </section>
  );
}

export function StepPlace({ draft }: { draft: UploadDraft }) {
  const modeGroupId = useId();
  const { state, errors } = draft;

  return (
    <div>
      <h2 className="text-section font-bold">Where was it made?</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        A place is what turns a photograph into something another photographer can go and see for
        themselves. It is also somewhere real, so FRAME publishes a rounded point and only after a
        person has looked at it.
      </p>

      <ExifGpsQuestion draft={draft} />

      <fieldset className="mt-7">
        <legend className="text-meta font-bold text-ink">How would you like to answer?</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const id = `${modeGroupId}-${option.value}`;
            const active = state.placeMode === option.value;
            return (
              <div
                key={option.value}
                className={cn(
                  'flex gap-3 rounded-card border bg-surface p-4 transition-colors duration-150',
                  active ? 'border-ink' : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name={modeGroupId}
                  className="mt-0.5 size-4 shrink-0 accent-ink"
                  checked={active}
                  onChange={() => draft.update({ placeMode: option.value })}
                />
                <label htmlFor={id} className="min-w-0 cursor-pointer">
                  <span className={cn('block text-caption', active ? 'font-bold' : 'font-semibold')}>
                    {option.label}
                  </span>
                  <span className="mt-1 block text-meta leading-relaxed text-muted">
                    {option.description}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      {state.placeMode === 'existing' ? (
        <div className="mt-7">
          <LocationPicker
            selected={state.location}
            onSelect={(location) => draft.update({ location })}
            error={errors.location}
          />
        </div>
      ) : null}

      {state.placeMode === 'propose' ? (
        <div className="mt-7">
          <ProposalForm draft={draft} />
        </div>
      ) : null}

      {state.placeMode === 'none' ? (
        <p className="mt-7 max-w-prose rounded-card border border-line bg-surface px-4 py-3 text-caption leading-relaxed text-muted">
          <Search className="mr-2 inline size-3.5 align-[-2px]" aria-hidden />
          Publishing without a place is a perfectly good answer. Street photographs of somebody’s
          street are often better off without a pin on them.
        </p>
      ) : null}
    </div>
  );
}
