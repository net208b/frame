'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { CheckboxField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { LOCATION_POLICY } from '@/lib/config';
import { formatCoordinates } from '@/lib/utils';

import { useUploadFormat } from './format';
import { stepNumber, type StepId, type UploadDraft } from './use-upload-draft';

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
 *
 * Its four clauses say the same four things in both languages: the member is
 * the photographer or holds permission, they keep their copyright, FRAME is
 * granted only the licence it needs to display and promote the work here, and
 * commercial or advertising use needs separate permission each time. That is
 * what a member is agreeing to, so no clause is compressed in translation.
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
  const t = useTranslations('upload');

  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="text-title font-semibold tracking-tight">{title}</h3>
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)}>
          {t('review.change')}
          <span className="sr-only">
            {t('review.changeSr', {
              section: title,
              number: stepNumber(step),
              step: t(`steps.${step}.title`),
            })}
          </span>
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-3.5 sm:grid-cols-[11rem_1fr]">{children}</dl>
    </section>
  );
}

/** One reviewed value. A blank one says so rather than rendering an empty cell. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  const t = useTranslations('upload');
  const given = value !== null && value !== undefined && value !== '';

  return (
    <>
      <dt className="text-meta font-bold text-muted uppercase sm:pt-px">{label}</dt>
      <dd className={given ? 'text-body text-ink' : 'text-body text-muted-soft'}>
        {given ? value : t('review.notGiven')}
      </dd>
    </>
  );
}

export function StepReview({ draft }: { draft: UploadDraft }) {
  const t = useTranslations('upload');
  const taxonomy = useTranslations('taxonomy');
  const format = useUploadFormat();
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

  const capturedLabel = state.publishCapturedAt ? format.date(state.exif?.capturedAt) : null;

  return (
    <div>
      <h2 className="text-section font-bold">{t('review.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">{t('review.lead')}</p>

      <div className="mt-8">
        <Section title={t('review.sectionPhotograph')} step="file" onEdit={draft.goTo}>
          <Row label={t('review.rowFile')} value={state.file?.name ?? ''} />
          <Row
            label={t('review.rowSize')}
            value={state.file ? format.fileSize(state.file.size) : ''}
          />
          <Row
            label={t('review.rowDimensions')}
            value={
              state.exif?.width && state.exif.height
                ? t('review.valueDimensions', {
                    width: format.plain(state.exif.width),
                    height: format.plain(state.exif.height),
                  })
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
                  : t('review.previewAltFallback')
              }
              className="max-h-72 w-auto rounded-media border border-line object-contain"
            />
          </div>
        ) : null}

        <Section title={t('review.sectionDescription')} step="describe" onEdit={draft.goTo}>
          <Row label={t('review.rowTitle')} value={state.title} />
          <Row
            label={t('review.rowCategory')}
            value={state.category === '' ? '' : taxonomy(`category.${state.category}`)}
          />
          <Row label={t('review.rowAltText')} value={state.altText} />
          <Row label={t('review.rowDescription')} value={state.description} />
        </Section>

        <Section title={t('review.sectionPlace')} step="place" onEdit={draft.goTo}>
          {state.placeMode === 'existing' ? (
            <>
              <Row label={t('review.rowApprovedPlace')} value={state.location?.name ?? ''} />
              <Row
                label={t('review.rowWhere')}
                value={state.location ? `${state.location.city}, ${state.location.country}` : ''}
              />
            </>
          ) : state.placeMode === 'propose' ? (
            <>
              <Row label={t('review.rowProposedPlace')} value={proposal.proposedName} />
              <Row
                label={t('review.rowWhere')}
                value={
                  [proposal.city, proposal.country, proposal.countryCode.toUpperCase()]
                    .filter((part) => part.trim().length > 0)
                    .join(', ') || ''
                }
              />
              <Row label={t('review.rowPoint')} value={proposedPoint} />
              <Row label={t('review.rowModeratorNote')} value={proposal.note} />
              <Row label={t('review.rowStatus')} value={t('review.valueProposalStatus')} />
            </>
          ) : (
            <Row label={t('review.sectionPlace')} value={t('review.valueNoPlace')} />
          )}
        </Section>

        <Section title={t('review.sectionCamera')} step="gear" onEdit={draft.goTo}>
          <Row
            label={t('review.rowCamera')}
            value={[capture.cameraBrand, capture.cameraModel].filter(Boolean).join(' ')}
          />
          <Row
            label={t('review.rowLens')}
            value={[capture.lensBrand, capture.lensModel].filter(Boolean).join(' ')}
          />
        </Section>

        <Section title={t('review.sectionSettings')} step="settings" onEdit={draft.goTo}>
          <Row
            label={t('review.rowFocalLength')}
            value={
              capture.focalLengthMm === ''
                ? ''
                : t('review.valueFocalLength', { value: capture.focalLengthMm })
            }
          />
          <Row
            label={t('review.rowAperture')}
            value={
              capture.aperture === ''
                ? ''
                : t('review.valueAperture', { value: capture.aperture })
            }
          />
          <Row label={t('review.rowShutterSpeed')} value={capture.shutterSpeed} />
          <Row label={t('review.rowIso')} value={capture.iso} />
          <Row label={t('review.rowEditingSoftware')} value={editing.software} />
          <Row label={t('review.rowEditingNotes')} value={editing.notes} />
          <Row
            label={t('review.rowCaptureDate')}
            value={
              capturedLabel ??
              (state.exif?.capturedAt ? t('review.valueCaptureDateWithheld') : '')
            }
          />
        </Section>

        <Section title={t('review.sectionExifPosition')} step="place" onEdit={draft.goTo}>
          <Row
            label={t('review.rowCameraGps')}
            value={
              state.exif?.gps
                ? state.gpsChoice === 'used'
                  ? t('review.valueGpsUsed')
                  : t('review.valueGpsDeclined')
                : t('review.valueGpsNone')
            }
          />
        </Section>
      </div>

      <section
        aria-labelledby="rights-declaration"
        className="mt-4 rounded-panel border border-line-strong bg-surface p-6"
      >
        <h3 id="rights-declaration" className="text-title font-semibold tracking-tight">
          {t('review.rightsHeading')}
        </h3>
        <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted">
          {t('review.rightsIntro')}
        </p>

        <ul className="mt-4 max-w-prose space-y-2.5 text-caption leading-relaxed text-ink-soft">
          {(
            [
              'review.rightsAuthor',
              'review.rightsCopyright',
              'review.rightsLicence',
              'review.rightsCommercial',
            ] as const
          ).map((key) => (
            <li key={key} className="flex gap-2.5">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-line-strong" />
              {t(key)}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-caption text-muted">
          {t.rich('review.rightsTerms', {
            link: (chunks: ReactNode) => (
              <Link href="/legal/copyright" className="font-semibold text-ink underline">
                {chunks}
              </Link>
            ),
          })}
        </p>

        <CheckboxField
          className="mt-5"
          checked={state.rightsConfirmed}
          onChange={(event) => draft.update({ rightsConfirmed: event.target.checked })}
          error={errors.rightsConfirmed}
          label={t('review.rightsConfirm')}
          description={t('review.rightsConfirmDescription')}
        />
      </section>

      {state.placeMode === 'propose' ? (
        <Notice tone="info" title={t('review.twoThingsTitle')} className="mt-5">
          <p>
            {t('review.twoThingsBody', {
              precision: format.precision(LOCATION_POLICY.publicCoordinateDecimals),
            })}
          </p>
        </Notice>
      ) : null}
    </div>
  );
}
