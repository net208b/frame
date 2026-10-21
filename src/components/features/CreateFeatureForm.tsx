'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import { createFeature } from '@/server/actions/editorial';

/** Starting a feature: a draft with its address, titles and introductions. */
export function CreateFeatureForm() {
  const t = useTranslations('features.desk');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ slug: '', titleEn: '', titleTh: '', introEn: '', introTh: '' });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  function submit() {
    startTransition(async () => {
      const result = await createFeature(form);
      if (result.ok) {
        toast.show(t('created'), 'success');
        setErrors({});
        setForm({ slug: '', titleEn: '', titleTh: '', introEn: '', introTh: '' });
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <section aria-labelledby="create-feature" className="rounded-panel border border-line bg-surface p-5 lg:p-7">
      <h2 id="create-feature" className="text-title font-bold">
        {t('createTitle')}
      </h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <TextField label={t('slug')} hint={t('slugHint')} value={form.slug} error={errors.slug}
          onChange={(event) => set({ slug: event.target.value })} maxLength={80} wrapperClassName="md:col-span-2" />
        <TextField label={t('titleEn')} value={form.titleEn} error={errors.titleEn}
          onChange={(event) => set({ titleEn: event.target.value })} maxLength={100} />
        <TextField label={t('titleTh')} value={form.titleTh} error={errors.titleTh}
          onChange={(event) => set({ titleTh: event.target.value })} maxLength={100} />
        <TextAreaField label={t('introEn')} value={form.introEn} error={errors.introEn} rows={6}
          onChange={(event) => set({ introEn: event.target.value })} maxLength={3000} />
        <TextAreaField label={t('introTh')} value={form.introTh} error={errors.introTh} rows={6}
          onChange={(event) => set({ introTh: event.target.value })} maxLength={3000} />
      </div>
      <Button className="mt-5" loading={pending} onClick={submit}>
        {t('create')}
      </Button>
    </section>
  );
}
