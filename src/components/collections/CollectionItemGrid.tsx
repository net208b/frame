import { useLocale, useTranslations } from 'next-intl';

import { RemoveFromCollectionButton } from '@/components/collections/SaveToCollection';
import { LocationCard } from '@/components/location/LocationCard';
import { PhotoCard } from '@/components/photo/PhotoCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/states';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn, formatDate } from '@/lib/utils';
import type { CollectionItem } from '@/types/domain';

/**
 * The entries of one collection: photographs and places in a single grid.
 *
 * Two kinds of card in one grid is the hard part. They share the gallery's
 * column rhythm — the same `masonry-columns` utility every other gallery in
 * FRAME uses, which lets a short place card sit between two tall frames
 * without leaving a hole — and every entry, whichever kind it is, carries the
 * same rail beneath it: what kind of thing this is, when it was saved, the
 * member's note, then the owner's remove control. So the mix reads as one set
 * with two shapes in it rather than two layouts colliding.
 *
 * The kind is named in words rather than implied by the card's shape, which is
 * also what keeps it legible when a place has no preview image and its card is
 * mostly text. Both nouns come from `common`, so the rail says the same word
 * here as the rest of the application does.
 *
 * The note is the collector's own writing and is never translated.
 */

/** Frames above the fold on the widest column count. */
const PRIORITY_PHOTOGRAPHS = 4;

interface Subject {
  kind: 'photograph' | 'location';
  id: string;
  name: string;
}

function subjectOf(item: CollectionItem): Subject | null {
  if (item.photograph) {
    return { kind: 'photograph', id: item.photograph.id, name: item.photograph.title };
  }
  if (item.location) {
    return { kind: 'location', id: item.location.id, name: item.location.name };
  }
  return null;
}

export function CollectionItemGrid({
  items,
  collectionId,
  isOwner,
  className,
}: {
  items: readonly CollectionItem[];
  collectionId: string;
  /** Decided on the server. The remove control is a courtesy, not the check. */
  isOwner: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('collections');
  const tCommon = useTranslations('common');

  const intl = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];

  if (items.length === 0) {
    // Two different empty states, because the owner can do something about it
    // and a visitor cannot.
    return isOwner ? (
      <EmptyState
        title={t('items.emptyOwnerTitle')}
        description={t('items.emptyOwnerDescription')}
        action={
          <Button asChild>
            <Link href="/discover">{t('items.emptyOwnerAction')}</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={t('items.emptyVisitorTitle')}
        description={t('items.emptyVisitorDescription')}
      />
    );
  }

  const prioritised = new Set(
    items
      .filter((item) => item.photograph !== null)
      .slice(0, PRIORITY_PHOTOGRAPHS)
      .map((item) => item.id),
  );

  return (
    <ul className={cn('masonry-columns', className)}>
      {items.map((item) => {
        // An entry points at exactly one thing. The repository already drops
        // one whose subject is no longer published or approved, and this skips
        // anything that still arrives without a subject rather than rendering
        // an empty cell and a remove control with nothing to remove.
        const subject = subjectOf(item);
        if (!subject) return null;

        const added = formatDate(item.addedAt, intl);

        return (
          <li key={item.id}>
            {item.photograph ? (
              <PhotoCard photo={item.photograph} priority={prioritised.has(item.id)} />
            ) : null}

            {item.location ? <LocationCard location={item.location} /> : null}

            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-eyebrow uppercase">
              <span className="text-muted">
                {subject.kind === 'photograph' ? tCommon('photograph') : tCommon('place')}
              </span>
              {added ? (
                <>
                  <span aria-hidden className="text-muted-soft">
                    ·
                  </span>
                  <span className="text-muted-soft normal-case">
                    {t.rich('items.saved', {
                      date: added,
                      time: (chunks) => <time dateTime={item.addedAt}>{chunks}</time>,
                    })}
                  </span>
                </>
              ) : null}
            </div>

            {/* Labelled, because an unlabelled paragraph under a frame reads as
                the photographer's caption when it is in fact the collector's
                own note about why they kept it. */}
            {item.note ? (
              <div className="mt-2 border-l border-line-strong pl-3">
                <p className="text-eyebrow uppercase text-muted-soft">{t('items.noteLabel')}</p>
                <p className="mt-1 text-caption leading-relaxed text-ink-soft">{item.note}</p>
              </div>
            ) : null}

            {isOwner ? (
              <div className="mt-2">
                <RemoveFromCollectionButton
                  collectionId={collectionId}
                  subjectKind={subject.kind}
                  subjectId={subject.id}
                  subjectLabel={subject.name}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
