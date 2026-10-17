import type { Metadata } from 'next';
import Link from 'next/link';

import { CollectionCard } from '@/components/collections/CollectionCard';
import { CollectionFormDialog } from '@/components/collections/CollectionFormDialog';
import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getCollections } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import type { Collection } from '@/types/domain';

export const metadata: Metadata = buildMetadata({
  title: 'Collections',
  description:
    'Groups of photographs and places kept by FRAME members: shot lists for a city, routes to walk, and sets of frames worth returning to.',
  path: '/collections',
});

const GRID = 'grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

const LOGIN_HREF = `/login?next=${encodeURIComponent('/collections')}`;

function CollectionGrid({
  collections,
  showVisibility = false,
}: {
  collections: readonly Collection[];
  showVisibility?: boolean;
}) {
  return (
    <ul className={GRID}>
      {collections.map((collection) => (
        <li key={collection.id}>
          <CollectionCard collection={collection} showVisibility={showVisibility} />
        </li>
      ))}
    </ul>
  );
}

export default async function CollectionsPage() {
  const viewer = await getViewer();

  const [shared, own] = await Promise.all([
    getCollections(),
    viewer
      ? getCollections({ ownerId: viewer.id, includePrivate: true })
      : Promise.resolve<Collection[]>([]),
  ]);

  // A member's own public collections are already listed under "Your
  // collections", so the community list is everybody else's.
  const community = viewer
    ? shared.filter((collection) => collection.owner.id !== viewer.id)
    : shared;

  return (
    <div className="site-container py-14 md:py-20">
      <header className="max-w-[46rem]">
        <Eyebrow>Collections</Eyebrow>

        <h1 className="mt-5 text-display-fluid">
          Frames and places, <em className="font-serif font-normal italic">grouped</em>.
        </h1>

        <p className="mt-6 max-w-[44ch] text-lead leading-relaxed text-muted">
          A collection is one member&rsquo;s own grouping — a shot list for a city, a route to
          walk at dawn, or the frames they keep coming back to. Each one holds photographs,
          places, or both.
        </p>

        <div className="mt-8">
          {isDemoMode() ? (
            <CapabilityNotice
              capability="database"
              action="Keeping a collection"
              className="max-w-xl"
            />
          ) : viewer ? (
            <CollectionFormDialog triggerLabel="Create collection" />
          ) : (
            <Button asChild variant="secondary">
              <Link href={LOGIN_HREF}>Sign in to keep your own</Link>
            </Button>
          )}
        </div>
      </header>

      {viewer ? (
        <section aria-label="Your collections" className="mt-16 md:mt-20">
          <SectionHead
            eyebrow="Yours"
            title="Your collections"
            description={
              own.length === 0
                ? undefined
                : `${own.length === 1 ? '1 collection' : `${own.length} collections`}, private ones included.`
            }
          />

          {own.length > 0 ? (
            // Badge every card here, public ones included: in your own list the
            // question is which of these anyone else can open.
            <CollectionGrid collections={own} showVisibility />
          ) : (
            <EmptyState
              title="You have not started one yet"
              description="Use Create collection above, or save a photograph or a place from its own page and name a new collection as you go."
            />
          )}
        </section>
      ) : null}

      <section aria-label="Collections from the community" className="mt-16 md:mt-20">
        <SectionHead
          eyebrow="Shared publicly"
          title="From the community"
          description="Only collections their owners chose to make public appear here."
        />

        {community.length > 0 ? (
          <CollectionGrid collections={community} />
        ) : (
          <EmptyState
            title="No public collections yet"
            description="Members keep a collection private until they decide to share it, so this list fills up slowly."
          />
        )}
      </section>
    </div>
  );
}
