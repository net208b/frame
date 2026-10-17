'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type ChangeEvent } from 'react';

import { SelectField } from '@/components/ui/Field';
import {
  activeGearFilterCount,
  buildDiscoverHref,
  DEFAULT_DISCOVER_SORT,
} from '@/lib/discover-query';
import { cn } from '@/lib/utils';
import type { DiscoverQuery, GearFacets, GearOption } from '@/types/domain';

/**
 * Filter by the equipment that made the frame.
 *
 * The three lists come from the facets the repository counted, so an option is
 * only offered when something would actually match it. The counts are shown for
 * the same reason: a brand with two photographs behind it should look like a
 * brand with two photographs behind it.
 *
 * The panel is a real GET form. With JavaScript a change navigates straight
 * away; without it the submit button still applies the selection, so the
 * controls are never decoration.
 */
export function GearFilter({
  query,
  facets,
  className,
}: {
  query: DiscoverQuery;
  facets: GearFacets;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const activeCount = activeGearFilterCount(query);
  const hasAnyFacets =
    facets.cameraBrands.length > 0 ||
    facets.cameraModels.length > 0 ||
    facets.lensBrands.length > 0;

  function navigate(next: Partial<DiscoverQuery>) {
    startTransition(() => {
      // Changing a filter always returns to the first page: page three of a
      // narrower result set is usually nowhere.
      router.push(buildDiscoverHref(query, { ...next, page: 1 }));
    });
  }

  function onCameraBrandChange(event: ChangeEvent<HTMLSelectElement>) {
    // A model belongs to a brand, so keeping the old model alongside a new
    // brand would quietly produce an empty gallery.
    navigate({ cameraBrand: event.target.value || null, cameraModel: null });
  }

  if (!hasAnyFacets) {
    return (
      <p className={cn('text-caption text-muted', className)}>
        None of the published photographs carry camera or lens details yet, so there is nothing
        to filter by here.
      </p>
    );
  }

  return (
    <form
      action="/discover"
      method="get"
      aria-busy={pending || undefined}
      className={cn('min-w-0', className)}
    >
      {/* Carries the rest of the view through a submit without JavaScript. */}
      {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
      {query.place ? <input type="hidden" name="place" value={query.place} /> : null}
      {query.sort !== DEFAULT_DISCOVER_SORT ? (
        <input type="hidden" name="sort" value={query.sort} />
      ) : null}

      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <GearSelect
          label="Camera brand"
          name="cameraBrand"
          anyLabel="Any camera brand"
          options={facets.cameraBrands}
          value={query.cameraBrand ?? null}
          onChange={onCameraBrandChange}
        />
        <GearSelect
          label="Camera model"
          name="cameraModel"
          anyLabel="Any camera model"
          options={facets.cameraModels}
          value={query.cameraModel ?? null}
          onChange={(event) => navigate({ cameraModel: event.target.value || null })}
          hint="Models are listed across every brand."
        />
        <GearSelect
          label="Lens brand"
          name="lensBrand"
          anyLabel="Any lens brand"
          options={facets.lensBrands}
          value={query.lensBrand ?? null}
          onChange={(event) => navigate({ lensBrand: event.target.value || null })}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="submit"
          className="rounded-pill border border-line bg-surface px-3.5 py-2 text-meta font-bold text-ink transition-colors duration-150 hover:border-line-strong"
        >
          Apply
        </button>

        {activeCount > 0 ? (
          <Link
            href={buildDiscoverHref(query, {
              cameraBrand: null,
              cameraModel: null,
              lensBrand: null,
              page: 1,
            })}
            className="text-meta font-semibold text-ink underline underline-offset-4 transition-opacity duration-150 hover:opacity-65"
          >
            Clear gear filters
          </Link>
        ) : null}

        <p role="status" className="text-meta text-muted">
          {pending ? 'Updating the gallery' : ''}
        </p>
      </div>
    </form>
  );
}

/**
 * One facet select.
 *
 * When the URL carries a value the facets no longer contain — a shared link, or
 * a brand whose last photograph was removed — it is added to the list with a
 * zero count rather than silently falling back to "any", which would show the
 * filter as off while it is still narrowing the gallery.
 */
function GearSelect({
  label,
  name,
  anyLabel,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  name: 'cameraBrand' | 'cameraModel' | 'lensBrand';
  anyLabel: string;
  options: GearOption[];
  value: string | null;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  hint?: string;
}) {
  const known = value !== null && options.some((option) => option.label === value);
  const listed: GearOption[] =
    value !== null && !known
      ? [...options, { id: `unlisted:${value}`, label: value, photographCount: 0 }]
      : options;

  const empty = options.length === 0;

  return (
    <SelectField
      label={label}
      name={name}
      value={value ?? ''}
      onChange={onChange}
      disabled={empty}
      hint={empty ? 'Nothing recorded yet.' : hint}
    >
      <option value="">{anyLabel}</option>
      {listed.map((option) => (
        <option key={option.id} value={option.label}>
          {`${option.label} (${option.photographCount})`}
        </option>
      ))}
    </SelectField>
  );
}
