'use client';

import { Info, MapPin, Search, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import type { CoordinatePickerView } from '@/components/map/CoordinatePicker';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { evaluateLocationSubmission, isValidLatitude, isValidLongitude } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { searchApprovedLocations } from '@/server/actions/locations';
import type { LocationSummary, SubmissionSignal } from '@/types/domain';

import { useUploadFormat } from './format';
import { PlaceFromPoint } from './PlaceFromPoint';
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
 *
 * The question about that position is the same four statements in both
 * languages — coordinates are in the file, FRAME will not publish them unless
 * the member chooses, a published point is rounded by policy, and camera
 * metadata is not evidence of authorship. It is the only reason this step can
 * ask for a location at all, so none of it is shortened in translation.
 */

const MODE_OPTIONS: Array<{ value: PlaceMode; labelKey: string; descriptionKey: string }> = [
  {
    value: 'none',
    labelKey: 'place.modeNoneLabel',
    descriptionKey: 'place.modeNoneDescription',
  },
  {
    value: 'existing',
    labelKey: 'place.modeExistingLabel',
    descriptionKey: 'place.modeExistingDescription',
  },
  {
    value: 'propose',
    labelKey: 'place.modeProposeLabel',
    descriptionKey: 'place.modeProposeDescription',
  },
];

const SEVERITY_TONE: Record<SubmissionSignal['severity'], string> = {
  info: 'text-info',
  warn: 'text-warning',
  high: 'text-danger',
};

const SEVERITY_KEY: Record<SubmissionSignal['severity'], string> = {
  info: 'place.severityInfo',
  warn: 'place.severityWarn',
  high: 'place.severityHigh',
};

function SignalList({
  signals,
  countryCode,
}: {
  signals: SubmissionSignal[];
  /**
   * The code the member typed. The signal itself does not carry it — only the
   * English sentence `lib/geo.ts` built does — so the one piece of data the
   * country checks talk about is passed back in rather than parsed out.
   */
  countryCode: string;
}) {
  const t = useTranslations('upload');

  if (signals.length === 0) {
    return <p className="text-meta leading-relaxed text-muted">{t('place.checksNone')}</p>;
  }

  /**
   * The signal's own `message` is written in English in `lib/geo.ts`, which
   * runs on the server as well as here and has no locale to write it in. Each
   * kind the coordinate checks can actually produce therefore has its own
   * message in this namespace, keyed off `kind` and, where the same kind means
   * two different things, off `severity` as well. The fallback is the English
   * sentence: the two remaining kinds in the union are produced by the
   * moderation queue, never by `evaluateLocationSubmission`, and an invented
   * Thai paraphrase of a check this step cannot run would be worse than a
   * sentence that never renders.
   */
  const describe = (signal: SubmissionSignal): string => {
    switch (signal.kind) {
      case 'coordinate-out-of-range':
        return t('place.signalOutOfRange');
      case 'low-precision':
        return t('place.signalLowPrecision');
      case 'coordinate-country-mismatch':
        return signal.severity === 'info'
          ? t('place.signalCountryUnknown', { countryCode })
          : t('place.signalCountryMismatch', { countryCode });
      case 'possible-duplicate':
        return t('place.signalPossibleDuplicate', {
          metres: signal.distanceMetres ?? LOCATION_POLICY.duplicateRadiusMetres,
        });
      default:
        return signal.message;
    }
  };

  return (
    <ul className="space-y-2.5">
      {signals.map((signal, index) => {
        const tone = SEVERITY_TONE[signal.severity];
        return (
          <li key={`${signal.kind}-${index}`} className="flex gap-2.5">
            {signal.severity === 'info' ? (
              <Info className={cn('mt-0.5 size-3.5 shrink-0', tone)} aria-hidden />
            ) : (
              <TriangleAlert className={cn('mt-0.5 size-3.5 shrink-0', tone)} aria-hidden />
            )}
            <p className="text-meta leading-relaxed text-ink-soft">
              <span className={cn('font-bold', tone)}>{t(SEVERITY_KEY[signal.severity])}.</span>{' '}
              {describe(signal)}
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
  const t = useTranslations('upload');
  const common = useTranslations('common');
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
        label={t('place.searchLabel')}
        type="search"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        error={error}
        hint={t('place.searchHint')}
        // Latin script in both languages on purpose: the approved places are
        // indexed under the names a moderator entered, so a Thai example in
        // Thai script would suggest a search that cannot match.
        placeholder={t('place.searchPlaceholder')}
        autoComplete="off"
      />

      <p aria-live="polite" className="mt-3 text-meta text-muted">
        {searching
          ? t('place.searching')
          : query.trim().length < 2
            ? ''
            : searchError
              ? ''
              : results.length === 0
                ? t('place.searchNoResults')
                : t('place.searchResultCount', { count: results.length })}
      </p>

      {searchError ? (
        <Notice tone="warning" className="mt-3">
          {searchError}
        </Notice>
      ) : null}

      {results.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="sr-only">{t('place.searchLegend')}</legend>
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
                        {common('photographCount', { count: location.photographCount })}
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
            {t('place.searchClear')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ProposalForm({
  draft,
  defaultMapView,
}: {
  draft: UploadDraft;
  defaultMapView?: CoordinatePickerView | null;
}) {
  const t = useTranslations('upload');
  const format = useUploadFormat();
  const { state, errors } = draft;
  const { proposal } = state;

  const latitude = Number(proposal.latitude);
  const longitude = Number(proposal.longitude);
  const hasPoint =
    proposal.latitude.trim().length > 0 &&
    proposal.longitude.trim().length > 0 &&
    isValidLatitude(latitude) &&
    isValidLongitude(longitude);

  const countryCode = proposal.countryCode.trim().toUpperCase();

  // Run against the coordinate rules only. The duplicate check needs every
  // approved place on the map, which is a server read, so it runs when the
  // proposal is sent and the result is shown to the moderator.
  const signals = hasPoint
    ? evaluateLocationSubmission({ latitude, longitude, countryCode })
    : [];

  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        <TextField
          label={t('place.nameLabel')}
          required
          value={proposal.proposedName}
          maxLength={120}
          onChange={(event) => draft.updateProposal({ proposedName: event.target.value })}
          error={errors.proposedName}
          hint={t('place.nameHint')}
          placeholder={t('place.namePlaceholder')}
          autoComplete="off"
        />
        <TextField
          label={t('place.cityLabel')}
          required
          value={proposal.city}
          maxLength={80}
          onChange={(event) => draft.updateProposal({ city: event.target.value })}
          error={errors.city}
          placeholder={t('place.cityPlaceholder')}
          autoComplete="off"
        />
        <TextField
          label={t('place.countryLabel')}
          required
          value={proposal.country}
          maxLength={80}
          onChange={(event) => draft.updateProposal({ country: event.target.value })}
          error={errors.country}
          placeholder={t('place.countryPlaceholder')}
          autoComplete="off"
        />
        <TextField
          label={t('place.countryCodeLabel')}
          required
          value={proposal.countryCode}
          maxLength={2}
          onChange={(event) =>
            draft.updateProposal({ countryCode: event.target.value.toUpperCase() })
          }
          error={errors.countryCode}
          hint={t('place.countryCodeHint')}
          placeholder={t('place.countryCodePlaceholder')}
          autoComplete="off"
          className="uppercase"
        />
      </div>

      <PlaceFromPoint draft={draft} defaultMapView={defaultMapView} />

      <TextAreaField
        label={t('place.noteLabel')}
        wrapperClassName="mt-6"
        rows={3}
        maxLength={600}
        value={proposal.note}
        onChange={(event) => draft.updateProposal({ note: event.target.value })}
        error={errors.note}
        hint={t('place.noteHint')}
      />

      <section
        aria-labelledby="proposal-checks"
        className="mt-7 rounded-card border border-line bg-surface p-4"
      >
        <h4 id="proposal-checks" className="text-eyebrow text-muted uppercase">
          {t('place.checksHeading')}
        </h4>
        <div className="mt-3" aria-live="polite">
          {hasPoint ? (
            <SignalList signals={signals} countryCode={countryCode} />
          ) : (
            <p className="text-meta leading-relaxed text-muted">{t('place.checksIdle')}</p>
          )}
        </div>
      </section>

      <Notice tone="info" title={t('place.proposalNoticeTitle')} className="mt-5">
        <p>{t('place.proposalNoticeBody')}</p>
        <p className="mt-2">
          {t('place.proposalNoticePrecision', {
            precision: format.precision(LOCATION_POLICY.publicCoordinateDecimals),
            radius: LOCATION_POLICY.duplicateRadiusMetres,
          })}
        </p>
      </Notice>
    </div>
  );
}

function ExifGpsQuestion({ draft }: { draft: UploadDraft }) {
  const t = useTranslations('upload');
  const format = useUploadFormat();
  const gps = draft.state.exif?.gps ?? null;
  if (!gps) return null;

  const used = draft.state.gpsChoice === 'used';

  if (draft.state.gpsChoice !== 'unanswered') {
    return (
      <Notice
        tone={used ? 'info' : 'success'}
        title={used ? t('exifGps.usedTitle') : t('exifGps.declinedTitle')}
        className="mt-6"
      >
        <p>{used ? t('exifGps.usedBody') : t('exifGps.declinedBody')}</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => draft.answerGps('unanswered')}
        >
          {t('exifGps.change')}
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
        {t('exifGps.title')}
      </h3>
      <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
        {t('exifGps.policy')}
      </p>
      <p className="mt-3 text-caption font-semibold">
        {t('exifGps.coordinates', {
          latitude: format.coordinate(gps.latitude, 5),
          longitude: format.coordinate(gps.longitude, 5),
        })}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => draft.answerGps('used')}>
          {t('exifGps.use')}
        </Button>
        <Button variant="ghost" onClick={() => draft.answerGps('declined')}>
          {t('exifGps.decline')}
        </Button>
      </div>
    </section>
  );
}

export function StepPlace({
  draft,
  defaultMapView,
}: {
  draft: UploadDraft;
  defaultMapView?: CoordinatePickerView | null;
}) {
  const t = useTranslations('upload');
  const modeGroupId = useId();
  const { state, errors } = draft;

  return (
    <div>
      <h2 className="text-section font-bold">{t('place.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">{t('place.lead')}</p>

      <ExifGpsQuestion draft={draft} />

      <fieldset className="mt-7">
        <legend className="text-meta font-bold text-ink">{t('place.modeLegend')}</legend>
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
                  <span
                    className={cn('block text-caption', active ? 'font-bold' : 'font-semibold')}
                  >
                    {t(option.labelKey)}
                  </span>
                  <span className="mt-1 block text-meta leading-relaxed text-muted">
                    {t(option.descriptionKey)}
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
          <ProposalForm draft={draft} defaultMapView={defaultMapView} />
        </div>
      ) : null}

      {state.placeMode === 'none' ? (
        <p className="mt-7 max-w-prose rounded-card border border-line bg-surface px-4 py-3 text-caption leading-relaxed text-muted">
          <Search className="mr-2 inline size-3.5 align-[-2px]" aria-hidden />
          {t('place.noneChosen')}
        </p>
      ) : null}
    </div>
  );
}
