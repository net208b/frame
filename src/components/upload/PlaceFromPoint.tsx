'use client';

import { Loader2, MapPinned, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { CoordinatePicker, type CoordinatePickerView } from '@/components/map/CoordinatePicker';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { LOCATION_POLICY } from '@/lib/config';
import { cn } from '@/lib/utils';

import type { UploadDraft } from './use-upload-draft';

/**
 * Where the frame was made: the search, the map, and the two coordinate fields,
 * which are three ways of answering one question.
 *
 * It exists as its own component because that question is now the only
 * complicated thing on the place step. A member can answer it three ways and all
 * three have to agree afterwards:
 *
 *  - **Search a name.** "Wat Arun", Enter, pick one — the pin moves there and the
 *    city, country and code come with it.
 *  - **Drop a pin.** The city, country and code fill themselves in from the
 *    point.
 *  - **Type the coordinate.** For a position read off a GPS or a camera, and for
 *    a browser that cannot run WebGL. The pin follows, and so does the rest.
 *
 * WHAT IT WILL NOT OVERWRITE. A lookup fills a field only when that field is
 * empty, or when it still holds exactly what the previous lookup put there. So
 * moving the pin corrects a city the map guessed, and never touches a city the
 * member typed. This is the whole reason `filledByLookupRef` exists, and the
 * reason it is a ref rather than state: it is not rendered, and the effect reads
 * it on a timer long after the render that set it.
 *
 * THE PLACE NAME IS NEVER FILLED IN. The form asks for "what a photographer
 * would call it, not a postal address", and a geocoder only has the postal
 * address. Picking a search result offers its name as a starting point — in the
 * search box, not in the field — and the member writes their own.
 */

/** Long enough that dragging a pin across a city is one lookup, not thirty. */
const LOOKUP_DEBOUNCE_MS = 700;

/**
 * The pause after typing before a name is looked up.
 *
 * Deliberately longer than the 300 ms the approved-place search uses, because
 * that one asks FRAME's own database and this one asks a free community
 * service. At 500 ms a member typing a place name at speed spends one request
 * on the word, not one per letter — which is the difference between
 * autocomplete and abuse.
 */
const SEARCH_DEBOUNCE_MS = 500;

/**
 * Three, not two, before a name search fires on its own.
 *
 * Two letters match half of everywhere and the answer is never the one that is
 * wanted, so the first useful suggestion is also the first request worth
 * making. Pressing the button still searches from two.
 */
const SEARCH_MIN_LIVE = 3;

interface LookupGuess {
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

interface LookupMatch extends LookupGuess {
  name: string;
  latitude: number;
  longitude: number;
}

/** The three fields a lookup may fill. The name is deliberately not among them. */
type FilledFields = { city: string; country: string; countryCode: string };

const NOTHING_FILLED: FilledFields = { city: '', country: '', countryCode: '' };

export function PlaceFromPoint({
  draft,
  defaultMapView,
}: {
  draft: UploadDraft;
  defaultMapView?: CoordinatePickerView | null;
}) {
  const t = useTranslations('upload');
  const locale = useLocale();
  const { proposal } = draft.state;

  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<LookupMatch[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGeneration = useRef(0);
  const [searching, setSearching] = useState(false);

  // What the last lookup wrote, so the next one knows what it may replace.
  const filledByLookupRef = useRef<FilledFields>(NOTHING_FILLED);
  // The proposal as it is right now, for the effect below, which runs on a timer
  // and must not re-arm every time any field in the form changes.
  const proposalRef = useRef(proposal);
  useEffect(() => {
    proposalRef.current = proposal;
  });

  const applyGuess = useCallback(
    (guess: LookupGuess) => {
      const current = proposalRef.current;
      const filled = filledByLookupRef.current;
      const patch: Partial<FilledFields> = {};

      for (const field of ['city', 'country', 'countryCode'] as const) {
        const incoming = (guess[field] ?? '').trim();
        if (incoming === '') continue;

        const existing = current[field].trim();
        // Empty, or still exactly what the last lookup put there. Anything else
        // is the member's own answer and is left alone.
        if (existing === '' || existing === filled[field]) {
          patch[field] = field === 'countryCode' ? incoming.toUpperCase() : incoming;
        }
      }

      if (Object.keys(patch).length === 0) return;
      filledByLookupRef.current = { ...filled, ...patch };
      draft.updateProposal(patch);
    },
    [draft],
  );

  /* ---------------------------------------------------------------- */
  /* Point → name                                                       */
  /* ---------------------------------------------------------------- */

  const latitude = Number(proposal.latitude);
  const longitude = Number(proposal.longitude);
  const hasPoint =
    proposal.latitude.trim() !== '' &&
    proposal.longitude.trim() !== '' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  // Rounded to the precision the place will be published at, so nudging a pin by
  // a metre does not count as a new question to ask.
  const pointKey = hasPoint
    ? `${latitude.toFixed(LOCATION_POLICY.publicCoordinateDecimals)},` +
      `${longitude.toFixed(LOCATION_POLICY.publicCoordinateDecimals)}`
    : null;

  useEffect(() => {
    if (!pointKey) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const [lat, lng] = pointKey.split(',');
      try {
        const response = await fetch(
          `/api/places/lookup?lat=${lat}&lng=${lng}&lang=${locale}`,
          { headers: { accept: 'application/json' } },
        );
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { guess?: LookupGuess | null };
        if (cancelled || !body.guess) return;
        applyGuess(body.guess);
      } catch {
        // The member types. Nothing here is worth an error message: the fields
        // below are still there and still work.
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [applyGuess, locale, pointKey]);

  /* ---------------------------------------------------------------- */
  /* Name → point                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * One lookup. `attempt` is how a slow answer to an earlier keystroke knows it
   * has been overtaken: a member who keeps typing must not have yesterday's
   * word land on top of today's.
   */
  const lookupName = useCallback(
    async (text: string, attempt: number) => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/places/lookup?q=${encodeURIComponent(text)}&lang=${locale}`,
          { headers: { accept: 'application/json' } },
        );
        const body = response.ok
          ? ((await response.json()) as { matches?: LookupMatch[] })
          : { matches: [] };
        if (searchGeneration.current !== attempt) return;
        setMatches(body.matches ?? []);
      } catch {
        if (searchGeneration.current !== attempt) return;
        setMatches([]);
      } finally {
        if (searchGeneration.current === attempt) setSearching(false);
      }
    },
    [locale],
  );

  /** Typing. Searches on the pause, not on the letter. */
  function handleQueryChange(next: string) {
    setQuery(next);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchGeneration.current += 1;
    const attempt = searchGeneration.current;

    const trimmed = next.trim();
    if (trimmed.length < SEARCH_MIN_LIVE) {
      // Below the threshold there is nothing to show and nothing in flight that
      // should still arrive: clearing the list is what makes deleting the query
      // put the panel away.
      setMatches(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(() => {
      void lookupName(trimmed, attempt);
    }, SEARCH_DEBOUNCE_MS);
  }

  /** The button and the Enter key, which search from two letters and at once. */
  function runSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchGeneration.current += 1;
    void lookupName(trimmed, searchGeneration.current);
  }

  // Stops a late answer from calling setState after unmount, and drops any
  // pending keystroke on the way out.
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchGeneration.current += 1;
    },
    [],
  );

  function choose(match: LookupMatch) {
    // The coordinate first, then the rest: the picker follows the fields, so
    // this is what moves the pin.
    draft.updateProposal({
      latitude: match.latitude.toFixed(LOCATION_POLICY.publicCoordinateDecimals),
      longitude: match.longitude.toFixed(LOCATION_POLICY.publicCoordinateDecimals),
    });
    applyGuess(match);
    // Past the live threshold and in the box: without bumping the generation
    // and clearing the timer, putting the chosen name into the field would
    // start a fresh search for the thing just chosen.
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchGeneration.current += 1;
    setSearching(false);
    setMatches(null);
    setQuery(match.name);
  }

  return (
    <section aria-labelledby="proposal-point" className="mt-7">
      <h4 id="proposal-point" className="text-eyebrow text-muted uppercase">
        {t('place.pointHeading')}
      </h4>
      <p className="mt-2 max-w-prose text-meta leading-relaxed text-muted">
        {t('place.pointHint')}
      </p>

      {/*
        Suggestions arrive as the member types, which is what they expect of a
        place field and what this one did not do.

        It is still a form, and the button and the Enter key still work: typing
        is now one way to search rather than the only one, and a member on a
        keyboard or without JavaScript is not left without a way to ask. What
        makes typing affordable is the pause — `SEARCH_DEBOUNCE_MS` — plus the
        three-letter floor, the day-long cache in `lib/geo/geocode.ts` and the
        per-member limit on the route. One request per word typed, not one per
        letter, against a free service that deserves that much care.
      */}
      <form onSubmit={runSearch} className="mt-4 flex flex-wrap items-end gap-2.5">
        <TextField
          label={t('place.searchByNameLabel')}
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={t('place.searchByNamePlaceholder')}
          hint={t('place.searchByNameHint')}
          autoComplete="off"
          wrapperClassName="min-w-[16rem] flex-1"
        />
        <Button type="submit" variant="secondary" disabled={searching || query.trim().length < 2}>
          {searching ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <Search aria-hidden className="size-3.5" />
          )}
          {t('place.searchByNameAction')}
        </Button>
      </form>

      {matches !== null ? (
        <div aria-live="polite" className="mt-3">
          {matches.length === 0 ? (
            <p className="text-meta leading-relaxed text-muted">{t('place.searchByNameNone')}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {matches.map((match) => (
                <li key={`${match.name}-${match.latitude}-${match.longitude}`}>
                  <button
                    type="button"
                    onClick={() => choose(match)}
                    className={cn(
                      'flex w-full items-start gap-2.5 bg-surface px-4 py-3 text-left',
                      'hover:bg-surface-sunken',
                    )}
                  >
                    <MapPinned aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="block text-caption font-semibold">{match.name}</span>
                      <span className="block text-meta text-muted">
                        {[match.city, match.country].filter(Boolean).join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <CoordinatePicker
        latitude={proposal.latitude}
        longitude={proposal.longitude}
        onChange={(next) => draft.updateProposal(next)}
        defaultView={defaultMapView}
        className="mt-4"
      />

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <TextField
          label={t('place.latitudeLabel')}
          required
          inputMode="decimal"
          value={proposal.latitude}
          onChange={(event) => draft.updateProposal({ latitude: event.target.value })}
          error={draft.errors.latitude}
          placeholder={t('place.latitudePlaceholder')}
          autoComplete="off"
        />
        <TextField
          label={t('place.longitudeLabel')}
          required
          inputMode="decimal"
          value={proposal.longitude}
          onChange={(event) => draft.updateProposal({ longitude: event.target.value })}
          error={draft.errors.longitude}
          placeholder={t('place.longitudePlaceholder')}
          autoComplete="off"
        />
      </div>
    </section>
  );
}
