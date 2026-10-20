'use client';

import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState } from 'react';

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { aspectRatio, IMAGE_SIZES, PHOTOGRAPH_DISPLAY_QUALITY } from '@/lib/images/variants';
import { cn } from '@/lib/utils';
import type { PhotoImage } from '@/types/domain';

/**
 * The photograph itself, at its own aspect ratio.
 *
 * The frame sits on a sunken surface with a hairline border, so a photograph
 * that runs to white at the edges still has a boundary on the off-white page.
 * The full view is a dialog and nothing more: no zoom, no pan, no pinch
 * gesture to reinvent badly. Radix supplies the focus trap, the Escape key and
 * the return of focus to the trigger.
 *
 * This is a client component because it owns the dialog's open state, and only
 * that. Everything it renders is markup the server sends with the page, so it
 * reads its one label with `useTranslations` rather than `getTranslations`.
 */
export function PhotoStage({
  image,
  altText,
  title,
  caption,
  className,
}: {
  image: PhotoImage;
  altText: string;
  title: string;
  /** Place and credit line shown under the frame and in the full view. */
  caption?: string | null;
  className?: string;
}) {
  const t = useTranslations('photo');
  const [open, setOpen] = useState(false);
  const ratio = aspectRatio(image);

  return (
    <figure className={cn('m-0', className)}>
      <div
        className="relative overflow-hidden rounded-media border border-line bg-surface-sunken"
        style={{ aspectRatio: ratio }}
      >
        {/*
          `quality` is here because next/image re-encodes whatever it is handed,
          and its default is 75. The derivative behind this URL was built at 92
          by our own pipeline; re-encoding it at 75 threw that away on the one
          image a reader came to look at, which is the whole site's product.
          Ninety is close enough to the source that the second pass is not
          visible, and `images.qualities` in next.config.mjs is what allows the
          value at all.
        */}
        <Image
          src={image.displayUrl}
          alt={altText}
          fill
          sizes={IMAGE_SIZES.detail}
          quality={PHOTOGRAPH_DISPLAY_QUALITY}
          priority
          placeholder={image.blurDataUrl ? 'blur' : 'empty'}
          blurDataURL={image.blurDataUrl}
          className="object-contain"
        />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {/* A literal class string, not cn(): tailwind-merge does not know
                FRAME's custom text sizes, so it treats `text-meta` as a colour
                and drops it when `text-ink` follows in the same merge. */}
            <button
              type="button"
              className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-pill bg-surface/88 px-3.5 py-2 text-meta font-bold text-ink transition-colors duration-150 hover:bg-surface"
            >
              <Expand aria-hidden className="size-3.5" />
              {t('stage.fullView')}
            </button>
          </DialogTrigger>

          <DialogContent
            size="lg"
            title={title}
            description={caption ?? altText}
            className="max-w-[min(96vw,1500px)] p-4 sm:p-5"
          >
            <div className="relative overflow-hidden rounded-media bg-surface-sunken">
              <Image
                src={image.displayUrl}
                alt={altText}
                width={image.width}
                height={image.height}
                sizes="96vw"
                quality={PHOTOGRAPH_DISPLAY_QUALITY}
                className="h-auto max-h-[72vh] w-full object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {caption ? (
        <figcaption className="mt-3 text-meta text-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
