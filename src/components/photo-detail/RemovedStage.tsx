import { ImageOff } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { aspectRatio } from '@/lib/images/variants';
import { cn } from '@/lib/utils';
import type { PhotoImage } from '@/types/domain';

/**
 * What stands where the frame stood, on a removed photograph's page.
 *
 * Removing a photograph deletes its stored files — every derivative, the
 * original too — because a removed frame must not be served from anywhere,
 * including an old link to the file (`withdrawPhotographFiles` in
 * server/actions/moderation.ts). The row stays, so its owner and the
 * moderation team can still open the page, read the reason and see what was
 * recorded. Until now that page still asked next/image for the display file,
 * and got a broken image where the photograph had been.
 *
 * This keeps the frame's own shape — the same aspect ratio, the same border
 * and ground — and says plainly what happened: the photograph was removed and
 * the files are gone. Not a reload hint, not a spinner; nothing is coming.
 * The caption keeps its place below, exactly as it would under the image.
 */
export async function RemovedStage({
  image,
  caption,
  className,
}: {
  /** The dimensions are still on the row; the file behind them is not. */
  image: PhotoImage;
  caption?: string | null;
  className?: string;
}) {
  const t = await getTranslations('photo');

  return (
    <figure className={cn('m-0', className)}>
      <div
        role="img"
        aria-label={t('stage.removedTitle')}
        className="relative grid place-items-center overflow-hidden rounded-media border border-dashed border-line-strong bg-surface-sunken"
        style={{ aspectRatio: aspectRatio(image) }}
      >
        <div className="max-w-[36ch] px-6 text-center">
          <ImageOff aria-hidden className="mx-auto size-7 text-muted" />
          <p className="mt-4 text-caption font-bold text-ink-soft">{t('stage.removedTitle')}</p>
          <p className="mt-2 text-meta leading-relaxed text-muted">{t('stage.removedBody')}</p>
        </div>
      </div>

      {caption ? (
        <figcaption className="mt-3 text-meta text-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
