'use client';

import { ArrowDown, ArrowUp, ArrowUpRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useActionState, useState } from 'react';

import { keepTypedValues } from '@/components/account/keep-typed-values';
import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { PHOTOBOOK_COVER_PRESETS } from '@/components/photobook/covers';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Link } from '@/i18n/navigation';
import { PHOTOBOOK_LIMITS } from '@/lib/validation/photobook';
import { cn } from '@/lib/utils';
import { deletePhotobook, savePhotobook } from '@/server/actions/photobook';
import {
  PHOTOBOOK_GEAR_MODES,
  PHOTOBOOK_PAPERS,
  type PhotobookCover,
  type PhotobookGearMode,
  type PhotobookPaper,
} from '@/types/domain';

/**
 * The photobook editor: pick the frames, put them in order, choose the cover.
 *
 * THE PAGES ARE A LIST, NOT A GRID OF CHECKBOXES. A book has an order and the
 * order is the point, so the member builds the list page by page: tap a frame
 * to add it to the end, move it up or down, take it out. The list is posted as
 * repeated `pages[]` hidden fields in that order, which is what the schema
 * reads and the database writes with positions.
 *
 * NOTHING HERE DECIDES WHAT MAY BE A PAGE. The candidates are the member's
 * own published photographs, because that is what the page handed over, and the
 * trigger in migration 0018 refuses anything else whatever this form sends.
 *
 * Uncontrolled where it can be (title, dedication, selects) so the form works
 * before hydration; the page list needs state because order is interaction.
 */

type SaveState = Awaited<ReturnType<typeof savePhotobook>> | null;
type DeleteState = Awaited<ReturnType<typeof deletePhotobook>> | null;

export interface PhotobookCandidate {
  id: string;
  title: string;
  thumbUrl: string;
}

export interface PhotobookFormValues {
  title: string;
  dedication: string;
  cover: PhotobookCover;
  paper: PhotobookPaper;
  gearMode: PhotobookGearMode;
  gearBrand: string;
  gearModel: string;
  visibility: 'public' | 'unlisted';
  /** Photograph ids in page order. */
  pages: string[];
}

export function PhotobookForm({
  candidates,
  initial,
  bookId,
  existingSlug,
  brands,
  disabled = false,
}: {
  candidates: readonly PhotobookCandidate[];
  initial: PhotobookFormValues;
  /** The book on the shelf this form edits; null binds a new one. */
  bookId: string | null;
  /** Set when a book already exists: its address does not change on save. */
  existingSlug: string | null;
  /** Brand names to suggest; the member may type any other. */
  brands: readonly string[];
  disabled?: boolean;
}) {
  const t = useTranslations('account');
  const common = useTranslations('common');
  const [saveState, saveAction, saving] = useActionState<SaveState, FormData>(savePhotobook, null);
  const [deleteState, deleteAction, deleting] = useActionState<DeleteState, FormData>(
    deletePhotobook,
    null,
  );
  const errorFor = useFieldErrors(saveState);

  const [pages, setPages] = useState<string[]>(initial.pages);
  const [gearMode, setGearMode] = useState<PhotobookGearMode>(initial.gearMode);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const chosen = pages.map((id) => byId.get(id)).filter((c): c is PhotobookCandidate => Boolean(c));
  const available = candidates.filter((candidate) => !pages.includes(candidate.id));
  const full = pages.length >= PHOTOBOOK_LIMITS.maxPages;
  const short = Math.max(0, PHOTOBOOK_LIMITS.minPages - pages.length);

  const move = (index: number, delta: number) => {
    const next = [...pages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setPages(next);
  };

  const savedSlug = saveState?.ok ? saveState.data.slug : existingSlug;

  return (
    <div className="space-y-8">
      <form action={saveAction} onSubmit={keepTypedValues(saveAction)} className="space-y-6">
        {/* Which book this is. Absent on a new one; the action checks the
            id is the member's own before it writes a word. */}
        {bookId ? <input type="hidden" name="bookId" value={bookId} /> : null}
        <FormStatus state={saveState}>
          {saveState?.ok ? (
            <FormSuccess title={saveState.message ?? ''}>
              <Link
                href={`/books/${saveState.data.slug}`}
                className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-2"
              >
                {t('photobook.open')}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </FormSuccess>
          ) : null}
        </FormStatus>

        <fieldset disabled={disabled || saving || deleting} className="space-y-6">
          {/* ---- Pages ---- */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-meta font-bold text-ink">{t('photobook.pages')}</p>
              <p className="text-meta text-muted tabular-nums">
                {t('photobook.pagesCount', { count: pages.length, max: PHOTOBOOK_LIMITS.maxPages })}
              </p>
            </div>

            {/* The hidden fields are the book: the order they are rendered in
                is the order the server writes. */}
            {pages.map((id) => (
              <input key={id} type="hidden" name="pages[]" value={id} />
            ))}

            {chosen.length > 0 ? (
              <ol className="grid gap-2">
                {chosen.map((candidate, index) => (
                  <li
                    key={candidate.id}
                    className="flex items-center gap-3 rounded-card border border-line bg-surface p-2"
                  >
                    <span className="w-6 shrink-0 text-center text-meta font-bold tabular-nums text-muted">
                      {index + 1}
                    </span>
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-[6px] bg-surface-sunken">
                      <Image src={candidate.thumbUrl} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-caption">{candidate.title}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="grid size-8 place-items-center rounded-pill border border-line text-ink-soft hover:border-line-strong disabled:opacity-30"
                      >
                        <ArrowUp aria-hidden className="size-4" />
                        <span className="sr-only">{t('photobook.moveUp')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === chosen.length - 1}
                        className="grid size-8 place-items-center rounded-pill border border-line text-ink-soft hover:border-line-strong disabled:opacity-30"
                      >
                        <ArrowDown aria-hidden className="size-4" />
                        <span className="sr-only">{t('photobook.moveDown')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPages(pages.filter((id) => id !== candidate.id))}
                        className="grid size-8 place-items-center rounded-pill border border-line text-ink-soft hover:border-danger hover:text-danger"
                      >
                        <X aria-hidden className="size-4" />
                        <span className="sr-only">{t('photobook.remove')}</span>
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            <p className={cn('text-meta leading-relaxed', short > 0 ? 'text-ink-soft' : 'text-muted')}>
              {short > 0
                ? t('photobook.pagesNeedMore', { count: short })
                : full
                  ? t('photobook.pagesFull')
                  : t('photobook.pagesHint')}
            </p>
            {errorFor('pages') ? (
              <p className="text-meta font-semibold text-danger">{errorFor('pages')}</p>
            ) : null}

            {available.length > 0 ? (
              <div className="space-y-2">
                <p className="text-meta text-muted">{t('photobook.candidates')}</p>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {available.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        disabled={full}
                        onClick={() => setPages([...pages, candidate.id])}
                        className="group relative block aspect-square w-full overflow-hidden rounded-[6px] border border-line bg-surface-sunken disabled:opacity-40"
                      >
                        <Image
                          src={candidate.thumbUrl}
                          alt={candidate.title}
                          fill
                          sizes="(max-width: 640px) 22vw, 96px"
                          className="object-cover motion-safe:transition-transform group-hover:scale-105"
                        />
                        <span className="sr-only">{t('photobook.add', { title: candidate.title })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-caption text-muted">{t('photobook.noCandidates')}</p>
            ) : null}
          </div>

          {/* ---- Words ---- */}
          <TextField
            label={t('photobook.title')}
            name="title"
            required
            maxLength={PHOTOBOOK_LIMITS.title}
            defaultValue={initial.title}
            hint={
              existingSlug
                ? t('photobook.titleHintExisting', { slug: existingSlug })
                : t('photobook.titleHint')
            }
            error={errorFor('title')}
          />
          <TextAreaField
            label={t('photobook.dedication')}
            name="dedication"
            rows={2}
            maxLength={PHOTOBOOK_LIMITS.dedication}
            defaultValue={initial.dedication}
            hint={t('photobook.dedicationHint', { max: PHOTOBOOK_LIMITS.dedication })}
            error={errorFor('dedication')}
          />

          {/* ---- Cover ---- */}
          <fieldset>
            <legend className="mb-1.5 block text-meta font-bold text-ink">{t('photobook.cover')}</legend>
            <p className="mb-3 text-meta leading-relaxed text-muted">{t('photobook.coverHint')}</p>
            <div className="grid grid-cols-5 gap-2">
              {PHOTOBOOK_COVER_PRESETS.map((preset) => (
                <label
                  key={preset.id}
                  className="grid cursor-pointer gap-1.5 rounded-[8px] border border-line p-1.5 has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink"
                >
                  <input
                    type="radio"
                    name="cover"
                    value={preset.id}
                    defaultChecked={preset.id === initial.cover}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="block aspect-[5/7] w-full rounded-[4px]"
                    style={{ background: preset.chip, boxShadow: `inset 0 0 0 1px ${preset.ink}33` }}
                  />
                  <span className="text-center text-[11px] leading-tight">{common(`photobookCovers.${preset.id}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <SelectField label={t('photobook.paper')} name="paper" defaultValue={initial.paper}>
              {PHOTOBOOK_PAPERS.map((paper) => (
                <option key={paper} value={paper}>
                  {common(`photobookPapers.${paper}`)}
                </option>
              ))}
            </SelectField>

            <SelectField
              label={t('photobook.visibility')}
              name="visibility"
              defaultValue={initial.visibility}
              hint={t('photobook.visibilityHint')}
            >
              <option value="unlisted">{t('photobook.visibilityUnlisted')}</option>
              <option value="public">{t('photobook.visibilityPublic')}</option>
            </SelectField>
          </div>

          {/* ---- Gear on the cover ---- */}
          <fieldset className="grid gap-4">
            <legend className="mb-1.5 block text-meta font-bold text-ink">{t('photobook.gear')}</legend>
            <p className="text-meta leading-relaxed text-muted">{t('photobook.gearHint')}</p>
            <SelectField
              label={t('photobook.gearMode')}
              name="gearMode"
              defaultValue={initial.gearMode}
              onChange={(event) => setGearMode(event.currentTarget.value as PhotobookGearMode)}
            >
              {PHOTOBOOK_GEAR_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`photobook.gearModes.${mode}`)}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('photobook.gearBrand')}
                name="gearBrand"
                list="photobook-brands"
                maxLength={PHOTOBOOK_LIMITS.gear}
                defaultValue={initial.gearBrand}
                disabled={gearMode === 'none'}
                autoComplete="off"
              />
              <datalist id="photobook-brands">
                {brands.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
              <TextField
                label={t('photobook.gearModel')}
                name="gearModel"
                maxLength={PHOTOBOOK_LIMITS.gear}
                defaultValue={initial.gearModel}
                disabled={gearMode !== 'model'}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" loading={saving}>
              {saving ? t('photobook.submitPending') : existingSlug ? t('photobook.submitUpdate') : t('photobook.submit')}
            </Button>
            {savedSlug ? (
              <Link href={`/books/${savedSlug}`} className="text-caption font-semibold text-ink underline underline-offset-2">
                {t('photobook.open')}
              </Link>
            ) : null}
          </div>
        </fieldset>
      </form>

      {bookId && existingSlug ? (
        <form action={deleteAction} className="space-y-3 border-t border-line pt-6">
          <input type="hidden" name="bookId" value={bookId} />
          <FormStatus state={deleteState} />
          <p className="text-caption text-muted">{t('photobook.deleteHint')}</p>
          <Button type="submit" variant="ghost" loading={deleting} disabled={disabled || saving}>
            {deleting ? t('photobook.deleting') : t('photobook.delete')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
