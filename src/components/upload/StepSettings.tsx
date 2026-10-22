'use client';

import { useTranslations } from 'next-intl';

import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { MAX_PHOTOGRAPHY_STYLES, PHOTOGRAPHY_STYLES } from '@/types/domain';

import { useUploadFormat } from './format';
import { PrefilledHint } from './StepGear';
import type { CaptureFields, UploadDraft } from './use-upload-draft';

/**
 * Step 5 — exposure and editing.
 *
 * Same contract as step 4: everything optional, everything prefilled from the
 * file is marked as such, and everything can be overwritten. Exposure is the
 * one field that is rewritten rather than merely accepted — `1/250s`, `0.004`
 * and `1/250` all mean the same thing, so the wizard normalises it and shows
 * the member the form FRAME will publish before they leave the step.
 *
 * The capture date is the exception to "all optional": it is a privacy
 * question, not a camera setting. A file recording when it was taken is not
 * consent to tell the world, so the box starts unticked and the date is
 * dropped unless the member ticks it.
 *
 * The exposure terms stay as photographers write them in both languages: the
 * aperture is an f-number, the shutter speed is 1/250, and ISO is ISO. The
 * copy around them is translated; the notation is not, because inventing Thai
 * notation for f/1.4 would make the field harder to fill in, not easier.
 */

interface ExposureInput {
  field: keyof CaptureFields;
  /** Message keys, relative to the `upload` namespace. */
  labelKey: string;
  placeholderKey: string;
  hintKey: string;
  inputMode: 'decimal' | 'numeric';
}

const INPUTS: ExposureInput[] = [
  {
    field: 'focalLengthMm',
    labelKey: 'settings.focalLengthLabel',
    placeholderKey: 'settings.focalLengthPlaceholder',
    hintKey: 'settings.focalLengthHint',
    inputMode: 'numeric',
  },
  {
    field: 'aperture',
    labelKey: 'settings.apertureLabel',
    placeholderKey: 'settings.aperturePlaceholder',
    hintKey: 'settings.apertureHint',
    inputMode: 'decimal',
  },
  {
    field: 'shutterSpeed',
    labelKey: 'settings.shutterSpeedLabel',
    placeholderKey: 'settings.shutterSpeedPlaceholder',
    hintKey: 'settings.shutterSpeedHint',
    inputMode: 'decimal',
  },
  {
    field: 'iso',
    labelKey: 'settings.isoLabel',
    placeholderKey: 'settings.isoPlaceholder',
    hintKey: 'settings.isoHint',
    inputMode: 'numeric',
  },
];

const SOFTWARE_MAX = 80;
const NOTES_MAX = 1_200;
const EXPLANATION_MAX = 1_200;

export function StepSettings({ draft }: { draft: UploadDraft }) {
  const t = useTranslations('upload');
  const common = useTranslations('common');
  const format = useUploadFormat();
  const { state, errors } = draft;
  const anyPrefilled = INPUTS.some((input) => draft.isPrefilled(input.field));
  const capturedAt = state.exif?.capturedAt ?? null;
  const capturedLabel = format.date(capturedAt);

  return (
    <div>
      <h2 className="text-section font-bold">{t('settings.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">{t('settings.lead')}</p>

      {state.exifStatus === 'read' && !anyPrefilled ? (
        <Notice tone="info" className="mt-5">
          {t('settings.noneRead')}
        </Notice>
      ) : null}

      <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {INPUTS.map((input) => (
          <TextField
            key={input.field}
            label={t(input.labelKey)}
            value={state.capture[input.field]}
            inputMode={input.inputMode}
            onChange={(event) => draft.updateCapture({ [input.field]: event.target.value })}
            error={errors[input.field]}
            placeholder={t(input.placeholderKey)}
            autoComplete="off"
            hint={
              <PrefilledHint prefilled={draft.isPrefilled(input.field)}>
                {t(input.hintKey)}
              </PrefilledHint>
            }
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <TextField
          label={t('settings.editingSoftwareLabel')}
          value={state.editing.software}
          maxLength={SOFTWARE_MAX}
          onChange={(event) => draft.updateEditing({ software: event.target.value })}
          error={errors.editingSoftware}
          hint={t('settings.editingSoftwareHint')}
          placeholder={t('settings.editingSoftwarePlaceholder')}
          autoComplete="off"
        />

        {/* How the frame was made — the same eight words a photographer uses
            for themselves in Settings, because "I shoot black and white" and
            "this frame is black and white" are the same word. Not its subject:
            that is the category, chosen in the previous step. */}
        <fieldset className="min-w-0">
          <legend className="text-caption font-semibold text-ink">
            {t('settings.stylesLabel')}
          </legend>
          <p className="mt-1 text-meta text-muted">{t('settings.stylesHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PHOTOGRAPHY_STYLES.map((style) => {
              const chosen = state.styles.includes(style);
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() =>
                    draft.update({
                      styles: chosen
                        ? state.styles.filter((value) => value !== style)
                        : [...state.styles, style].slice(0, MAX_PHOTOGRAPHY_STYLES),
                    })
                  }
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-meta font-semibold transition-colors duration-150',
                    chosen
                      ? 'border-ink bg-ink text-on-ink'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {common(`photographyStyles.${style}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Before the shutter. It sits above the editing notes because that is
            the order the work happened in, and because a reader of the page
            meets it in that order too: what you were doing, then what you did
            to the file afterwards. */}
        <TextAreaField
          label={t('settings.explanationLabel')}
          rows={4}
          maxLength={EXPLANATION_MAX}
          value={state.explanation}
          onChange={(event) => draft.update({ explanation: event.target.value })}
          error={errors.explanation}
          hint={t('settings.explanationHint')}
          placeholder={t('settings.explanationPlaceholder')}
        />

        <TextAreaField
          label={t('settings.editingNotesLabel')}
          rows={4}
          maxLength={NOTES_MAX}
          value={state.editing.notes}
          onChange={(event) => draft.updateEditing({ notes: event.target.value })}
          error={errors.editingNotes}
          hint={t('settings.editingNotesHint')}
          placeholder={t('settings.editingNotesPlaceholder')}
        />
      </div>

      <section
        aria-labelledby="capture-date"
        className="mt-8 rounded-panel border border-line bg-surface p-5"
      >
        <h3 id="capture-date" className="text-title font-semibold tracking-tight">
          {t('settings.captureDateHeading')}
        </h3>

        {capturedAt === null || capturedLabel === null ? (
          <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
            {t('settings.captureDateNone')}
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
              {t('settings.captureDateBody', { date: capturedLabel })}
            </p>
            <CheckboxField
              className="mt-4"
              checked={state.publishCapturedAt}
              onChange={(event) => draft.update({ publishCapturedAt: event.target.checked })}
              label={t('settings.captureDatePublish', { date: capturedLabel })}
              description={t('settings.captureDateDescription')}
            />
          </>
        )}
      </section>
    </div>
  );
}
