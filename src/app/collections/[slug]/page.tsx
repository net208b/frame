import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { CollectionHeader } from '@/components/collections/CollectionHeader';
import { CollectionItemGrid } from '@/components/collections/CollectionItemGrid';
import { ReportDialog } from '@/components/system/ReportDialog';
import { SectionHead } from '@/components/ui/SectionHead';
import { getViewer } from '@/lib/auth';
import { getCollection, getPublicCollectionSlugs } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import type { Collection, CollectionItem } from '@/types/domain';

type CollectionWithItems = Collection & { items: CollectionItem[] };

interface Loaded {
  collection: CollectionWithItems;
  isOwner: boolean;
}

/**
 * Only public collections are offered for static generation, and only public
 * collections belong in the sitemap: a private collection must not be indexed,
 * and a list of its addresses would be an index of its own.
 */
export async function generateStaticParams() {
  const slugs = await getPublicCollectionSlugs();
  return slugs.map((slug) => ({ slug }));
}

/**
 * Read the collection once per request for both the metadata and the page.
 *
 * Private rows are only asked for when somebody is signed in, and only
 * row-level security decides whether they come back: the query runs as that
 * member, so another member's private collection is filtered out in Postgres
 * rather than here. In demo mode there is no session at all, so `viewer` is
 * null, the flag is false, and the bundled private collection stays shut.
 *
 * The ownership test below is the second gate, and it is what turns "not
 * yours" into a 404 rather than a 403 — a refusal would confirm the collection
 * exists, and its existence is the owner's to disclose.
 */
const load = cache(async (slug: string): Promise<Loaded | null> => {
  const viewer = await getViewer();
  const collection = await getCollection(slug, { includePrivate: viewer !== null });
  if (!collection) return null;

  const isOwner = viewer !== null && viewer.id === collection.owner.id;
  if (collection.visibility === 'private' && !isOwner) return null;

  return { collection, isOwner };
});

function countItems(items: readonly CollectionItem[]): {
  photographs: number;
  locations: number;
} {
  let photographs = 0;
  let locations = 0;
  for (const item of items) {
    if (item.photograph) photographs += 1;
    else if (item.location) locations += 1;
  }
  return { photographs, locations };
}

function describeContents(counts: { photographs: number; locations: number }): string {
  const frames = `${counts.photographs} ${counts.photographs === 1 ? 'photograph' : 'photographs'}`;
  const places = `${counts.locations} ${counts.locations === 1 ? 'place' : 'places'}`;
  return `${frames} and ${places}`;
}

/**
 * The share image, and only when its real alt text is available.
 *
 * Alt text is written by the uploader, so the cover's description comes from
 * the photograph in this collection that the cover points at. Without a match
 * there is no authored alt text, and writing one for a share card would still
 * be writing one.
 */
function coverImage(collection: CollectionWithItems): { url: string; alt: string } | null {
  const url = collection.coverImageUrl;
  if (!url) return null;

  const photograph = collection.items.find((item) => item.photograph?.image.gridUrl === url)
    ?.photograph;
  return photograph ? { url, alt: photograph.altText } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await load(slug);

  if (!loaded) {
    return buildMetadata({
      title: 'Collection not found',
      description: 'There is no collection at this address.',
      path: `/collections/${slug}`,
      noIndex: true,
    });
  }

  const { collection } = loaded;
  const counts = countItems(collection.items);

  return buildMetadata({
    title: collection.title,
    description: collection.description
      ? truncate(collection.description, 160)
      : `A collection of ${describeContents(counts)}, kept by ${collection.owner.displayName}.`,
    path: `/collections/${collection.slug}`,
    image: coverImage(collection),
    // A private collection is never indexed, whoever happens to be reading it.
    noIndex: collection.visibility === 'private',
  });
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) notFound();

  const { collection, isOwner } = loaded;
  const counts = countItems(collection.items);

  return (
    <div className="site-container py-12 md:py-16">
      <CollectionHeader
        collection={collection}
        isOwner={isOwner}
        counts={counts}
        reportAction={
          isOwner ? null : (
            <ReportDialog
              subjectType="collection"
              subjectId={collection.id}
              subjectLabel={collection.title}
              triggerVariant="ghost"
            />
          )
        }
      />

      <section aria-label="Entries in this collection" className="mt-12 md:mt-14">
        <SectionHead
          eyebrow="Entries"
          title="In this collection"
          description={
            collection.items.length === 0
              ? undefined
              : `${describeContents(counts)}, most recently added first.`
          }
        />

        <CollectionItemGrid
          items={collection.items}
          collectionId={collection.id}
          isOwner={isOwner}
        />
      </section>
    </div>
  );
}
