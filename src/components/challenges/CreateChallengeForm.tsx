'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import { createChallenge } from '@/server/actions/challenges';

/**
 * Setting a new challenge. Dates are entered as UTC — the page says so — and
 * sent as ISO instants, so what staff type is exactly when it opens and
 * closes for everybody, wherever they are.
 */

function toUtcIso(local: string): string {
  // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" with no zone; it is
  // read as UTC on purpose, matching the label.
  return local ? `${local}:00Z` : '';
}

export function CreateChallengeForm() {
  const t = useTranslations('challenges.desk');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    slug: '',
    titleEn: '',
    titleTh: '',
    briefEn: '',
    briefTh: '',
    opensAt: '',
    closesAt: '',
    maxEntries: '3',
    requiresNewWork: false,
  });

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  function submit() {
    startTransition(async () => {
      const result = await createChallenge({
        ...form,
        opensAt: toUtcIso(form.opensAt),
        closesAt: toUtcIso(form.closesAt),
      });
      if (result.ok) {
        toast.show(t('created'), 'success');
        setErrors({});
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <section aria-labelledby="create-challenge" className="rounded-panel border border-line bg-surface p-5 lg:p-7">
      <h2 id="create-challenge" className="text-title font-bold">
        {t('createTitle')}
      </h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <TextField label={t('slug')} hint={t('slugHint')} value={form.slug} error={errors.slug}
          onChange={(event) => set({ slug: event.target.value })} maxLength={80} />
        <TextField label={t('maxEntries')} type="number" min={1} max={5} value={form.maxEntries}
          error={errors.maxEntries} onChange={(event) => set({ maxEntries: event.target.value })} />
        <TextField label={t('titleEn')} value={form.titleEn} error={errors.titleEn}
          onChange={(event) => set({ titleEn: event.target.value })} maxLength={80} />
        <TextField label={t('titleTh')} value={form.titleTh} error={errors.titleTh}
          onChange={(event) => set({ titleTh: event.target.value })} maxLength={80} />
        <TextAreaField label={t('briefEn')} value={form.briefEn} error={errors.briefEn}
          onChange={(event) => set({ briefEn: event.target.value })} maxLength={1200} />
        <TextAreaField label={t('briefTh')} value={form.briefTh} error={errors.briefTh}
          onChange={(event) => set({ briefTh: event.target.value })} maxLength={1200} />
        <TextField label={t('opensAt')} type="datetime-local" value={form.opensAt} error={errors.opensAt}
          onChange={(event) => set({ opensAt: event.target.value })} />
        <TextField label={t('closesAt')} type="datetime-local" value={form.closesAt} error={errors.closesAt}
          onChange={(event) => set({ closesAt: event.target.value })} />
      </div>
      <div className="mt-5">
        <CheckboxField
          label={t('newWork')}
          description={t('newWorkHint')}
          checked={form.requiresNewWork}
          onChange={(event) => set({ requiresNewWork: event.target.checked })}
        />
      </div>
      <p className="mt-4 text-meta text-muted">{t('utcNote')}</p>
      <Button className="mt-5" loading={pending} onClick={submit}>
        {t('create')}
      </Button>
    </section>
  );
}
