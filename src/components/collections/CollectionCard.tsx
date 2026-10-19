import { Images, Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';

import { PhotographerByline } from '@/components/photographer/PhotographerByline';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { IMAGE_SIZES } from '@/lib/images/variants';
import { cn, formatCount, formatDate, truncate } from '@/lib/utils';
import type { Collection, CollectionVisibility } from '@/types/domain';

/**
 * The index card for one collection.
 *
 * It follows the gallery card's rhythm — a media block at a fixed editorial
 * ratio, then the title and the metadata beneath — so a page of collections
 * and a page of photographs read as the same publication. The card itself is
 * not an anchor: the title carries the link and stretches a transparent
 * overlay across the card, which keeps the byline a real sibling link rather
 * than an anchor nested inside one.
 *
 * The title and the description are the member's own words, so they are
 * rendered as stored whatever language the page is in. Everything FRAME says
 * around them — the badge, the counts, the date — follows the active locale.
 */

/**
 * The BCP 47 tag `Intl` should format this page's numbers and dates with.
 *
 * `useLocale()` returns the URL segment, which is not always a formatting
 * locale: bare `en` would give American date order where this design has
 * always printed "12 March 2024", and bare `th` would give the Buddhist era.
 * `INTL_LOCALES` is the mapping that pins both.
 */
function intlLocaleOf(locale: string): string {
  return INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/**
 * The visibility label.
 *
 * Private is stated in words as well as marked with a padlock, because "who
 * can see this" is never something to leave to an icon or a colour. The
 * `onImage` shell is for a badge sitting over a cover, where a hairline border
 * on an unknown photograph is not a reliable edge.
 */
export function VisibilityBadge({
  visibility,
  onImage = false,
  className,
}: {
  visibility: CollectionVisibility;
  onImage?: boolean;
  className?: string;
}) {
  const t = useTranslations('collections');

  const shell = cn(
    'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-eyebrow uppercase',
    onImage ? 'bg-surface/90 text-ink' : 'border border-line text-muted',
    className,
  );

  return (
    <span className={shell}>
      {visibility === 'private' ? <Lock aria-hidden className="size-2.5" /> : null}
      {visibility === 'private' ? t('visibility.private') : t('visibility.public')}
    </span>
  );
}

export function CollectionCard({
  collection,
  showVisibility = false,
  className,
}: {
  collection: Collection;
  /**
   * Badge every card, not only the private ones. Used in a member's own list,
   * where "which of mine are public?" is the question being asked; in a public
   * index, public is the assumption and a badge on every tile is noise.
   */
  showVisibility?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('collections');

  const intl = intlLocaleOf(locale);
  const href = `/collections/${collection.slug}`;
  const updated = formatDate(collection.updatedAt, intl);
  const badged = showVisibility || collection.visibility === 'private';

  return (
    <article className={cn('group relative', className)}>
      <div className="relative aspect-[3/2] overflow-hidden rounded-media bg-surface-sunken">
        {collection.coverImageUrl ? (
          <Image
            src={collection.coverImageUrl}
            // Decorative: the title and the byline beside it identify the
            // collection, and a cover carries no alt text of its own at this
            // level — only the photograph on its own page does.
            alt=""
            fill
            sizes={IMAGE_SIZES.galleryCard}
            className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.045]"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Images aria-hidden className="size-6 text-muted-soft" />
            <span className="sr-only">{t('card.noCover')}</span>
          </div>
        )}

        {badged ? (
          <VisibilityBadge
            visibility={collection.visibility}
            onImage
            className="absolute top-3 left-3 z-20"
          />
        ) : null}
      </div>

      <h3 className="mt-3 text-body font-semibold tracking-[-0.035em]">
        <Link href={href} className="before:absolute before:inset-0 before:z-10 before:content-['']">
          {collection.title}
        </Link>
      </h3>

      {collection.description ? (
        <p className="mt-1.5 text-meta leading-relaxed text-muted">
          {truncate(collection.description, 120)}
        </p>
      ) : null}

      {/* "Entries" rather than a split of photographs and places: the index
          read carries one total per collection, and inventing a breakdown from
          it would be a number nobody counted. The split is on the collection's
          own page, where the entries themselves are in hand.

          The compact number is formatted before the message rather than by it,
          because ICU has no compact notation of its own and "1.2k entries" is
          the house style for a count. `count` is still passed, so English can
          pick its plural form from the real number while Thai — which does not
          inflect — names the unit once. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-muted-soft">
        <span className="tabular-nums">
          {t('card.entryCount', {
            count: collection.itemCount,
            formatted: formatCount(collection.itemCount, intl),
          })}
        </span>
        {updated ? <span aria-hidden>·</span> : null}
        {updated ? (
          <span>
            {t.rich('updated', {
              date: updated,
              time: (chunks) => <time dateTime={collection.updatedAt}>{chunks}</time>,
            })}
          </span>
        ) : null}
      </p>

      <PhotographerByline photographer={collection.owner} className="relative z-20 mt-3" />
    </article>
  );
}
