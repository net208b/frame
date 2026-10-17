'use client';

import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

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
 */

interface ExposureInput {
  field: keyof CaptureFields;
  label: string;
  placeholder: string;
  hint: string;
  inputMode: 'decimal' | 'numeric';
}

const INPUTS: ExposureInput[] = [
  {
    field: 'focalLengthMm',
    label: 'Focal length',
    placeholder: '35',
    hint: 'In millimetres, as written on the lens.',
    inputMode: 'numeric',
  },
  {
    field: 'aperture',
    label: 'Aperture',
    placeholder: '2',
    hint: 'The f-number alone — 2 for f/2, 5.6 for f/5.6.',
    inputMode: 'decimal',
  },
  {
    field: 'shutterSpeed',
    label: 'Shutter speed',
    placeholder: '1/250',
    hint: 'Write it as 1/250 below a second, or as 4s at or above one.',
    inputMode: 'decimal',
  },
  {
    field: 'iso',
    label: 'ISO',
    placeholder: '800',
    hint: 'The sensitivity the camera was set to.',
    inputMode: 'numeric',
  },
];

const SOFTWARE_MAX = 80;
const NOTES_MAX = 1_200;

export function StepSettings({ draft }: { draft: UploadDraft }) {
  const { state, errors } = draft;
  const anyPrefilled = INPUTS.some((input) => draft.isPrefilled(input.field));
  const capturedAt = state.exif?.capturedAt ?? null;
  const capturedLabel = formatDate(capturedAt);

  return (
    <div>
      <h2 className="text-section font-bold">Exposure and editing</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        How the frame was exposed, and what you did to it afterwards. All optional, and all of it
        useful to somebody trying to work out how a photograph was made.
      </p>

      {state.exifStatus === 'read' && !anyPrefilled ? (
        <Notice tone="info" className="mt-5">
          This file recorded no exposure settings, so nothing has been filled in. Type what you
          remember, or leave it blank — a guess written as a fact is worse than a gap.
        </Notice>
      ) : null}

      <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {INPUTS.map((input) => (
          <TextField
            key={input.field}
            label={input.label}
            value={state.capture[input.field]}
            inputMode={input.inputMode}
            onChange={(event) => draft.updateCapture({ [input.field]: event.target.value })}
            error={errors[input.field]}
            placeholder={input.placeholder}
            autoComplete="off"
            hint={
              <PrefilledHint prefilled={draft.isPrefilled(input.field)}>{input.hint}</PrefilledHint>
            }
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <TextField
          label="Editing software"
          value={state.editing.software}
          maxLength={SOFTWARE_MAX}
          onChange={(event) => draft.updateEditing({ software: event.target.value })}
          error={errors.editingSoftware}
          hint="Lightroom, Capture One, Darktable, the camera's own film simulation — whatever you used."
          placeholder="Capture One 23"
          autoComplete="off"
        />

        <TextAreaField
          label="Editing notes"
          rows={4}
          maxLength={NOTES_MAX}
          value={state.editing.notes}
          onChange={(event) => draft.updateEditing({ notes: event.target.value })}
          error={errors.editingNotes}
          hint="What you changed and why. This is the part other photographers read most closely."
          placeholder="Lifted the shadows about a stop, pulled the greens out of the fluorescent light, no crop."
        />
      </div>

      <section
        aria-labelledby="capture-date"
        className="mt-8 rounded-panel border border-line bg-surface p-5"
      >
        <h3 id="capture-date" className="text-title font-semibold tracking-tight">
          The date in the file
        </h3>

        {capturedAt === null || capturedLabel === null ? (
          <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
            This file does not say when it was taken, so there is no date to publish or withhold.
            The date FRAME shows on the photograph is the day you published it.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
              Your camera recorded this frame as taken on {capturedLabel}. A capture date can place
              a person somewhere on a particular evening, so FRAME leaves it out unless you ask for
              it. The camera carries no time zone, so the date is read as your camera’s own clock.
            </p>
            <CheckboxField
              className="mt-4"
              checked={state.publishCapturedAt}
              onChange={(event) => draft.update({ publishCapturedAt: event.target.checked })}
              label={`Publish the capture date, ${capturedLabel}`}
              description="Leave this unticked and the date stays off the photograph and out of its record."
            />
          </>
        )}
      </section>
    </div>
  );
}
