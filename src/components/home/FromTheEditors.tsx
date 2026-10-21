import { getTranslations } from 'next-intl/server';

import { localised } from '@/components/challenges/format';
import { PhotoCard } from '@/components/photo/PhotoCard';
import { SectionHead } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { truncate } from '@/lib/utils';
import type { FeatureDetail } from '@/types/domain';

/**
 * The latest feature on the home page: its title, the start of the editors'
 * introduction and its first three photographs. Absent entirely until there
 * is a published piece — an empty editorial band says nothing worth saying.
 */
export async function FromTheEditors({
  feature,
  locale,
}: {
  feature: FeatureDetail | null;
  locale: string;
}) {
  if (!feature || feature.status !== 'published' || feature.items.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'features' });
  const href = `/features/${feature.slug}`;

  return (
    <section className="mt-20 lg:mt-28">
      <SectionHead
        eyebrow={t('home.eyebrow')}
        title={localised(feature.title, locale)}
        action={
          <Link href={href} className="text-caption font-semibold hover:text-accent-strong">
            {t('home.read')}
          </Link>
        }
      />
      <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-soft">
        {truncate(localised(feature.intro, locale), 240)}
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {feature.items.slice(0, 3).map((item) => (
          <PhotoCard key={item.photograph.id} photo={item.photograph} />
        ))}
      </div>
    </section>
  );
}
