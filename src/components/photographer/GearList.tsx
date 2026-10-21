import { ArrowUpRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { buildDiscoverHref } from '@/lib/discover-query';
import { buildProfileGearHref, facetForGearLine, type GearFacet } from '@/lib/gear-filter';
import { cn, formatCount } from '@/lib/utils';
import type { PhotographDetail } from '@/types/domain';

/**
 * The gear a member chose to list, with a route into Discover where the entry
 * maps cleanly onto a brand.
 *
 * The brands are taken from the member's own published photographs rather than
 * from a hard-coded table of manufacturers. That costs nothing — the portfolio
 * is already loaded — and it means a gear link can only ever point at a filter
 * that has something behind it. A line like "Ricoh GR IIIx" from a member who
 * has published no Ricoh frames stays plain text instead of becoming a link to
 * an empty gallery.
 *
 * The gear lines themselves are member-written and are never translated. Nor
 * are the brand names: "Leica" and "f/1.4" are what a Thai photographer writes
 * too. Only the furniture around them changes language.
 */

export interface GearBrandIndex {
  /** Camera brands read from `capture.cameraBrand` across the portfolio. */
  cameras: string[];
  /** Lens brands read from `capture.lensBrand` across the portfolio. */
  lenses: string[];
}

export function gearBrandIndex(photographs: readonly PhotographDetail[]): GearBrandIndex {
  const cameras = new Set<string>();
  const lenses = new Set<string>();

  for (const photograph of photographs) {
    const camera = photograph.capture.cameraBrand?.trim();
    if (camera) cameras.add(camera);

    const lens = photograph.capture.lensBrand?.trim();
    if (lens) lenses.add(lens);
  }

  return { cameras: [...cameras], lenses: [...lenses] };
}

/** The longest brand the entry actually starts with, on a word boundary. */
function leadingBrand(entry: string, brands: readonly string[]): string | null {
  const haystack = entry.toLowerCase();
  let best: string | null = null;

  for (const brand of brands) {
    const needle = brand.trim().toLowerCase();
    if (needle.length === 0 || !haystack.startsWith(needle)) continue;

    // "Son" must not match "Sony": the brand has to end where a word ends.
    const next = haystack.charAt(needle.length);
    if (next !== '' && /[a-z0-9]/.test(next)) continue;

    if (best === null || brand.length > best.length) best = brand;
  }

  return best;
}

interface GearFilter {
  href: string;
  brand: string;
  /** Used in the accessible label, because the two filters are not the same. */
  kind: 'camera' | 'lens';
}

/**
 * Several brands make both bodies and glass, so "Leica Q3" and "Leica Summilux
 * 28mm f/1.7" would otherwise land on the same filter. A focal length or an
 * f-number in the name is the reliable tell that an entry is a lens.
 */
function gearFilter(entry: string, brands: GearBrandIndex): GearFilter | null {
  const readsAsLens = /\d\s*mm\b|f\/\s*\d/i.test(entry);

  const lensAxis = { kind: 'lens', brands: brands.lenses } as const;
  const cameraAxis = { kind: 'camera', brands: brands.cameras } as const;
  const order = readsAsLens ? [lensAxis, cameraAxis] : [cameraAxis, lensAxis];

  for (const axis of order) {
    const brand = leadingBrand(entry, axis.brands);
    if (!brand) continue;

    // Built through the one module that owns the Discover URL, so the link
    // parses back to exactly this filter — and so a brand with a space in it
    // survives the trip.
    const href =
      axis.kind === 'lens'
        ? buildDiscoverHref({ lensBrand: brand })
        : buildDiscoverHref({ cameraBrand: brand });

    return { brand, kind: axis.kind, href };
  }

  return null;
}

export async function GearList({
  gear,
  brands,
  facets = [],
  username,
  className,
}: {
  gear: readonly string[];
  brands?: GearBrandIndex;
  /** The cameras and lenses this member's frames were shot on, with counts. */
  facets?: readonly GearFacet[];
  /** Needed to build a filter that stays on this profile. */
  username?: string;
  className?: string;
}) {
  const entries = gear.map((entry) => entry.trim()).filter(Boolean);

  // An empty shell says "this member has no gear" rather than "this member did
  // not fill the field in", so the whole block goes instead.
  if (entries.length === 0) return null;

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });

  const index = brands ?? { cameras: [], lenses: [] };

  return (
    <section className={cn(className)}>
      <h2>
        <Eyebrow>{t('gear.eyebrow')}</Eyebrow>
      </h2>

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {entries.map((entry, position) => {
          // First choice: the frames on THIS profile shot on that very model.
          // A line that names a camera with frames here filters the page in
          // place; only a line that matches nothing here falls back to the
          // sitewide Discover filter below, exactly as before.
          const own = username ? facetForGearLine(entry, facets) : null;
          const filter = own ? null : gearFilter(entry, index);

          return (
            <li
              key={`${position}-${entry}`}
              className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3"
            >
              <span className="text-caption text-ink-soft">{entry}</span>

              {own && username ? (
                <Link
                  href={buildProfileGearHref(username, own.key)}
                  scroll={false}
                  aria-label={t('gear.profileFilter', { gear: own.label })}
                  className="inline-flex shrink-0 items-center gap-1 text-meta font-semibold text-muted transition-colors duration-150 hover:text-ink tabular-nums"
                >
                  {t('gearFilter.count', { count: formatCount(own.count, locale) })}
                  <ArrowUpRight aria-hidden className="size-3" />
                </Link>
              ) : filter ? (
                <Link
                  href={filter.href}
                  /*
                   * The whole phrase is one message rather than the visible
                   * brand plus a screen-reader-only suffix: "Leica" + " lenses
                   * on Discover" reads correctly only in a language that puts
                   * the noun last, and Thai puts it first (เลนส์ Leica). Both
                   * translations still contain the visible brand, so the
                   * accessible name matches what is on screen.
                   */
                  aria-label={
                    filter.kind === 'lens'
                      ? t('gear.lensFilter', { brand: filter.brand })
                      : t('gear.cameraFilter', { brand: filter.brand })
                  }
                  className="inline-flex shrink-0 items-center gap-1 text-meta font-semibold text-muted transition-colors duration-150 hover:text-ink"
                >
                  {filter.brand}
                  <ArrowUpRight aria-hidden className="size-3" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-meta text-muted">{t('gear.note')}</p>
    </section>
  );
}
