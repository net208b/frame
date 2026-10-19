import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { VisibilityBadge } from '@/components/collections/CollectionCard';
import {
  CollectionFormDialog,
  DeleteCollectionButton,
} from '@/components/collections/CollectionFormDialog';
import { PhotographerByline } from '@/components/photographer/PhotographerByline';
import { Eyebrow } from '@/components/ui/SectionHead';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { cn, formatDate } from '@/lib/utils';
import type { Collection } from '@/types/domain';

/**
 * The masthead of a collection page.
 *
 * The title is the page's h1, but at section scale rather than display scale:
 * the photographs below are meant to be the loudest thing on the screen, and a
 * member-supplied title of up to 80 characters set at display size would both
 * compete with them and wrap into a wall. It is the owner's own text, so it is
 * never translated — and neither is the description below it.
 *
 * A collection holds two kinds of thing, so both counts are stated separately.
 * One sum would hide the difference between a shot list of twelve places and a
 * set of twelve frames. Both come from `common`, where the two sentences are
 * already written in each language: English inflects the noun through ICU, Thai
 * names the unit once, and zero reads as "No photographs" rather than "0".
 */
export function CollectionHeader({
  collection,
  isOwner,
  counts,
  reportAction,
  className,
}: {
  collection: Collection;
  /** Decided on the server by comparing the viewer's id with the owner's. */
  isOwner: boolean;
  counts: { photographs: number; locations: number };
  /** Supplied by the page so the header does not need to know about reporting. */
  reportAction?: ReactNode;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('collections');
  const tCommon = useTranslations('common');

  const updated = formatDate(
    collection.updatedAt,
    INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE],
  );

  return (
    <header className={cn('border-b border-line pb-8', className)}>
      <Eyebrow>{t('eyebrow')}</Eyebrow>

      <h1 className="mt-3 max-w-[22ch] text-section-fluid font-bold">{collection.title}</h1>

      {collection.description ? (
        <p className="mt-5 max-w-[48ch] text-lead leading-relaxed text-muted">
          {collection.description}
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4">
        <PhotographerByline
          photographer={collection.owner}
          avatarSize={32}
          className="text-caption"
        />

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-muted">
          <li>
            <VisibilityBadge visibility={collection.visibility} />
          </li>
          <li className="tabular-nums">
            {tCommon('photographCount', { count: counts.photographs })}
          </li>
          <li className="tabular-nums">{tCommon('placeCount', { count: counts.locations })}</li>
          {updated ? (
            <li>
              {t.rich('updated', {
                date: updated,
                time: (chunks) => <time dateTime={collection.updatedAt}>{chunks}</time>,
              })}
            </li>
          ) : null}
        </ul>
      </div>

      {isOwner || reportAction ? (
        <div className="mt-7 flex flex-wrap items-start gap-2">
          {isOwner ? (
            <>
              {/* The dialog names its own trigger, so "Edit details" is
                  translated where the rest of that form's copy lives. */}
              <CollectionFormDialog
                collection={{
                  id: collection.id,
                  slug: collection.slug,
                  title: collection.title,
                  description: collection.description,
                  visibility: collection.visibility,
                }}
                triggerVariant="secondary"
              />
              {/* The counted items, not `collection.itemCount`. The stored
                  counter includes entries the repository drops — one pointing
                  at a photograph that has since been unpublished, say — and a
                  confirmation that names a number nothing on the page shows is
                  a confirmation the owner cannot check. */}
              <DeleteCollectionButton
                collectionId={collection.id}
                collectionTitle={collection.title}
                itemCount={counts.photographs + counts.locations}
              />
            </>
          ) : null}
          {reportAction}
        </div>
      ) : null}
    </header>
  );
}
