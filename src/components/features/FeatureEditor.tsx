'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { Link, useRouter } from '@/i18n/navigation';
import { publishFeature, saveFeatureItems } from '@/server/actions/editorial';
import { FEATURE_MIN_ITEMS } from '@/types/domain';

/**
 * Composing one feature: its photographs as lines, in order, and the switch
 * that puts it up or takes it down. The lines are the piece — saving replaces
 * the whole sequence at once, so what is in the box is exactly what readers
 * will see.
 */
export function FeatureEditor({
  featureId,
  slug,
  title,
  status,
  initialLines,
  itemCount,
}: {
  featureId: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  initialLines: string;
  itemCount: number;
}) {
  const t = useTranslations('features.desk');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState(initialLines);
  const [error, setError] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      const result = await saveFeatureItems({ featureId, lines });
      if (result.ok) {
        setError(null);
        toast.show(result.message ?? t('saved'), 'success');
        router.refresh();
      } else {
        setError(result.fieldErrors?.lines ?? result.error);
        toast.show(result.error, 'danger');
      }
    });
  }

  function setPublished(publish: boolean) {
    startTransition(async () => {
      const result = await publishFeature({ featureId, publish });
      if (result.ok) {
        toast.show(result.message ?? t('saved'), 'success');
        router.refresh();
      } else {
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <section className="rounded-panel border border-line bg-surface p-5 lg:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-title font-bold">{title}</h3>
        <span className="text-meta text-muted">
          {status === 'published' ? t('statusPublished') : t('statusDraft')} ·{' '}
          <Link href={`/features/${slug}`} className="underline underline-offset-2 hover:text-ink">
            {t('view')}
          </Link>
        </span>
      </div>
      <TextAreaField
        label={t('lines')}
        hint={t('linesHint')}
        value={lines}
        rows={8}
        error={error}
        onChange={(event) => setLines(event.target.value)}
        wrapperClassName="mt-4"
        className="font-mono text-caption"
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" loading={pending} onClick={save}>
          {t('savePhotographs')}
        </Button>
        {status === 'published' ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPublished(false)}>
            {t('takeDown')}
          </Button>
        ) : (
          <Button size="sm" disabled={pending || itemCount < FEATURE_MIN_ITEMS} onClick={() => setPublished(true)}>
            {t('publish')}
          </Button>
        )}
        {status === 'draft' && itemCount < FEATURE_MIN_ITEMS ? (
          <span className="text-caption text-muted">{t('needsThree', { count: FEATURE_MIN_ITEMS })}</span>
        ) : null}
      </div>
    </section>
  );
}
