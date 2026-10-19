import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CollectionHeader } from '@/components/collections/CollectionHeader';
import { CollectionItemGrid } from '@/components/collections/CollectionItemGrid';
import { ReportDialog } from '@/components/system/ReportDialog';
import { SectionHead } from '@/components/ui/SectionHead';
import { LOCALES, type Locale } from '@/i18n/locales';
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
export async function generateStaticParams(): Promise<Array<{ locale: Locale; slug: string }>> {
  const slugs = await getPublicCollectionSlugs();
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
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
  params: LocaleParams<{ slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'collections' });
  const loaded = await load(slug);

  if (!loaded) {
    return buildMetadata({
      title: t('meta.notFoundTitle'),
      description: t('meta.notFoundDescription'),
      path: `/collections/${slug}`,
      locale,
      noIndex: true,
    });
  }

  const { collection } = loaded;
  const counts = countItems(collection.items);

  return buildMetadata({
    // The title and the description are the owner's own words and stay exactly
    // as they were stored, in whichever language they were written. Only the
    // sentence FRAME writes when there is no description is translated.
    title: collection.title,
    description: collection.description
      ? truncate(collection.description, 160)
      : t('meta.detailDescription', {
          photographs: counts.photographs,
          places: counts.locations,
          owner: collection.owner.displayName,
        }),
    path: `/collections/${collection.slug}`,
    locale,
    image: coverImage(collection),
    // A private collection is never indexed, whoever happens to be reading it.
    noIndex: collection.visibility === 'private',
  });
}

export default async function CollectionPage({
  params,
}: {
  params: LocaleParams<{ slug: string }>;
}) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'collections' });

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

      <section aria-label={t('detail.entriesLabel')} className="mt-12 md:mt-14">
        <SectionHead
          eyebrow={t('detail.entriesEyebrow')}
          title={t('detail.entriesTitle')}
          description={
            collection.items.length === 0
              ? undefined
              : // Both counts in one sentence: English inflects each noun
                // through ICU, Thai names the unit once and does not.
                t('detail.entriesDescription', {
                  photographs: counts.photographs,
                  places: counts.locations,
                })
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
