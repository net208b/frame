import { getLocale, getTranslations } from 'next-intl/server';

import { CollectionCard } from '@/components/collections/CollectionCard';
import { SectionHead } from '@/components/ui/SectionHead';
import { cn } from '@/lib/utils';
import type { Collection } from '@/types/domain';

/**
 * A member's public collections, shown with the same card the collections
 * index uses so the two surfaces read as one publication.
 *
 * The repository already filters by visibility, and this filters again. That is
 * deliberate: a private collection appearing on a public profile is the kind of
 * mistake that cannot be taken back, so it is worth refusing twice.
 *
 * The description names the member, so it is one whole message with the name
 * as an argument rather than a sentence assembled around it — Thai puts the
 * name in a different place and needs no space on either side of it.
 */
export async function ProfileCollections({
  collections,
  photographerName,
  className,
}: {
  collections: readonly Collection[];
  photographerName: string;
  className?: string;
}) {
  const visible = collections.filter((collection) => collection.visibility === 'public');

  // No section at all rather than an empty shell, which would read as "this
  // member keeps no collections" instead of "there is nothing public here".
  if (visible.length === 0) return null;

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });

  return (
    <section className={cn(className)}>
      <SectionHead
        eyebrow={t('collections.eyebrow')}
        title={t('collections.title')}
        description={t('collections.description', { name: photographerName })}
      />

      <ul className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((collection) => (
          <li key={collection.id}>
            <CollectionCard collection={collection} />
          </li>
        ))}
      </ul>
    </section>
  );
}
