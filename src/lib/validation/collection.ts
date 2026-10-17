import { z } from 'zod';

import { slugify } from '@/lib/utils';
import type { CollectionVisibility } from '@/types/domain';

import { choiceWithDefault, identifier, optionalIdentifier, optionalText, requiredText } from './fields';

/**
 * Collection schemas.
 *
 * A collection is private until its owner says otherwise, which is why the
 * visibility field falls back to `private` rather than to the friendlier
 * default. The address is derived from the title with the same `slugify` the
 * rest of the app uses, so a title of punctuation alone is rejected here
 * instead of producing an unreachable page.
 */

/** Keyed by the union so a new visibility cannot be added without a description. */
export const COLLECTION_VISIBILITY_LABELS: Record<CollectionVisibility, string> = {
  private: 'Only you can open this collection',
  public: 'Anyone with the link can open this collection',
};

const visibilities = Object.keys(COLLECTION_VISIBILITY_LABELS) as [
  CollectionVisibility,
  ...CollectionVisibility[],
];

export const collectionIdSchema = z.object({
  collectionId: identifier('Collection'),
});

export const collectionSchema = z
  .object({
    /** Absent when creating a collection, present when editing one. */
    collectionId: optionalIdentifier('Collection'),
    title: requiredText({ label: 'Title', max: 80 }),
    description: optionalText({ label: 'Description', max: 600 }),
    visibility: choiceWithDefault(
      visibilities,
      'private',
      'Choose whether this collection is private or public.',
    ),
    /** Optional: an owner may keep an existing address when renaming. */
    slug: optionalText({ label: 'Address', max: 80 }),
  })
  .transform((value) => ({
    ...value,
    // Uniqueness is a database constraint, not something a schema can check:
    // a clash comes back as an ActionResult with code `conflict`.
    slug: slugify(value.slug ?? value.title),
  }))
  .refine((value) => value.slug.length > 0, {
    error: 'Use a title with at least one letter or number, so the address works.',
    path: ['title'],
  });

export const collectionItemSchema = z
  .object({
    collectionId: identifier('Collection'),
    photographId: optionalIdentifier('Photograph'),
    locationId: optionalIdentifier('Location'),
    note: optionalText({ label: 'Note', max: 280 }),
  })
  .refine((value) => value.photographId !== null || value.locationId !== null, {
    error: 'Choose the photograph or the location this entry points at.',
    path: ['photographId'],
  })
  .refine((value) => value.photographId === null || value.locationId === null, {
    error: 'A collection entry is either a photograph or a location, not both.',
    path: ['photographId'],
  });

export type CollectionInput = z.infer<typeof collectionSchema>;
export type CollectionIdInput = z.infer<typeof collectionIdSchema>;
export type CollectionItemInput = z.infer<typeof collectionItemSchema>;
