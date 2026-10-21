'use client';

import { ArrowDown, ArrowUp, ArrowUpRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useActionState, useState } from 'react';

import { keepTypedValues } from '@/components/account/keep-typed-values';
import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Link } from '@/i18n/navigation';
import { SERIES_LIMITS } from '@/lib/validation/series';
import { cn } from '@/lib/utils';
import { deleteSeries, saveSeries } from '@/server/actions/series';

/**
 * The series editor: pick the frames, put them in order, caption them, write
 * the words, choose the cover.
 *
 * The frames are a list with a caption under each, posted as `items[]` and
 * `captions[]` in the same order so the schema can zip them. Nothing here
 * decides what may be a frame: the candidates are the member's own published
 * photographs, and the trigger in migration 0020 refuses anything else.
 */

type SaveState = Awaited<ReturnType<typeof saveSeries>> | null;
type DeleteState = Awaited<ReturnType<typeof deleteSeries>> | null;

export interface SeriesCandidate {
  id: string;
  title: string;
  thumbUrl: string;
}

export interface SeriesFormValues {
  title: string;
  standfirst: string;
  body: string;
  cover: string | null;
  visibility: 'public' | 'unlisted';
  items: Array<{ id: string; caption: string }>;
}

export function SeriesForm({
  candidates,
  initial,
  seriesId,
  existingSlug,
  disabled = false,
}: {
  candidates: readonly SeriesCandidate[];
  initial: SeriesFormValues;
  seriesId: string | null;
  existingSlug: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations('account');
  const [saveState, saveAction, saving] = useActionState<SaveState, FormData>(saveSeries, null);
  const [deleteState, deleteAction, deleting] = useActionState<DeleteState, FormData>(deleteSeries, null);
  const errorFor = useFieldErrors(saveState);

  const [items, setItems] = useState(initial.items);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const chosen = items.filter((item) => byId.has(item.id));
  const available = candidates.filter((candidate) => !items.some((item) => item.id === candidate.id));
  const full = items.length >= SERIES_LIMITS.maxItems;
  const short = Math.max(0, SERIES_LIMITS.minItems - items.length);

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
  };
  const setCaption = (id: string, caption: string) =>
    setItems(items.map((item) => (item.id === id ? { ...item, caption } : item)));

  return (
    <div className="space-y-8">
      <form action={saveAction} onSubmit={keepTypedValues(saveAction)} className="space-y-6">
        {seriesId ? <input type="hidden" name="seriesId" value={seriesId} /> : null}
        <FormStatus state={saveState}>
          {saveState?.ok ? (
            <FormSuccess title={saveState.message ?? ''}>
              <Link href={`/series/${saveState.data.slug}`} className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-2">
                {t('series.open')}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </FormSuccess>
          ) : null}
        </FormStatus>

        <fieldset disabled={disabled || saving || deleting} className="space-y-6">
          {/* ---- Frames ---- */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-meta font-bold text-ink">{t('series.items')}</p>
              <p className="text-meta text-muted tabular-nums">
                {t('series.itemsCount', { count: items.length, max: SERIES_LIMITS.maxItems })}
              </p>
            </div>

            {chosen.length > 0 ? (
              <ol className="grid gap-2">
                {chosen.map((item, index) => {
                  const candidate = byId.get(item.id)!;
                  return (
                    <li key={item.id} className="rounded-card border border-line bg-surface p-2">
                      {/* The hidden pair is the series: same order, same index. */}
                      <input type="hidden" name="items[]" value={item.id} />
                      <input type="hidden" name="captions[]" value={item.caption} />
                      <div className="flex items-center gap-3">
                        <span className="w-6 shrink-0 text-center text-meta font-bold tabular-nums text-muted">{index + 1}</span>
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-[6px] bg-surface-sunken">
                          <Image src={candidate.thumbUrl} alt="" fill sizes="56px" className="object-cover" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-caption">{candidate.title}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="grid size-8 place-items-center rounded-pill border border-line text-ink-soft hover:border-line-strong disabled:opacity-30">
                            <ArrowUp aria-hidden className="size-4" />
                            <span className="sr-only">{t('series.moveUp')}</span>
                          </button>
                          <button type="button" onClick={() => move(index, 1)} disabled={index === chosen.length - 1} className="grid size-8 place-items-center rounded-pill border border-line text-ink-soft hover:border-line-strong disabled:opacity-30">
                            <ArrowDown aria-hidden className="size-4" />
                            <span className="sr-only">{t('series.moveDown')}</span>
                          </button>
                          <button type="button" onClick={() => setItems(items.filter((entry) => entry.id !== item.id))} className="grid size-8 place-items-center rounded-pill border border-line text-ink-soft hover:border-danger hover:text-danger">
                            <X aria-hidden className="size-4" />
                            <span className="sr-only">{t('series.remove')}</span>
                          </button>
                        </span>
                      </div>
                      <label className="mt-2 block">
                        <span className="sr-only">{t('series.caption')}</span>
                        <input
                          type="text"
                          value={item.caption}
                          maxLength={SERIES_LIMITS.caption}
                          onChange={(event) => setCaption(item.id, event.target.value)}
                          placeholder={t('series.captionPlaceholder')}
                          className="w-full rounded-field border border-line bg-paper px-3 py-2 text-caption text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none"
                        />
                      </label>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            <p className={cn('text-meta leading-relaxed', short > 0 ? 'text-ink-soft' : 'text-muted')}>
              {short > 0 ? t('series.itemsNeedMore', { count: short }) : full ? t('series.itemsFull') : t('series.itemsHint')}
            </p>
            {errorFor('items') ? <p className="text-meta font-semibold text-danger">{errorFor('items')}</p> : null}
            {errorFor('captions') ? <p className="text-meta font-semibold text-danger">{errorFor('captions')}</p> : null}

            {available.length > 0 ? (
              <div className="space-y-2">
                <p className="text-meta text-muted">{t('series.candidates')}</p>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {available.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        disabled={full}
                        onClick={() => setItems([...items, { id: candidate.id, caption: '' }])}
                        className="group relative block aspect-square w-full overflow-hidden rounded-[6px] border border-line bg-surface-sunken disabled:opacity-40"
                      >
                        <Image src={candidate.thumbUrl} alt={candidate.title} fill sizes="(max-width: 640px) 22vw, 96px" className="object-cover motion-safe:transition-transform group-hover:scale-105" />
                        <span className="sr-only">{t('series.add', { title: candidate.title })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-caption text-muted">{t('series.noCandidates')}</p>
            ) : null}
          </div>

          {/* ---- Words ---- */}
          <TextField
            label={t('series.title')}
            name="title"
            defaultValue={initial.title}
            maxLength={SERIES_LIMITS.title}
            required
            error={errorFor('title')}
            hint={existingSlug ? t('series.titleHintExisting', { slug: existingSlug }) : t('series.titleHint')}
          />
          <TextField
            label={t('series.standfirst')}
            name="standfirst"
            defaultValue={initial.standfirst}
            maxLength={SERIES_LIMITS.standfirst}
            error={errorFor('standfirst')}
            hint={t('series.standfirstHint')}
          />
          <TextAreaField
            label={t('series.body')}
            name="body"
            defaultValue={initial.body}
            maxLength={SERIES_LIMITS.body}
            rows={10}
            error={errorFor('body')}
            hint={t('series.bodyHint')}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label={t('series.cover')} name="cover" defaultValue={initial.cover ?? ''} hint={t('series.coverHint')}>
              <option value="">{t('series.coverFirst')}</option>
              {chosen.map((item) => (
                <option key={item.id} value={item.id}>
                  {byId.get(item.id)!.title}
                </option>
              ))}
            </SelectField>
            <SelectField label={t('series.visibility')} name="visibility" defaultValue={initial.visibility} hint={t('series.visibilityHint')}>
              <option value="unlisted">{t('series.visibilityUnlisted')}</option>
              <option value="public">{t('series.visibilityPublic')}</option>
            </SelectField>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving}>
              {saving ? t('series.submitPending') : existingSlug ? t('series.submitUpdate') : t('series.submit')}
            </Button>
          </div>
        </fieldset>
      </form>

      {seriesId && existingSlug ? (
        <form action={deleteAction} className="space-y-3 border-t border-line pt-6">
          <input type="hidden" name="seriesId" value={seriesId} />
          <FormStatus state={deleteState} />
          <p className="text-caption text-muted">{t('series.deleteHint')}</p>
          <Button type="submit" variant="ghost" loading={deleting} disabled={disabled || saving}>
            {deleting ? t('series.deleting') : t('series.delete')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
