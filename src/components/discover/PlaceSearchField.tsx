'use client';

import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';

import { buildDiscoverHref, DEFAULT_DISCOVER_SORT, GEAR_FILTER_KEYS } from '@/lib/discover-query';
import { cn } from '@/lib/utils';
import type { DiscoverQuery } from '@/types/domain';

/**
 * Place search, as a real form.
 *
 * The form is a plain GET to /discover carrying the rest of the view in hidden
 * fields, so it still works when JavaScript has not loaded or has failed. When
 * JavaScript is available the submit is intercepted only to navigate to the
 * canonical href instead, which keeps `?place=` out of the URL when the box is
 * empty.
 *
 * There is deliberately no search-as-you-type: a request per keystroke would
 * fill the back button with half-typed words, and the gallery it is filtering
 * is a slow, image-heavy read.
 */
export function PlaceSearchField({
  query,
  className,
}: {
  query: DiscoverQuery;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(query.place ?? '');
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  // The URL is the source of truth. When a removable pill or a shared link
  // changes the place filter, the box follows instead of holding a stale term.
  //
  // Adjusting during render rather than in an effect: an effect would paint the
  // stale term first and then immediately re-render, which is both a visible
  // flicker and the cascading render the hook lint rule warns about.
  const [syncedPlace, setSyncedPlace] = useState(query.place ?? null);
  if ((query.place ?? null) !== syncedPlace) {
    setSyncedPlace(query.place ?? null);
    setValue(query.place ?? '');
  }

  function navigate(place: string | null) {
    startTransition(() => {
      router.push(buildDiscoverHref(query, { place, page: 1 }));
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(value.trim() || null);
  }

  function handleClear() {
    setValue('');
    // Only navigate if a place filter is actually applied; otherwise this is
    // just emptying the box and nothing on the page needs to change.
    if (query.place) navigate(null);
  }

  return (
    <form
      role="search"
      action="/discover"
      method="get"
      onSubmit={handleSubmit}
      className={cn('min-w-0', className)}
    >
      {/* Keeps the rest of the view intact when the browser submits this GET
          itself. Defaults are left out so a clean view stays a clean URL. */}
      {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
      {query.sort !== DEFAULT_DISCOVER_SORT ? (
        <input type="hidden" name="sort" value={query.sort} />
      ) : null}
      {GEAR_FILTER_KEYS.map((key) =>
        query[key] ? <input key={key} type="hidden" name={key} value={query[key] ?? ''} /> : null,
      )}

      <label htmlFor={inputId} className="sr-only">
        Search photographs by place
      </label>

      <div
        className={cn(
          'flex items-center gap-2 rounded-pill border border-line bg-surface pr-1.5 pl-3.5',
          'transition-colors duration-150 focus-within:border-line-strong',
        )}
      >
        <Search aria-hidden className="size-3.5 shrink-0 text-muted-soft" />

        {/* A native type="search" adds a second, differently behaving clear
            control in WebKit, so this is a text input with one clear button. */}
        <input
          id={inputId}
          type="text"
          name="place"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="City, country or place"
          autoComplete="off"
          enterKeyHint="search"
          className="h-9 w-full min-w-0 bg-transparent text-caption text-ink placeholder:text-muted-soft"
        />

        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-pill p-1.5 text-muted-soft transition-colors duration-150 hover:text-ink"
          >
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">Clear the place search</span>
          </button>
        ) : null}

        <button
          type="submit"
          className="shrink-0 rounded-pill bg-ink px-3 py-1.5 text-meta font-bold text-on-ink transition-colors duration-150 hover:bg-ink-surface-soft"
        >
          Search
        </button>
      </div>

      <p role="status" className="sr-only">
        {pending ? 'Updating the gallery' : ''}
      </p>
    </form>
  );
}
