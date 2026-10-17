import { CATEGORY_LABELS, type PhotoCategory } from '@/types/domain';

import { cn } from '@/lib/utils';

/**
 * The small uppercase category pill.
 *
 * `overlay` sits on top of a photograph, so it carries its own translucent
 * paper behind the text rather than relying on the image being light enough.
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
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-1.5 text-eyebrow uppercase',
        TONES[tone],
        className,
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}
