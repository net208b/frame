import { getTranslations } from 'next-intl/server';

import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { FeatureSummary } from '@/types/domain';

import { FeatureCard } from './FeatureCard';

/**
 * The features view of the community page: every published piece, newest
 * first. Drafts never appear here — staff read them in moderation — even
 * though row-level security would hand them to a moderator browsing this page.
 */
export async function FeaturesOverview({
  features,
  locale,
}: {
  features: FeatureSummary[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'features' });
  const published = features.filter((feature) => feature.status === 'published');

  return (
    <section className="mt-10">
      <SectionHead eyebrow={t('overview.eyebrow')} title={t('overview.title')} />
      <p className="mt-3 max-w-prose text-body text-muted">{t('overview.lead')}</p>
      {published.length === 0 ? (
        <EmptyState title={t('overview.emptyTitle')} description={t('overview.emptyDescription')} className="mt-8" />
      ) : (
        <div className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}
