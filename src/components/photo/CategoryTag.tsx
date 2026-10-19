'use client';

import { useTranslations } from 'next-intl';

import { taxonomyLabels } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import type { PhotoCategory } from '@/types/domain';

/**
 * The small uppercase category pill.
 *
 * `overlay` sits on top of a photograph, so it carries its own translucent
 * paper behind the text rather than relying on the image being light enough.
 *
 * The name comes from the shared `taxonomy` namespace through
 * `taxonomyLabels`, not from `CATEGORY_LABELS` in `types/domain.ts`. That
 * constant is still the English name a category is stored and published under —
 * the repository reads it, the structured data in `lib/seo.ts` emits it — and
 * the messages are keyed by the same literal union, so there is one list of
 * categories and no second place to add one. Going through the shared helper is
 * what keeps this tag and the Discover chip that filtered to it reading the
 * same words.
 *
 * `uppercase` is inert on Thai, which has no letter case, and the Thai
 * typography block in `globals.css` has already taken the eyebrow's positive
 * tracking back to normal — so the pill needs no per-language styling here.
 *
 * A CLIENT component, and not by preference. `MapPinPreview` carries the
 * `use client` directive and renders `LocationCard`, which renders this tag, so
 * an async Server Component here throws "`getTranslations` is not supported in
 * Client Components" the moment a map pin is opened. That path is unreachable
 * while no map style URL is configured, which is why it had not shown up — it
 * would have appeared on the first click after a provider was added. The tag is
 * one span and the `taxonomy` namespace already reaches the browser for the
 * Discover filters, so the cost of being a client component is nil.
 */
type Tone = 'overlay' | 'surface' | 'outline';

const TONES: Record<Tone, string> = {
  overlay: 'bg-surface/88 text-ink',
  surface: 'bg-surface-sunken text-ink-soft',
  outline: 'border border-line text-muted',
};

export function CategoryTag({
  category,
  tone = 'surface',
  className,
}: {
  category: PhotoCategory;
  tone?: Tone;
  className?: string;
}) {
  const taxonomy = taxonomyLabels(useTranslations('taxonomy'));

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-1.5 text-eyebrow uppercase',
        TONES[tone],
        className,
      )}
    >
      {taxonomy.category(category)}
    </span>
  );
}
