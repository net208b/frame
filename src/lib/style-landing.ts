import { PHOTO_CATEGORIES, type PhotoCategory } from '@/types/domain';

/**
 * The indexable landing pages at `/discover/style/[style]`.
 *
 * WHY THESE EXIST. Every filtered Discover view is `noIndex`, and correctly so
 * — a filter, an ordering and a page multiply into thousands of near-identical
 * URLs. But that leaves FRAME with nothing rankable between the home page and a
 * single photograph: somebody searching for street photography in general has
 * no page here to find. These are that page. One per style, each a real
 * document with its own title, description, canonical and `hreflang`, which a
 * query-string filter cannot be.
 *
 * WHAT A "STYLE" IS HERE, AND WHAT IT IS NOT. `domain.ts` deliberately keeps
 * two different axes apart: a photograph's `category` is its subject, chosen at
 * upload, while a photographer's `style` is how they work, chosen in Settings
 * (`profiles.style_tags`). This module does not merge them. Today each landing
 * page resolves to exactly one existing **category** value — the three whose
 * name is already the name of a way of shooting — and the on-page category
 * chips are untouched, still called categories. "Style" is the word the page
 * uses to a reader and to a search engine, and the mapping below is the only
 * place that word is attached to anything.
 *
 * That is also what makes this additive. When a per-photo style attribute
 * arrives, a new entry here names that attribute instead of a category, and the
 * route, the sitemap and the metadata keep working unchanged. Resolving a slug
 * through a table rather than casting it to a category is the whole point: the
 * two never become the same thing by accident.
 *
 * WHY ONLY THREE. A landing page whose subject does not already exist in the
 * data would be an empty page inviting a crawler in. Black and white, human
 * moments and urban geometry are not category values and have no per-photo
 * attribute yet, so they are not here; adding them is a schema change, not a
 * routing one.
 */

/** How a landing page narrows the feed. One shape today, more later. */
export type StyleFilter = { kind: 'category'; category: PhotoCategory };

/**
 * The published addresses, in the order they are offered.
 *
 * Written out rather than derived from the categories: a slug is part of a URL
 * somebody has linked to, so renaming a category value in `domain.ts` must not
 * silently change an address.
 */
export const STYLE_LANDING_SLUGS = ['street', 'night', 'documentary'] as const;

export type StyleLandingSlug = (typeof STYLE_LANDING_SLUGS)[number];

/** Slug to filter. The one place the word "style" is attached to anything. */
const STYLE_LANDING: Record<StyleLandingSlug, StyleFilter> = {
  street: { kind: 'category', category: 'street' },
  night: { kind: 'category', category: 'night' },
  documentary: { kind: 'category', category: 'documentary' },
};

/** Narrows a URL segment, which is whatever was requested. */
export function isStyleLandingSlug(value: unknown): value is StyleLandingSlug {
  return (
    typeof value === 'string' && (STYLE_LANDING_SLUGS as readonly string[]).includes(value)
  );
}

export function styleFilter(slug: StyleLandingSlug): StyleFilter {
  return STYLE_LANDING[slug];
}

/* ------------------------------------------------------------------------ */
/* Self-check                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Every category a landing page claims must still be a category.
 *
 * `PHOTO_CATEGORIES` is a fixed contract, but a fixed contract can still be
 * edited — and a landing page pointing at a category value that no longer
 * exists would filter on nothing and publish an empty page to the sitemap.
 * Checked at module load, where it is a crash in CI's build rather than a page
 * nobody looks at.
 */
for (const [slug, filter] of Object.entries(STYLE_LANDING)) {
  if (filter.kind === 'category' && !PHOTO_CATEGORIES.includes(filter.category)) {
    throw new Error(
      `FRAME style landing: /discover/style/${slug} filters on the category "${filter.category}", which is not in PHOTO_CATEGORIES.`,
    );
  }
}
