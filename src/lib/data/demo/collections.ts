import type { Collection, CollectionItem, PhotographerSummary } from '@/types/domain';

import { DEMO_LOCATIONS } from './locations';
import { DEMO_PHOTOGRAPHERS } from './photographers';
import { DEMO_PHOTOGRAPHS } from './photographs';

/**
 * Demo collections.
 *
 * Collections hold photographs *and* places, because the two reasons a member
 * saves something are "I want to look at this again" and "I want to go here".
 */

const [kenji, anna, marco, maya, pim] = DEMO_PHOTOGRAPHERS;

function owner(id: string): PhotographerSummary {
  const person = DEMO_PHOTOGRAPHERS.find((item) => item.id === id);
  if (!person) throw new Error(`Demo data error: unknown collection owner "${id}"`);
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
    basedIn: person.basedIn,
  };
}

function photo(slug: string) {
  const match = DEMO_PHOTOGRAPHS.find((item) => item.slug === slug);
  if (!match) throw new Error(`Demo data error: unknown photograph slug "${slug}"`);
  return match;
}

function place(slug: string) {
  const match = DEMO_LOCATIONS.find((item) => item.slug === slug);
  if (!match) throw new Error(`Demo data error: unknown location slug "${slug}"`);
  return {
    id: match.id,
    slug: match.slug,
    name: match.name,
    city: match.city,
    country: match.country,
    countryCode: match.countryCode,
    photographCount: match.photographCount,
    translations: match.translations,
  };
}

interface DemoCollection extends Collection {
  items: CollectionItem[];
}

export const DEMO_COLLECTIONS: DemoCollection[] = [
  {
    id: 'd4f8b300-0000-4000-8000-000000000001',
    slug: 'tokyo-after-midnight',
    title: 'Tokyo after midnight',
    description:
      'Frames from the hours when the city is lit but empty. Mostly my own work, kept together so I can see whether I am repeating myself.',
    visibility: 'public',
    owner: owner(kenji!.id),
    itemCount: 3,
    coverImageUrl: photo('the-street-that-only-exists-after-dark').image.gridUrl,
    updatedAt: '2026-10-12T10:00:00.000Z',
    items: [
      {
        id: 'item-0001',
        note: 'The one that made me start going out at one in the morning.',
        addedAt: '2026-10-12T10:00:00.000Z',
        photograph: photo('the-street-that-only-exists-after-dark'),
        location: null,
      },
      {
        id: 'item-0002',
        note: null,
        addedAt: '2026-09-29T08:00:00.000Z',
        photograph: photo('the-city-goes-on-past-the-frame'),
        location: null,
      },
      {
        id: 'item-0003',
        note: 'Go back on a wet night.',
        addedAt: '2026-09-29T08:01:00.000Z',
        photograph: null,
        location: place('shinjuku-backstreets-tokyo'),
      },
    ],
  },
  {
    id: 'd4f8b300-0000-4000-8000-000000000002',
    slug: 'concrete-and-glass',
    title: 'Concrete and glass',
    description:
      'A reference file for hard geometry. Useful when I need to remember how a façade behaves in a particular light.',
    visibility: 'public',
    owner: owner(anna!.id),
    itemCount: 3,
    coverImageUrl: photo('no-sky-available').image.gridUrl,
    updatedAt: '2026-09-26T12:30:00.000Z',
    items: [
      {
        id: 'item-0010',
        note: 'Converging verticals used deliberately.',
        addedAt: '2026-09-26T12:30:00.000Z',
        photograph: photo('no-sky-available'),
        location: null,
      },
      {
        id: 'item-0011',
        note: null,
        addedAt: '2026-09-13T09:00:00.000Z',
        photograph: photo('where-the-city-meets-the-water'),
        location: null,
      },
      {
        id: 'item-0012',
        note: null,
        addedAt: '2026-07-28T09:00:00.000Z',
        photograph: photo('the-grid-from-above'),
        location: null,
      },
    ],
  },
  {
    id: 'd4f8b300-0000-4000-8000-000000000003',
    slug: 'places-to-shoot-in-kyoto',
    title: 'Places to shoot in Kyoto',
    description:
      'Short list for a trip in spring. Checking the restriction notes before I go, not after.',
    visibility: 'public',
    owner: owner(marco!.id),
    itemCount: 2,
    coverImageUrl: photo('the-slope-before-the-crowds').image.gridUrl,
    updatedAt: '2026-10-01T07:45:00.000Z',
    items: [
      {
        id: 'item-0020',
        note: 'Before seven, or do not bother.',
        addedAt: '2026-10-01T07:45:00.000Z',
        photograph: null,
        location: place('higashiyama-kyoto'),
      },
      {
        id: 'item-0021',
        note: 'Study how the roofs stack under the pagoda.',
        addedAt: '2026-10-01T07:46:00.000Z',
        photograph: photo('the-slope-before-the-crowds'),
        location: null,
      },
    ],
  },
  {
    id: 'd4f8b300-0000-4000-8000-000000000004',
    slug: 'night-signage',
    title: 'Night signage',
    description: 'Streets where the typography is the architecture.',
    visibility: 'public',
    owner: owner(pim!.id),
    itemCount: 2,
    coverImageUrl: photo('a-wall-made-entirely-of-type').image.gridUrl,
    updatedAt: '2026-10-07T18:00:00.000Z',
    items: [
      {
        id: 'item-0030',
        note: null,
        addedAt: '2026-10-07T18:00:00.000Z',
        photograph: photo('a-wall-made-entirely-of-type'),
        location: null,
      },
      {
        id: 'item-0031',
        note: 'Same idea, different alphabet.',
        addedAt: '2026-10-14T11:00:00.000Z',
        photograph: photo('looking-up-instead'),
        location: null,
      },
    ],
  },
  {
    id: 'd4f8b300-0000-4000-8000-000000000005',
    slug: 'return-to-these',
    title: 'Return to these',
    description: 'Unfinished ideas. Private because half of these are mistakes I want to redo.',
    visibility: 'private',
    owner: owner(maya!.id),
    itemCount: 2,
    coverImageUrl: photo('ten-minutes-of-overlap').image.gridUrl,
    updatedAt: '2026-10-15T20:10:00.000Z',
    items: [
      {
        id: 'item-0040',
        note: 'Try this again at 24mm.',
        addedAt: '2026-10-15T20:10:00.000Z',
        photograph: photo('ten-minutes-of-overlap'),
        location: null,
      },
      {
        id: 'item-0041',
        note: 'Ask about photographing the counter next time.',
        addedAt: '2026-09-05T10:00:00.000Z',
        photograph: photo('a-room-that-has-not-changed'),
        location: null,
      },
    ],
  },
];

export function demoCollectionBySlug(slug: string): DemoCollection | undefined {
  return DEMO_COLLECTIONS.find((collection) => collection.slug === slug);
}

/** Public collections only — private ones must never reach an anonymous view. */
export function demoPublicCollections(): DemoCollection[] {
  return DEMO_COLLECTIONS.filter((collection) => collection.visibility === 'public');
}

export function demoCollectionsByOwner(ownerId: string, includePrivate: boolean) {
  return DEMO_COLLECTIONS.filter(
    (collection) =>
      collection.owner.id === ownerId &&
      (includePrivate || collection.visibility === 'public'),
  );
}
