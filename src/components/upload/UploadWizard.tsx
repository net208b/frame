'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import {
  STEP_COUNT,
  stepNumber,
  useUploadDraft,
} from '@/components/upload/use-upload-draft';

import { StepChooseFile } from './StepChooseFile';
import { StepDescribe } from './StepDescribe';
import { StepGear } from './StepGear';
import { StepPlace } from './StepPlace';
import { StepReview } from './StepReview';
import { StepSettings } from './StepSettings';
import { StepSubmit } from './StepSubmit';
import { WizardProgress } from './WizardProgress';

/**
 * The seven-step wizard.
 *
 * It owns the rail, the step the member is on and the two controls that move
 * between steps; everything else belongs to the step components and to
 * `useUploadDraft`. The last step is the exception: it runs the submission, so
 * it carries its own controls and this shell stands back rather than offering a
 * "continue" that would have nowhere to go.
 *
 * Values can be revisited in any order the member has already reached, and
 * nothing is lost by going back. Nothing is written to `localStorage` either:
 * the chosen `File` cannot be serialised with the rest, so a restored draft
 * would be a form full of the member's words with no photograph in it.
 */
export function UploadWizard({ uploadsConfigured }: { uploadsConfigured: boolean }) {
  const t = useTranslations('upload');
  const common = useTranslations('common');
  const draft = useUploadDraft();
  const messages = Object.entries(draft.errors);
  const onSubmitStep = draft.step === 'submit';

  return (
    <div>
      <WizardProgress
        current={draft.step}
        furthestIndex={draft.furthestIndex}
        // Once the photograph has been published or sent for review, no earlier
        // step is offered again: walking back and submitting a second time
        // would rewrite a published record from a form that is now history.
        locked={draft.submitted}
        onSelect={draft.goTo}
        className="mt-8"
      />

      <p aria-live="polite" className="mt-5 text-meta text-muted">
        {/* One sentence, one message: the step's name and its summary go in as
            values rather than being concatenated, so a translator can put them
            where the sentence needs them. */}
        {t('progress.announce', {
          number: stepNumber(draft.step),
          total: STEP_COUNT,
          title: t(`steps.${draft.step}.title`),
          summary: t(`steps.${draft.step}.summary`),
        })}
      </p>

      <div className="mt-7 animate-fade-in" key={draft.step}>
        {draft.step === 'file' ? <StepChooseFile draft={draft} /> : null}
        {draft.step === 'describe' ? <StepDescribe draft={draft} /> : null}
        {draft.step === 'place' ? <StepPlace draft={draft} /> : null}
        {draft.step === 'gear' ? <StepGear draft={draft} /> : null}
        {draft.step === 'settings' ? <StepSettings draft={draft} /> : null}
        {draft.step === 'review' ? <StepReview draft={draft} /> : null}
        {draft.step === 'submit' ? (
          <StepSubmit draft={draft} uploadsConfigured={uploadsConfigured} />
        ) : null}
      </div>

      {onSubmitStep ? null : (
        <>
          {messages.length > 0 ? (
            <div
              role="alert"
              className="mt-8 rounded-card bg-danger-bg px-4 py-3 text-caption leading-relaxed"
            >
              <p className="font-bold text-danger">
                {t('nav.errorsHeading', { count: messages.length })}
              </p>
              <ul className="mt-1.5 space-y-1 text-ink-soft">
                {messages.map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-2.5 border-t border-line pt-6">
            <Button
              variant="secondary"
              onClick={draft.back}
              disabled={draft.stepIndex === 0}
              iconLeft={<ArrowLeft className="size-3.5" aria-hidden />}
            >
              {common('back')}
            </Button>

            <Button
              variant="accent"
              onClick={draft.next}
              iconRight={<ArrowRight className="size-3.5" aria-hidden />}
            >
              {draft.step === 'review' ? t('nav.confirmAndContinue') : t('nav.continue')}
            </Button>

            <p className="text-meta text-muted">
              {draft.step === 'review'
                ? t('nav.nextUploadsFile')
                : t('nav.nothingUploadedYet')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
