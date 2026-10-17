'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { precisionLabel } from '@/lib/geo';
import { formatCoordinates, formatDate, formatFileSize } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/types/domain';

import { STEP_META, type StepId, type UploadDraft } from './use-upload-draft';

/**
 * Step 6 — review, then the rights declaration.
 *
 * Every value the member entered is read back here, grouped by the step that
 * owns it, with a control that takes them straight back to that step. Nothing
 * is editable in place: a review surface that can be edited is not a review,
 * and a member who changes a title here would never see the step that explains
 * what the title does.
 *
 * The declaration is the only mandatory thing on the page. It starts unticked,
 * it is never pre-ticked by anything, and `publishPhotograph` checks it again
 * on the server and stamps the moment it was given — so a tick in this browser
 * is a statement by the member, not the thing that authorises publication.
 */

function Section({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: StepId;
  onEdit: (step: StepId) => void;
  children: ReactNode;
}) {
  const meta = STEP_META[step];

  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="text-title font-semibold tracking-tight">{title}</h3>
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)}>
          Change
          <span className="sr-only">{` ${title.toLowerCase()} — back to step ${meta.number}, ${meta.title}`}</span>
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-3.5 sm:grid-cols-[11rem_1fr]">{children}</dl>
    </section>
  );
}

/** One reviewed value. A blank one says so rather than rendering an empty cell. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  const given = value !== null && value !== undefined && value !== '';

  return (
    <>
      <dt className="text-meta font-bold text-muted uppercase sm:pt-px">{label}</dt>
      <dd className={given ? 'text-body text-ink' : 'text-body text-muted-soft'}>
        {given ? value : 'Not given'}
      </dd>
    </>
  );
}

export function StepReview({ draft }: { draft: UploadDraft }) {
  const { state, errors } = draft;
  const { capture, editing, proposal } = state;

  // Both halves have to be real numbers before they are formatted: a half-typed
  // coordinate would otherwise be read back to the member as "NaN° N".
  const latitude = Number(proposal.latitude);
  const longitude = Number(proposal.longitude);
  const proposedPoint =
    proposal.latitude.trim().length > 0 &&
    proposal.longitude.trim().length > 0 &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? formatCoordinates(latitude, longitude, 5)
      : '';

  const capturedLabel = state.publishCapturedAt ? formatDate(state.exif?.capturedAt) : null;

  return (
    <div>
      <h2 className="text-section font-bold">Check it over</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        This is everything FRAME is about to store. Nothing has been uploaded yet, so a change here
        costs you nothing.
      </p>

      <div className="mt-8">
        <Section title="Photograph" step="file" onEdit={draft.goTo}>
          <Row label="File" value={state.file?.name ?? ''} />
          <Row
            label="Size"
            value={state.file ? formatFileSize(state.file.size) : ''}
          />
          <Row
            label="Dimensions"
            value={
              state.exif?.width && state.exif.height
                ? `${state.exif.width} × ${state.exif.height} pixels, as the file reports them`
                : ''
            }
          />
        </Section>

        {state.previewUrl ? (
          <div className="pb-6">
            {/* A local object URL cannot be optimised, and nothing has left the
                machine yet, so the review preview is a plain element. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.previewUrl}
              alt={
                state.altText.trim().length > 0
                  ? state.altText
                  : 'The photograph you have chosen. You have not written alt text for it yet.'
              }
              className="max-h-72 w-auto rounded-media border border-line object-contain"
            />
          </div>
        ) : null}

        <Section title="Description" step="describe" onEdit={draft.goTo}>
          <Row label="Title" value={state.title} />
          <Row
            label="Category"
            value={state.category === '' ? '' : CATEGORY_LABELS[state.category]}
          />
          <Row label="Alt text" value={state.altText} />
          <Row label="Description" value={state.description} />
        </Section>

        <Section title="Place" step="place" onEdit={draft.goTo}>
          {state.placeMode === 'existing' ? (
            <>
              <Row label="Approved place" value={state.location?.name ?? ''} />
              <Row
                label="Where"
                value={
                  state.location ? `${state.location.city}, ${state.location.country}` : ''
                }
              />
            </>
          ) : state.placeMode === 'propose' ? (
            <>
              <Row label="Proposed place" value={proposal.proposedName} />
              <Row
                label="Where"
                value={
                  [proposal.city, proposal.country, proposal.countryCode.toUpperCase()]
                    .filter((part) => part.trim().length > 0)
                    .join(', ') || ''
                }
              />
              <Row label="Point" value={proposedPoint} />
              <Row label="Note for the moderator" value={proposal.note} />
              <Row
                label="Status"
                value="Queued for a moderator. Your photograph publishes now; the place appears once it is approved."
              />
            </>
          ) : (
            <Row
              label="Place"
              value="None. The photograph publishes without a location, and you can add one later without re-uploading."
            />
          )}
        </Section>

        <Section title="Camera" step="gear" onEdit={draft.goTo}>
          <Row label="Camera" value={[capture.cameraBrand, capture.cameraModel].filter(Boolean).join(' ')} />
          <Row label="Lens" value={[capture.lensBrand, capture.lensModel].filter(Boolean).join(' ')} />
        </Section>

        <Section title="Settings" step="settings" onEdit={draft.goTo}>
          <Row
            label="Focal length"
            value={capture.focalLengthMm === '' ? '' : `${capture.focalLengthMm} mm`}
          />
          <Row label="Aperture" value={capture.aperture === '' ? '' : `f/${capture.aperture}`} />
          <Row label="Shutter speed" value={capture.shutterSpeed} />
          <Row label="ISO" value={capture.iso} />
          <Row label="Editing software" value={editing.software} />
          <Row label="Editing notes" value={editing.notes} />
          <Row
            label="Capture date"
            value={
              capturedLabel ??
              (state.exif?.capturedAt
                ? 'Withheld. The file records a date and you chose not to publish it.'
                : '')
            }
          />
        </Section>

        <Section title="Position in the file" step="place" onEdit={draft.goTo}>
          <Row
            label="Camera GPS"
            value={
              state.exif?.gps
                ? state.gpsChoice === 'used'
                  ? 'The file records a position and you used it to start your proposal. It is stored with your consent recorded against it, and it is never published as an exact point.'
                  : 'The file records a position. You chose to leave it out, so it is not stored.'
                : 'The file records no position.'
            }
          />
        </Section>
      </div>

      <section
        aria-labelledby="rights-declaration"
        className="mt-4 rounded-panel border border-line-strong bg-surface p-6"
      >
        <h3 id="rights-declaration" className="text-title font-semibold tracking-tight">
          Rights declaration
        </h3>
        <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
          FRAME publishes photographs on the strength of this one statement, so it is worth reading
          rather than skipping.
        </p>

        <ul className="mt-4 max-w-prose space-y-2.5 text-caption leading-relaxed text-ink-soft">
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-line-strong" />
            You are the photographer, or you hold written permission from the photographer to
            publish this work.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-line-strong" />
            You keep your copyright. Publishing here transfers nothing.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-line-strong" />
            You grant FRAME only the licence it needs to display the work on the platform and to
            promote the platform with it — nothing wider.
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-line-strong" />
            Any commercial or advertising use needs separate permission from you, asked for and
            agreed each time.
          </li>
        </ul>

        <p className="mt-4 text-caption text-muted">
          The full terms are at{' '}
          <Link href="/legal/copyright" className="font-semibold text-ink underline">
            the copyright policy
          </Link>
          .
        </p>

        <CheckboxField
          className="mt-5"
          checked={state.rightsConfirmed}
          onChange={(event) => draft.update({ rightsConfirmed: event.target.checked })}
          error={errors.rightsConfirmed}
          label="I am the photographer or hold permission to publish this work, and I grant FRAME the licence described above."
          description="FRAME records the moment you tick this and checks it again on the server before anything is published."
        />
      </section>

      {state.placeMode === 'propose' ? (
        <Notice tone="info" title="Two things are being sent" className="mt-5">
          <p>
            Your photograph, which publishes as soon as it has been processed, and your proposed
            place, which waits for a moderator. A published point is rounded to{' '}
            {precisionLabel(LOCATION_POLICY.publicCoordinateDecimals)} rather than shown exactly.
          </p>
        </Notice>
      ) : null}
    </div>
  );
}
