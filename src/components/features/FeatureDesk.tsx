import { getTranslations } from 'next-intl/server';

import { localised } from '@/components/challenges/format';
import type { FeatureDetail } from '@/types/domain';

import { CreateFeatureForm } from './CreateFeatureForm';
import { FeatureEditor } from './FeatureEditor';

/**
 * The editors' side of features, as a moderation queue: start a draft, and
 * compose and publish each one. Drafts come first — they are the work in
 * progress — then what is already up.
 */
export async function FeatureDesk({
  locale,
  features,
}: {
  locale: string;
  features: FeatureDetail[];
}) {
  const t = await getTranslations({ locale, namespace: 'features.desk' });
  const ordered = [...features].sort((a, b) =>
    a.status === b.status ? 0 : a.status === 'draft' ? -1 : 1,
  );

  return (
    <div className="space-y-10">
      <CreateFeatureForm />
      {ordered.length === 0 ? (
        <p className="text-body text-muted">{t('none')}</p>
      ) : (
        ordered.map((feature) => (
          <FeatureEditor
            key={feature.id}
            featureId={feature.id}
            slug={feature.slug}
            title={localised(feature.title, locale)}
            status={feature.status}
            itemCount={feature.items.length}
            initialLines={feature.items
              .map((item) =>
                [item.photograph.slug, item.caption.en ?? '', item.caption.th ?? '']
                  .join(' | ')
                  .replace(/( \| )+$/, ''),
              )
              .join('\n')}
          />
        ))
      )}
    </div>
  );
}
