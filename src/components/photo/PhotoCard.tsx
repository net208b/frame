import { Heart } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { AppreciateButton } from '@/components/photo/AppreciateButton';
import { CategoryTag } from '@/components/photo/CategoryTag';
import { PhotographerByline } from '@/components/photographer/PhotographerByline';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { aspectRatio, IMAGE_SIZES } from '@/lib/images/variants';
import { cn, formatCount } from '@/lib/utils';
import type { PhotographCard } from '@/types/domain';

/**
 * The gallery card — the most reused surface in FRAME.
 *
 * The photograph is the loudest thing here: a hairline-free media block at the
 * frame's real aspect ratio, one restrained hover scale, and nothing else that
 * moves. The card is not itself an anchor: the title carries the link and
 * stretches a transparent overlay across the card, which keeps the place and
 * the photographer as real sibling links instead of anchors nested inside an
 * anchor.
 *
 * The title's tight tracking is switched off on a Thai page. A photograph's
 * title is whatever the photographer typed, so it can be Thai — and the
 * `:root[lang='th']` block in `globals.css` resets the tracking *tokens*, which
 * an arbitrary `tracking-[…]` utility never reads. Negative tracking collides
 * the vowel and tone marks that stack above and below a Thai glyph, so the
 * Latin value is kept exactly as it was and the Thai page gets `normal`.
 *
 * The appreciation total is written twice on purpose. Sighted readers get the
 * compact figure ("1.2k") that the dense card layout has room for, and that
 * figure is hidden from assistive technology in favour of one sentence that
 * says the whole number and what it counts — "1,214 appreciations" rather than
 * "one point two k".
 */
export async function PhotoCard({
  photo,
  priority = false,
  showPhotographer = true,
  className,
}: {
  photo: PhotographCard;
  priority?: boolean;
  showPhotographer?: boolean;
  className?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('photo'), getLocale()]);
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];

  const isThai = intlLocale.startsWith('th');

  const href = `/photographs/${photo.slug}`;
  // Null means the viewer is signed out, so the control must not pretend to be
  // a toggle — AppreciateButton renders a sign-in link instead.
  const signedIn = photo.viewerHasAppreciated !== null;

  return (
    <article className={cn('group relative', className)}>
      <div
        className="relative overflow-hidden rounded-media bg-surface-sunken"
        style={{ aspectRatio: aspectRatio(photo.image) }}
      >
        <Image
          src={photo.image.gridUrl}
          alt={photo.altText}
          fill
          sizes={IMAGE_SIZES.galleryCard}
          priority={priority}
          placeholder={photo.image.blurDataUrl ? 'blur' : 'empty'}
          blurDataURL={photo.image.blurDataUrl}
          className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.045]"
        />

        <CategoryTag category={photo.category} tone="overlay" className="absolute bottom-3 left-3 z-20" />

        <AppreciateButton
          photographId={photo.id}
          slug={photo.slug}
          title={photo.title}
          initialCount={photo.appreciationCount}
          initialHasAppreciated={photo.viewerHasAppreciated}
          signedIn={signedIn}
          variant="overlay"
          className="absolute top-3 right-3 z-20"
        />
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className={cn(
              'text-body font-semibold',
              isThai ? 'tracking-normal' : 'tracking-[-0.035em]',
            )}
          >
            <Link href={href} className="before:absolute before:inset-0 before:z-10 before:content-['']">
              {photo.title}
            </Link>
          </h3>

          {photo.location ? (
            <p className="relative z-20 mt-1.5 text-meta text-muted">
              <Link
                href={`/locations/${photo.location.slug}`}
                className="transition-colors duration-150 hover:text-ink"
              >
                {photo.location.city}, {photo.location.country}
              </Link>
            </p>
          ) : null}
        </div>

        <p className="flex shrink-0 items-center gap-1 pt-0.5 text-meta text-muted">
          <Heart aria-hidden className="size-3" />
          <span className="tabular-nums" aria-hidden>
            {formatCount(photo.appreciationCount, intlLocale)}
          </span>
          <span className="sr-only">
            {t('appreciate.count', { count: photo.appreciationCount })}
          </span>
        </p>
      </div>

      {showPhotographer ? (
        <PhotographerByline
          photographer={photo.photographer}
          className="relative z-20 mt-3"
        />
      ) : null}
    </article>
  );
}
