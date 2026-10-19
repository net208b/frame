'use client';

import { FileDigit } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
 *
 * The dash between the marker and the field's own hint stays in the markup
 * rather than going into a message: it joins two labels, and a translator given
 * "{marker} — {hint}" would have to keep punctuation they cannot see the use
 * of. Both halves are messages in their own right.
 */
export function PrefilledHint({
  prefilled,
  children,
}: {
  prefilled: boolean;
  children?: ReactNode;
}): ReactNode {
  const t = useTranslations('upload');

  if (!prefilled) return children ?? null;

  return (
    <>
      <span className="inline-flex items-center gap-1 font-bold text-ink-soft">
        <FileDigit className="size-3" aria-hidden />
        {t('prefilled.label')}
      </span>
      {children ? <> — {children}</> : null}
    </>
  );
}

interface GearInput {
  field: keyof CaptureFields;
  /** Message keys, relative to the `upload` namespace. */
  labelKey: string;
  placeholderKey: string;
  hintKey?: string;
  maxLength: number;
}

const INPUTS: GearInput[] = [
  {
    field: 'cameraBrand',
    labelKey: 'gear.cameraBrandLabel',
    placeholderKey: 'gear.cameraBrandPlaceholder',
    maxLength: 60,
  },
  {
    field: 'cameraModel',
    labelKey: 'gear.cameraModelLabel',
    placeholderKey: 'gear.cameraModelPlaceholder',
    maxLength: 80,
  },
  {
    field: 'lensBrand',
    labelKey: 'gear.lensBrandLabel',
    placeholderKey: 'gear.lensBrandPlaceholder',
    hintKey: 'gear.lensBrandHint',
    maxLength: 60,
  },
  {
    field: 'lensModel',
    labelKey: 'gear.lensModelLabel',
    placeholderKey: 'gear.lensModelPlaceholder',
    maxLength: 80,
  },
];

export function StepGear({ draft }: { draft: UploadDraft }) {
  const t = useTranslations('upload');
  const { state, errors } = draft;
  const anyPrefilled = INPUTS.some((input) => draft.isPrefilled(input.field));

  return (
    <div>
      <h2 className="text-section font-bold">{t('gear.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">{t('gear.lead')}</p>

      {state.exifStatus === 'read' && !anyPrefilled ? (
        <Notice tone="info" className="mt-5">
          {t('gear.noneRead')}
        </Notice>
      ) : null}

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        {INPUTS.map((input) => (
          <TextField
            key={input.field}
            label={t(input.labelKey)}
            value={state.capture[input.field]}
            maxLength={input.maxLength}
            onChange={(event) => draft.updateCapture({ [input.field]: event.target.value })}
            error={errors[input.field]}
            placeholder={t(input.placeholderKey)}
            autoComplete="off"
            hint={
              <PrefilledHint prefilled={draft.isPrefilled(input.field)}>
                {input.hintKey ? t(input.hintKey) : undefined}
              </PrefilledHint>
            }
          />
        ))}
      </div>

      <p className="mt-6 max-w-prose text-meta leading-relaxed text-muted">{t('gear.note')}</p>
    </div>
  );
}
