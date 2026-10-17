'use client';

import { ImageUp, Upload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/states';
import { UPLOAD_POLICY } from '@/lib/config';
import { describeExifGpsPolicy } from '@/lib/images/exif';
import { cn, formatFileSize } from '@/lib/utils';

import { validateStep, type UploadDraft } from './use-upload-draft';

/**
 * Step 1 — the file.
 *
 * The checks here are a courtesy, not a control: a declared media type and a
 * reported size come from the browser and can be anything. They exist so a
 * member finds out in a second rather than after a 25 MB upload, and the page
 * says as much, because a check that looks like a guarantee is worse than no
 * check at all.
 */

const ACCEPT = [...UPLOAD_POLICY.acceptedMimeTypes, ...UPLOAD_POLICY.acceptedExtensions].join(',');

function readableFormats(): string {
  return UPLOAD_POLICY.acceptedExtensions
    .filter((extension) => extension !== '.jpeg')
    .map((extension) => extension.replace('.', '').toUpperCase())
    .join(', ');
}

export function StepChooseFile({ draft }: { draft: UploadDraft }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { state } = draft;

  // Shown as soon as a file is chosen rather than waiting for a step attempt:
  // the member has just done something, and the answer is already known.
  const fileError = state.file ? validateStep('file', state).file : draft.errors.file;

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    draft.setFile(event.dataTransfer.files[0] ?? null);
  };

  const exif = state.exif;
  const readFacts =
    exif === null
      ? []
      : [
          exif.cameraBrand || exif.cameraModel
            ? [exif.cameraBrand, exif.cameraModel].filter(Boolean).join(' ')
            : null,
          exif.lensModel,
          exif.focalLengthMm === null ? null : `${exif.focalLengthMm} mm`,
          exif.aperture === null ? null : `f/${exif.aperture}`,
          exif.shutterSpeed,
          exif.iso === null ? null : `ISO ${exif.iso}`,
        ].filter((fact): fact is string => typeof fact === 'string' && fact.length > 0);

  return (
    <div>
      <h2 className="text-section font-bold">Choose the photograph</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        One photograph per upload. {readableFormats()} files up to{' '}
        {formatFileSize(UPLOAD_POLICY.maxFileBytes)}, at least {UPLOAD_POLICY.minPixelWidth} by{' '}
        {UPLOAD_POLICY.minPixelHeight} pixels.
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="peer sr-only"
        onChange={(event) => draft.setFile(event.target.files?.[0] ?? null)}
      />

      {/* The label is the whole drop zone, so a pointer click anywhere on it
          opens the picker and the keyboard reaches the real input behind it. */}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'mt-6 flex cursor-pointer flex-col items-center justify-center rounded-panel border border-dashed px-6 py-14 text-center',
          'transition-colors duration-150',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
          dragging ? 'border-ink bg-surface' : 'border-line-strong bg-surface hover:border-ink',
          fileError && 'border-danger',
        )}
      >
        <ImageUp className="size-7 text-muted" aria-hidden />
        <span className="mt-4 text-title font-semibold tracking-tight">
          {state.file ? 'Choose a different photograph' : 'Drop a photograph here'}
        </span>
        <span className="mt-1.5 text-caption text-muted">
          or press Enter to browse your files
        </span>
      </label>

      {fileError ? (
        <p role="alert" className="mt-3 text-meta font-semibold text-danger">
          {fileError}
        </p>
      ) : null}

      <p className="mt-4 max-w-prose text-meta leading-relaxed text-muted">
        These two checks run in your browser, so they are a convenience rather than a control.
        FRAME reads the real contents of the file on the server after it arrives, and refuses
        anything that is not a photograph it can publish — whatever the file was named or said it
        was.
      </p>

      {state.file && state.previewUrl ? (
        <section aria-labelledby="chosen-file" className="mt-8">
          <h3 id="chosen-file" className="text-eyebrow text-muted uppercase">
            Chosen file
          </h3>

          <div className="mt-3 flex flex-wrap items-start gap-5 rounded-card border border-line bg-surface p-4">
            {/* A local object URL cannot be optimised by next/image, and nothing
                has been uploaded yet, so this preview is a plain element. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.previewUrl}
              alt={`Preview of ${state.file.name}, the photograph you have chosen to upload`}
              className="h-32 w-32 rounded-media object-cover"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{state.file.name}</p>
              <p className="mt-1 text-meta text-muted">
                {formatFileSize(state.file.size)}
                {state.file.type ? ` · ${state.file.type}` : ''}
                {exif?.width && exif.height ? ` · ${exif.width} × ${exif.height} px` : ''}
              </p>

              <p aria-live="polite" className="mt-3 text-meta leading-relaxed text-ink-soft">
                {state.exifStatus === 'reading'
                  ? 'Reading the camera metadata…'
                  : state.exifStatus === 'read' && readFacts.length > 0
                    ? `Read from the file: ${readFacts.join(' · ')}. You can change any of it later.`
                    : state.exifStatus === 'read'
                      ? 'This file carries no camera metadata. That is common and nothing is wrong — you can type the details in yourself.'
                      : ''}
              </p>

              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                iconLeft={<Upload className="size-3.5" aria-hidden />}
                onClick={() => inputRef.current?.click()}
              >
                Replace this file
              </Button>
            </div>
          </div>

          {exif?.gps ? (
            <Notice tone="info" title="This file records where it was taken" className="mt-4">
              <p>
                {describeExifGpsPolicy()} You will be asked about it on the place step, and nothing
                happens with it unless you choose it there.
              </p>
            </Notice>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
