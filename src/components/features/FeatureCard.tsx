import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

import { formatInstant, localised } from '@/components/challenges/format';
import { Link } from '@/i18n/navigation';
import { cn, truncate } from '@/lib/utils';
import type { FeatureSummary } from '@/types/domain';

/** A feature as a card: its first photograph, its title, the start of its introduction. */
export async function FeatureCard({
  feature,
  locale,
  className,
}: {
  feature: FeatureSummary;
  locale: string;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'features' });
  const href = `/features/${feature.slug}`;

  return (
    <article className={cn('min-w-0', className)}>
      {feature.cover ? (
        <Link href={href} className="block overflow-hidden rounded-media">
          <Image
            src={feature.cover.image.gridUrl}
            alt={feature.cover.altText}
            width={feature.cover.image.width}
            height={feature.cover.image.height}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
          />
        </Link>
      ) : null}
      <p className="mt-3 text-eyebrow text-muted uppercase">
        {feature.publishedAt ? formatInstant(feature.publishedAt, locale) : t('draft')}
        {' · '}
        {t('photographCount', { count: feature.itemCount })}
      </p>
      <h3 className="mt-1 text-title font-bold">
        <Link href={href} className="hover:text-accent-strong">
          {localised(feature.title, locale)}
        </Link>
      </h3>
      <p className="mt-2 text-body leading-relaxed text-ink-soft">
        {truncate(localised(feature.intro, locale), 180)}
      </p>
    </article>
  );
}
