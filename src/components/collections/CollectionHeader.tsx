import type { ReactNode } from 'react';

import { VisibilityBadge } from '@/components/collections/CollectionCard';
import {
  CollectionFormDialog,
  DeleteCollectionButton,
} from '@/components/collections/CollectionFormDialog';
import { PhotographerByline } from '@/components/photographer/PhotographerByline';
import { Eyebrow } from '@/components/ui/SectionHead';
import { cn, formatCount, formatDate } from '@/lib/utils';
import type { Collection } from '@/types/domain';

/**
 * The masthead of a collection page.
 *
 * The title is the page's h1, but at section scale rather than display scale:
 * the photographs below are meant to be the loudest thing on the screen, and a
 * member-supplied title of up to 80 characters set at display size would both
 * compete with them and wrap into a wall.
 *
 * A collection holds two kinds of thing, so both counts are stated separately.
 * One sum would hide the difference between a shot list of twelve places and a
 * set of twelve frames.
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
  const updated = formatDate(collection.updatedAt);

  return (
    <header className={cn('border-b border-line pb-8', className)}>
      <Eyebrow>Collection</Eyebrow>

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
            {formatCount(counts.photographs)}{' '}
            {counts.photographs === 1 ? 'photograph' : 'photographs'}
          </li>
          <li className="tabular-nums">
            {formatCount(counts.locations)} {counts.locations === 1 ? 'place' : 'places'}
          </li>
          {updated ? (
            <li>
              Updated <time dateTime={collection.updatedAt}>{updated}</time>
            </li>
          ) : null}
        </ul>
      </div>

      {isOwner || reportAction ? (
        <div className="mt-7 flex flex-wrap items-start gap-2">
          {isOwner ? (
            <>
              <CollectionFormDialog
                collection={{
                  id: collection.id,
                  slug: collection.slug,
                  title: collection.title,
                  description: collection.description,
                  visibility: collection.visibility,
                }}
                triggerLabel="Edit details"
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
