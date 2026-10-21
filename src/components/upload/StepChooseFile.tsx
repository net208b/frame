'use client';

import { ImageUp, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/states';
import { UPLOAD_POLICY } from '@/lib/config';
import { assessCameraEvidence } from '@/lib/images/exif-gate';
import { cn } from '@/lib/utils';

import { useUploadFormat } from './format';
import type { UploadDraft } from './use-upload-draft';

/**
 * Step 1 — the file.
 *
 * The checks here are a courtesy, not a control: a declared media type and a
 * reported size come from the browser and can be anything. They exist so a
 * member finds out in a second rather than after a 25 MB upload, and the page
 * says as much, because a check that looks like a guarantee is worse than no
 * check at all.
 *
 * Every limit on this step is read from `UPLOAD_POLICY` and formatted through
 * the active locale. None of it is written into the copy, in either language:
 * a figure typed into a sentence is a second source of truth that stops
 * agreeing with the server the day the limit moves.
 */

const ACCEPT = [...UPLOAD_POLICY.acceptedMimeTypes, ...UPLOAD_POLICY.acceptedExtensions].join(',');

/**
 * The accepted formats as a photographer names them, rather than as media
 * types. Not translated: JPG and AVIF are the same four letters in every
 * language, and a localised list of file formats would be an invention.
 */
function readableFormats(): string {
  return UPLOAD_POLICY.acceptedExtensions
    .filter((extension) => extension !== '.jpeg')
    .map((extension) => extension.replace('.', '').toUpperCase())
    .join(', ');
}

export function StepChooseFile({ draft }: { draft: UploadDraft }) {
  const t = useTranslations('upload');
  const format = useUploadFormat();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { state } = draft;

  // Shown as soon as a file is chosen rather than waiting for a step attempt:
  // the member has just done something, and the answer is already known.
  const fileError = state.file ? draft.immediateErrors.file : draft.errors.file;

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    draft.setFile(event.dataTransfer.files[0] ?? null);
  };

  const exif = state.exif;

  // The camera-only rule, run here on the browser's readout so the member
  // learns before uploading what the server will decide after, from the same
  // policy. The server's reading of the uploaded bytes is the one that counts.
  const gate =
    state.exifStatus === 'read' && exif
      ? assessCameraEvidence(exif, { filmDeclared: state.filmDeclared })
      : null;
  const gateMissing =
    gate && gate.missing.length > 0
      ? gate.missing.map((field) => t(`exifGate.fields.${field}`)).join(', ')
      : '';

  const readFacts =
    exif === null
      ? []
      : [
          exif.cameraBrand || exif.cameraModel
            ? [exif.cameraBrand, exif.cameraModel].filter(Boolean).join(' ')
            : null,
          exif.lensModel,
          exif.focalLengthMm === null
            ? null
            : t('file.focalLengthFact', { value: format.plain(exif.focalLengthMm) }),
          exif.aperture === null
            ? null
            : t('file.apertureFact', { value: format.plain(exif.aperture) }),
          exif.shutterSpeed,
          exif.iso === null ? null : t('file.isoFact', { value: format.plain(exif.iso) }),
        ].filter((fact): fact is string => typeof fact === 'string' && fact.length > 0);

  // The size, the declared type and the pixel dimensions are three facts rather
  // than a sentence, so they are joined with a separator rather than written
  // into a message where a translator would have to keep the punctuation.
  const fileFacts =
    state.file === null
      ? []
      : [
          format.fileSize(state.file.size),
          state.file.type,
          exif?.width && exif.height
            ? t('file.dimensions', {
                width: format.plain(exif.width),
                height: format.plain(exif.height),
              })
            : null,
        ].filter((fact): fact is string => typeof fact === 'string' && fact.length > 0);

  return (
    <div>
      <h2 className="text-section font-bold">{t('file.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        {t('file.lead', {
          formats: readableFormats(),
          size: format.fileSize(UPLOAD_POLICY.maxFileBytes),
          width: format.plain(UPLOAD_POLICY.minPixelWidth),
          height: format.plain(UPLOAD_POLICY.minPixelHeight),
        })}
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
          {state.file ? t('file.dropZoneReplace') : t('file.dropZone')}
        </span>
        <span className="mt-1.5 text-caption text-muted">{t('file.browseHint')}</span>
      </label>

      {fileError ? (
        <p role="alert" className="mt-3 text-meta font-semibold text-danger">
          {fileError}
        </p>
      ) : null}

      <p className="mt-4 max-w-prose text-meta leading-relaxed text-muted">
        {t('file.clientCheckNote')}
      </p>

      {state.file && state.previewUrl ? (
        <section aria-labelledby="chosen-file" className="mt-8">
          <h3 id="chosen-file" className="text-eyebrow text-muted uppercase">
            {t('file.chosenFile')}
          </h3>

          <div className="mt-3 flex flex-wrap items-start gap-5 rounded-card border border-line bg-surface p-4">
            {/* A local object URL cannot be optimised by next/image, and nothing
                has been uploaded yet, so this preview is a plain element. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.previewUrl}
              alt={t('file.previewAlt', { fileName: state.file.name })}
              className="h-32 w-32 rounded-media object-cover"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{state.file.name}</p>
              <p className="mt-1 text-meta text-muted">{fileFacts.join(' · ')}</p>

              <p aria-live="polite" className="mt-3 text-meta leading-relaxed text-ink-soft">
                {state.exifStatus === 'reading'
                  ? t('file.exifReading')
                  : state.exifStatus === 'read' && readFacts.length > 0
                    ? t('file.exifRead', { facts: readFacts.join(' · ') })
                    : state.exifStatus === 'read'
                      ? t('file.exifNone')
                      : ''}
              </p>

              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                iconLeft={<Upload className="size-3.5" aria-hidden />}
                onClick={() => inputRef.current?.click()}
              >
                {t('file.replace')}
              </Button>
            </div>
          </div>

          {gate ? (
            gate.verdict === 'camera' ? (
              <Notice tone="success" title={t('exifGate.passTitle')} className="mt-4">
                <p>{t('exifGate.passBody')}</p>
              </Notice>
            ) : gate.verdict === 'film' ? (
              <Notice tone="info" title={t('exifGate.filmTitle')} className="mt-4">
                <p>{t('exifGate.filmBody')}</p>
              </Notice>
            ) : (
              <Notice tone="warning" title={t('exifGate.failTitle')} className="mt-4">
                <p>
                  {gate.deviceClass === 'phone'
                    ? t('exifGate.failPhone')
                    : t('exifGate.failMissing', { fields: gateMissing })}{' '}
                  {t('exifGate.rule')}
                </p>
              </Notice>
            )
          ) : null}

          {exif?.gps ? (
            <Notice tone="info" title={t('exifGps.title')} className="mt-4">
              {/* Two sentences, two messages, a space between them — which is
                  also how Thai separates them. The first is the policy itself
                  and is shared verbatim with the place step. */}
              <p>
                {t('exifGps.policy')} {t('exifGps.onFileStep')}
              </p>
            </Notice>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
