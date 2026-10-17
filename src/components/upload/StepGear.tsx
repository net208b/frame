'use client';

import { FileDigit } from 'lucide-react';
import type { ReactNode } from 'react';

import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';

import type { CaptureFields, UploadDraft } from './use-upload-draft';

/**
 * Step 4 — the camera and the lens.
 *
 * Everything here is optional, and everything here is a prefill the member can
 * overwrite. A field filled in from the file says so in words, so a member can
 * tell what they wrote from what their camera wrote — and once they edit it,
 * the marker comes off, because it is their value now.
 *
 * None of this is proof of anything. EXIF is written by whatever software
 * touched the file last.
 */

/**
 * The "read from the file" marker, shared with step 5.
 *
 * It lives here rather than in a file of its own because steps 4 and 5 are the
 * only two places in the app that prefill from a camera, and a marker that
 * reads differently on the two halves of the same readout would be worse than
 * one import between neighbours.
 */
export function PrefilledHint({
  prefilled,
  children,
}: {
  prefilled: boolean;
  children?: ReactNode;
}): ReactNode {
  if (!prefilled) return children ?? null;

  return (
    <>
      <span className="inline-flex items-center gap-1 font-bold text-ink-soft">
        <FileDigit className="size-3" aria-hidden />
        Read from the file
      </span>
      {children ? <> — {children}</> : null}
    </>
  );
}

interface GearInput {
  field: keyof CaptureFields;
  label: string;
  placeholder: string;
  hint?: string;
  maxLength: number;
}

const INPUTS: GearInput[] = [
  { field: 'cameraBrand', label: 'Camera brand', placeholder: 'Fujifilm', maxLength: 60 },
  { field: 'cameraModel', label: 'Camera model', placeholder: 'X100V', maxLength: 80 },
  {
    field: 'lensBrand',
    label: 'Lens brand',
    placeholder: 'Voigtländer',
    hint: 'Leave blank for a fixed lens, or if it is the same as the camera.',
    maxLength: 60,
  },
  { field: 'lensModel', label: 'Lens model', placeholder: '35mm f/1.4 Nokton', maxLength: 80 },
];

export function StepGear({ draft }: { draft: UploadDraft }) {
  const { state, errors } = draft;
  const anyPrefilled = INPUTS.some((input) => draft.isPrefilled(input.field));

  return (
    <div>
      <h2 className="text-section font-bold">Camera and lens</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        All optional. Filling it in is what makes the gear filters on Discover useful to somebody
        deciding what to carry.
      </p>

      {state.exifStatus === 'read' && !anyPrefilled ? (
        <Notice tone="info" className="mt-5">
          This file recorded no camera or lens, so nothing has been filled in. Type what you used,
          or leave it blank.
        </Notice>
      ) : null}

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        {INPUTS.map((input) => (
          <TextField
            key={input.field}
            label={input.label}
            value={state.capture[input.field]}
            maxLength={input.maxLength}
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

      <p className="mt-6 max-w-prose text-meta leading-relaxed text-muted">
        If your camera is not one FRAME already lists, what you type is kept exactly as you wrote
        it. Nobody is asked to pretend they shot something else.
      </p>
    </div>
  );
}
