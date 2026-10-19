import type { PhotoCategory, SortOption } from '@/types/domain';

/**
 * The shared vocabulary: the six category names, the four ordering names, and
 * the one-line rule behind each ordering.
 *
 * `src/types/domain.ts` holds `CATEGORY_LABELS`, `SORT_LABELS` and
 * `SORT_EXPLANATIONS` as English constants, and that module is a fixed
 * contract — it is imported by the repository, the ranking rules and the
 * structured data, none of which has a request or a locale to read. So the
 * labels are not translated in place. The `taxonomy` namespace in
 * `src/messages/*.json` holds the same vocabulary keyed by the same literal
 * union values, and this module is the one place that turns a slug into the
 * message key for it.
 *
 * Discover, the map filter bar, the category tag, the upload steps and the
 * guidelines page all render this vocabulary. They should all go through here,
 * so a category is named identically wherever it appears and a new category is
 * a change in two JSON files rather than in six components.
 *
 * The helper takes the translator rather than creating one, which is what keeps
 * this module usable from both sides of the tree: a Server Component passes
 * `await getTranslations('taxonomy')`, a Client Component passes
 * `useTranslations('taxonomy')`, and nothing here imports `next-intl/server`
 * into a client bundle.
 *
 *     // server
 *     const taxonomy = taxonomyLabels(await getTranslations('taxonomy'));
 *     // client
 *     const taxonomy = taxonomyLabels(useTranslations('taxonomy'));
 *
 *     taxonomy.category('urban-landscape');   // "Urban landscape" / "ภูมิทัศน์เมือง"
 *     taxonomy.sort('appreciated');           // "Most appreciated"
 *     taxonomy.sortInline('appreciated');     // "most appreciated"
 *     taxonomy.sortExplanation('appreciated');
 */

/** Every key the `taxonomy` namespace holds, as a message path. */
export type TaxonomyKey =
  | `category.${PhotoCategory}`
  | `sort.${SortOption}`
  | `sortInline.${SortOption}`
  | `sortExplanation.${SortOption}`;

/**
 * What `useTranslations('taxonomy')` and `getTranslations('taxonomy')` both
 * satisfy. Narrowed to the keys above on purpose: a typo in a slug is then a
 * type error rather than a message that renders as its own key.
 */
export type TaxonomyTranslator = (key: TaxonomyKey) => string;

export interface Taxonomy {
  /** A category as a chip, a tag or a heading says it. */
  category(category: PhotoCategory): string;
  /** An ordering as a tab says it. */
  sort(sort: SortOption): string;
  /**
   * The same ordering inside a sentence — "ordered by most appreciated".
   *
   * This exists rather than lower-casing `sort()` in the component. Case is a
   * property of a language, not of a string: Thai has none, German capitalises
   * nouns wherever they sit, and `toLowerCase()` on a translated label quietly
   * assumes English. The Thai values are therefore identical to `sort()`, which
   * is correct rather than redundant.
   */
  sortInline(sort: SortOption): string;
  /** How the ordering is computed, shown so ranking is not a mystery. */
  sortExplanation(sort: SortOption): string;
}

export function taxonomyLabels(t: TaxonomyTranslator): Taxonomy {
  return {
    category: (category) => t(`category.${category}`),
    sort: (sort) => t(`sort.${sort}`),
    sortInline: (sort) => t(`sortInline.${sort}`),
    sortExplanation: (sort) => t(`sortExplanation.${sort}`),
  };
}
