'use client';

import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState, type ReactNode } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import type { ActionCode } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { submitLocation } from '@/server/actions/locations';
import {
  attachVariants,
  createDraft,
  discardDraft,
  publishPhotograph,
} from '@/server/actions/upload';
import type { PublicationStatus, UploadSignal } from '@/types/domain';

import { useUploadFormat } from './format';
import {
  draftPayload,
  proposalPayload,
  publishPayload,
  type UploadDraft,
} from './use-upload-draft';

/**
 * Step 7 — send it, and watch what actually happens.
 *
 * Five things happen in order and each one is reported as it finishes: the
 * draft record, the signed grant, the bytes going to storage, the server-side
 * check and resize, and publication. The percentage comes from the XHR upload
 * progress event, which means it describes real bytes on the wire rather than
 * a timer pretending to be one.
 *
 * Nothing here reports a success it did not get. Every stage either completes
 * or stops the sequence with the server's own message and something to do
 * about it, and a photograph held for review says so in those words rather
 * than being dressed up as published.
 *
 * Two kinds of sentence appear in this step and they are not interchangeable.
 * The ones this page writes — the stages, what to do about each kind of
 * refusal, what happened in the end — come from the message catalogue and are
 * in the language the page is in. The ones a server action or image storage
 * wrote come back as strings on the result and are shown as they arrived: a
 * refusal is evidence of what happened, and paraphrasing it into another
 * language here would be this page inventing a reason it was not given.
 */

/* ------------------------------------------------------------------------ */
/* Stages                                                                    */
/* ------------------------------------------------------------------------ */

const STAGES = ['draft', 'grant', 'upload', 'process', 'publish', 'place'] as const;
type Stage = (typeof STAGES)[number];

/** Message keys, relative to the `upload` namespace. */
const STAGE_KEYS: Record<Stage, { title: string; detail: string }> = {
  draft: { title: 'submit.stageDraftTitle', detail: 'submit.stageDraftDetail' },
  grant: { title: 'submit.stageGrantTitle', detail: 'submit.stageGrantDetail' },
  upload: { title: 'submit.stageUploadTitle', detail: 'submit.stageUploadDetail' },
  process: { title: 'submit.stageProcessTitle', detail: 'submit.stageProcessDetail' },
  publish: { title: 'submit.stagePublishTitle', detail: 'submit.stagePublishDetail' },
  place: { title: 'submit.stagePlaceTitle', detail: 'submit.stagePlaceDetail' },
};

interface Failure {
  /** Already in the reader's language, or the server's own words verbatim. */
  message: string;
  code: ActionCode;
  stage: Stage;
  /** Per-field messages, when the refusal named fields rather than the form. */
  fieldErrors?: Record<string, string>;
}

interface Outcome {
  slug: string;
  status: PublicationStatus;
  signals: UploadSignal[];
}

/** What a member can do about each kind of refusal. */
const GUIDANCE_KEYS: Record<ActionCode, string> = {
  not_configured: 'submit.guidanceNotConfigured',
  unauthenticated: 'submit.guidanceUnauthenticated',
  forbidden: 'submit.guidanceForbidden',
  rate_limited: 'submit.guidanceRateLimited',
  validation: 'submit.guidanceValidation',
  conflict: 'submit.guidanceConflict',
  not_found: 'submit.guidanceNotFound',
  unknown: 'submit.guidanceUnknown',
};

/* ------------------------------------------------------------------------ */
/* The signed grant                                                          */
/* ------------------------------------------------------------------------ */

interface Grant {
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  fields?: Record<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Narrow a loose object to `Record<string, string>`, dropping anything else. */
function stringMap(value: unknown): Record<string, string> | null {
  const source = asRecord(value);
  if (!source) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function parseGrant(payload: unknown): Grant | null {
  const body = asRecord(payload);
  if (!body) return null;

  const url = typeof body.url === 'string' ? body.url : null;
  const method = body.method === 'PUT' || body.method === 'POST' ? body.method : null;
  const headers = stringMap(body.headers);
  if (url === null || method === null || headers === null) return null;

  const fields = body.fields === undefined ? undefined : (stringMap(body.fields) ?? undefined);
  return { url, method, headers, fields };
}

/**
 * Why a grant was not issued, as a case rather than as a sentence.
 *
 * `requestGrant` runs outside React and has no translator, so it names what
 * went wrong and the component says it. `refused` is the one case that carries
 * a sentence, because that sentence is the server's own.
 */
type GrantRefusal =
  | { reason: 'unreachable' }
  | { reason: 'refused'; message: string; code: ActionCode }
  | { reason: 'no-reason'; status: number; code: ActionCode }
  | { reason: 'unreadable' };

type GrantResult = { ok: true; grant: Grant } | { ok: false; refusal: GrantRefusal };

/** Codes the sign route returns, kept to the ones `ActionCode` already names. */
function asActionCode(value: unknown): ActionCode {
  const codes: readonly ActionCode[] = [
    'unauthenticated',
    'forbidden',
    'rate_limited',
    'validation',
    'not_configured',
    'conflict',
    'not_found',
    'unknown',
  ];
  return codes.find((code) => code === value) ?? 'unknown';
}

async function requestGrant(input: {
  photographId: string;
  contentType: string;
  byteSize: number;
}): Promise<GrantResult> {
  let response: Response;
  try {
    response = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, target: 'original' }),
    });
  } catch {
    return { ok: false, refusal: { reason: 'unreachable' } };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = asRecord(payload);
    const error = typeof body?.error === 'string' ? body.error : null;
    const code = asActionCode(body?.code);
    return {
      ok: false,
      refusal:
        error === null
          ? { reason: 'no-reason', status: response.status, code }
          : { reason: 'refused', message: error, code },
    };
  }

  const grant = parseGrant(payload);
  if (!grant) return { ok: false, refusal: { reason: 'unreadable' } };

  return { ok: true, grant };
}

/* ------------------------------------------------------------------------ */
/* The upload itself                                                         */
/* ------------------------------------------------------------------------ */

type SendFailure =
  | { reason: 'refused'; status: number }
  | { reason: 'dropped' }
  | { reason: 'timeout' };

type SendResult = { ok: true } | { ok: false; failure: SendFailure };

/**
 * Send the file with `XMLHttpRequest` rather than `fetch`.
 *
 * `fetch` still has no upload progress event in any shipping browser, and a
 * progress bar that is really a timer is a lie about how far along a 25 MB
 * upload is. This is the one place in FRAME where XHR earns its keep.
 */
function sendFile(
  grant: Grant,
  file: File,
  onProgress: (percent: number) => void,
): Promise<SendResult> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(grant.method, grant.url, true);

    // A multipart POST carries its own content type with the boundary in it, so
    // the grant's headers are only applied to the single-object PUT form.
    if (grant.fields === undefined) {
      for (const [name, value] of Object.entries(grant.headers)) {
        request.setRequestHeader(name, value);
      }
    }

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      // Held below 100 until the provider has acknowledged the write: bytes
      // leaving this machine is not the same as bytes being stored.
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, failure: { reason: 'refused', status: request.status } });
    });

    request.addEventListener('error', () => {
      resolve({ ok: false, failure: { reason: 'dropped' } });
    });

    request.addEventListener('timeout', () => {
      resolve({ ok: false, failure: { reason: 'timeout' } });
    });

    if (grant.fields === undefined) {
      request.send(file);
      return;
    }

    const form = new FormData();
    for (const [name, value] of Object.entries(grant.fields)) form.append(name, value);
    // The file part goes last, which is what a signed POST policy expects.
    form.append('file', file);
    request.send(form);
  });
}

/* ------------------------------------------------------------------------ */
/* Stage list                                                                */
/* ------------------------------------------------------------------------ */

type StageState = 'pending' | 'active' | 'done' | 'failed';

const STATE_KEYS: Record<StageState, string> = {
  done: 'submit.stateDone',
  active: 'submit.stateActive',
  failed: 'submit.stateFailed',
  pending: 'submit.statePending',
};

function StageRow({
  stage,
  stageState,
  percent,
}: {
  stage: Stage;
  stageState: StageState;
  percent: number;
}) {
  const t = useTranslations('upload');
  const format = useUploadFormat();
  const keys = STAGE_KEYS[stage];
  const showBar = stage === 'upload' && (stageState === 'active' || stageState === 'done');

  return (
    <li className="flex gap-3.5 border-t border-line py-4 first:border-t-0">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border text-[10px] font-bold',
          // Shape carries the state as well as weight: a tick for done, a
          // warning glyph for stopped, the stage number otherwise.
          stageState === 'done' && 'border-line-strong bg-surface text-ink',
          stageState === 'active' && 'border-transparent bg-ink text-on-ink',
          stageState === 'failed' && 'border-transparent bg-danger text-white',
          stageState === 'pending' && 'border-line text-muted-soft',
        )}
      >
        {stageState === 'done' ? (
          <Check className="size-3" />
        ) : stageState === 'failed' ? (
          <TriangleAlert className="size-3" />
        ) : (
          format.plain(STAGES.indexOf(stage) + 1)
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-caption',
            stageState === 'pending' ? 'text-muted' : 'font-bold text-ink',
          )}
        >
          {t(keys.title)}
          <span className="ml-2 font-normal text-muted">{t(STATE_KEYS[stageState])}</span>
        </p>
        <p className="mt-1 text-meta leading-relaxed text-muted">{t(keys.detail)}</p>

        {showBar ? (
          <div className="mt-2.5 flex items-center gap-3">
            {/* A div rather than <progress>: the element cannot be styled to
                the design without vendor pseudo-elements Tailwind does not
                reach, and the ARIA role carries the same information. */}
            <div
              role="progressbar"
              aria-label={t('submit.progressLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={t('submit.progressValueText', { percent })}
              className="h-1.5 w-full max-w-xs overflow-hidden rounded-pill bg-surface-sunken"
            >
              <div
                className="h-full bg-ink transition-[width] duration-200 ease-out-soft"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-meta font-bold tabular-nums text-ink">
              {format.plain(percent)}%
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/* The step                                                                  */
/* ------------------------------------------------------------------------ */

const SIGNAL_TONE: Record<UploadSignal['severity'], string> = {
  info: 'text-muted',
  warn: 'text-warning',
  high: 'text-danger',
};

const SIGNAL_KEYS: Record<UploadSignal['severity'], string> = {
  info: 'submit.signalInfo',
  warn: 'submit.signalWarn',
  high: 'submit.signalHigh',
};

export function StepSubmit({
  draft,
  uploadsConfigured,
}: {
  draft: UploadDraft;
  uploadsConfigured: boolean;
}) {
  const t = useTranslations('upload');
  const common = useTranslations('common');
  const format = useUploadFormat();
  const { state } = draft;
  const toast = useToast();

  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Stage | null>(null);
  const [done, setDone] = useState<Stage[]>([]);
  const [percent, setPercent] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [placeNote, setPlaceNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const proposing = state.placeMode === 'propose';
  const stages: Stage[] = proposing ? [...STAGES] : STAGES.filter((stage) => stage !== 'place');

  const stageStateOf = (stage: Stage): StageState => {
    if (failure?.stage === stage) return 'failed';
    // A proposal that did not reach the queue is a stage that failed, even
    // though the photograph it travelled with published normally.
    if (stage === 'place' && placeNote !== null && !placeNote.ok) return 'failed';
    if (done.includes(stage)) return 'done';
    if (active === stage) return 'active';
    return 'pending';
  };

  const submit = useCallback(async () => {
    const file = state.file;
    const payload = draftPayload(state);
    if (!file || !payload) {
      setFailure({
        message: t('submit.noFileAttached'),
        code: 'validation',
        stage: 'draft',
      });
      setRunning(false);
      return;
    }

    setRunning(true);
    setFailure(null);
    setPlaceNote(null);
    setDone([]);
    setPercent(0);

    const stop = (
      stage: Stage,
      message: string,
      code: ActionCode,
      fieldErrors?: Record<string, string>,
    ): void => {
      setActive(null);
      setFailure({ message, code, stage, fieldErrors });
      setRunning(false);
      toast.show(message, 'danger');
    };

    const finish = (stage: Stage): void => {
      setDone((current) => (current.includes(stage) ? current : [...current, stage]));
    };

    /* 1. The draft record, reused when one already exists so a retry cannot
          leave a second half-finished upload behind. */
    let photographId = state.photographId;
    if (photographId === null) {
      setActive('draft');
      const created = await createDraft(payload);
      if (!created.ok) {
        stop('draft', created.error, created.code, created.fieldErrors);
        return;
      }
      photographId = created.data.photographId;
      draft.setPhotographId(photographId);
    }
    finish('draft');

    /* 2. The grant. */
    setActive('grant');
    const granted = await requestGrant({
      photographId,
      contentType: file.type,
      byteSize: file.size,
    });
    if (!granted.ok) {
      const { refusal } = granted;
      const message =
        refusal.reason === 'refused'
          ? refusal.message
          : refusal.reason === 'no-reason'
            ? t('submit.grantNoReason', { status: refusal.status })
            : refusal.reason === 'unreachable'
              ? t('submit.grantUnreachable')
              : t('submit.grantUnreadable');
      const code =
        refusal.reason === 'refused' || refusal.reason === 'no-reason' ? refusal.code : 'unknown';
      stop('grant', message, code);
      return;
    }
    finish('grant');

    /* 3. The bytes. */
    setActive('upload');
    const sent = await sendFile(granted.grant, file, setPercent);
    if (!sent.ok) {
      const { failure: sendFailure } = sent;
      stop(
        'upload',
        sendFailure.reason === 'refused'
          ? t('submit.sendRefused', { status: sendFailure.status })
          : sendFailure.reason === 'dropped'
            ? t('submit.sendDropped')
            : t('submit.sendTimedOut'),
        'unknown',
      );
      return;
    }
    finish('upload');

    /* 4. Server-side verification and the derivatives. */
    setActive('process');
    const processed = await attachVariants({ photographId, filmDeclared: state.filmDeclared });
    if (!processed.ok) {
      stop('process', processed.error, processed.code, processed.fieldErrors);
      return;
    }
    finish('process');

    /* 5. Publication. */
    setActive('publish');
    const published = await publishPhotograph(publishPayload(state, photographId));
    if (!published.ok) {
      stop('publish', published.error, published.code, published.fieldErrors);
      return;
    }
    finish('publish');
    setOutcome(published.data);

    /* 6. The proposed place, which is a separate record with its own fate: the
          photograph is already published and must not be reported as failed
          because a proposal did not make it into the queue. */
    const proposal = proposalPayload(state);
    if (proposal !== null) {
      setActive('place');
      const queued = await submitLocation(proposal);
      setPlaceNote(
        queued.ok
          ? { ok: true, message: queued.message ?? t('submit.placeQueued') }
          : { ok: false, message: queued.error },
      );
      finish('place');
    }

    setActive(null);
    setRunning(false);
    draft.markSubmitted();
    toast.show(
      published.data.status === 'published'
        ? t('submit.toastPublished')
        : t('submit.toastUnderReview'),
      'success',
    );
  }, [draft, state, t, toast]);

  const discard = useCallback(async () => {
    const photographId = state.photographId;
    if (photographId === null) return;

    setDiscarding(true);
    const result = await discardDraft({ photographId });
    setDiscarding(false);
    setConfirmDiscard(false);

    if (!result.ok) {
      toast.show(result.error, 'danger');
      setFailure({ message: result.error, code: result.code, stage: 'draft' });
      return;
    }

    toast.show(t('submit.toastDiscarded'), 'success');
    setRunning(false);
    setFailure(null);
    setOutcome(null);
    setPlaceNote(null);
    setDone([]);
    setPercent(0);
    draft.reset();
  }, [draft, state.photographId, t, toast]);

  const published = outcome !== null;

  return (
    <div>
      <h2 className="text-section font-bold">{t('submit.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        {state.file
          ? t('submit.lead', {
              fileName: state.file.name,
              size: format.fileSize(state.file.size),
            })
          : t('submit.noFile')}
      </p>

      {!uploadsConfigured ? (
        <Notice
          tone="warning"
          title={t('submit.notConfiguredTitle')}
          className="mt-6"
        >
          <p>{t('submit.notConfiguredBody')}</p>
          <p className="mt-2">
            {t.rich('submit.notConfiguredDocs', {
              code: (chunks: ReactNode) => (
                <code className="font-mono text-[0.95em] font-semibold">{chunks}</code>
              ),
            })}
          </p>
        </Notice>
      ) : null}

      <ol className="mt-7 rounded-panel border border-line bg-surface px-5 py-2">
        {stages.map((stage) => (
          <StageRow
            key={stage}
            stage={stage}
            stageState={stageStateOf(stage)}
            percent={percent}
          />
        ))}
      </ol>

      <p aria-live="polite" role="status" className="mt-4 text-caption text-ink-soft">
        {running && active !== null
          ? active === 'upload'
            ? t('submit.statusUploading', { stage: t(STAGE_KEYS[active].title), percent })
            : t('submit.statusActive', { stage: t(STAGE_KEYS[active].title) })
          : failure !== null
            ? t('submit.statusStopped', { stage: t(STAGE_KEYS[failure.stage].title) })
            : outcome !== null
              ? outcome.status === 'published'
                ? t('submit.statusPublished')
                : t('submit.statusUnderReview')
              : t('submit.statusIdle')}
      </p>

      {failure !== null ? (
        <Notice tone="danger" title={t('submit.failureTitle')} className="mt-5">
          <p>{failure.message}</p>
          {failure.fieldErrors !== undefined &&
          Object.keys(failure.fieldErrors).length > 0 ? (
            <ul className="mt-2 space-y-1">
              {Object.entries(failure.fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <span className="font-bold">{field}</span> — {message}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2">{t(GUIDANCE_KEYS[failure.code])}</p>
        </Notice>
      ) : null}

      {outcome !== null ? (
        <section aria-label={t('submit.outcomeLabel')} className="mt-6">
          <Notice
            tone={outcome.status === 'published' ? 'success' : 'info'}
            title={
              outcome.status === 'published'
                ? t('submit.outcomePublishedTitle')
                : t('submit.outcomeReviewTitle')
            }
          >
            <p>
              {outcome.status === 'published'
                ? t('submit.outcomePublishedBody')
                : t('submit.outcomeReviewBody')}
            </p>
          </Notice>

          {outcome.signals.length > 0 ? (
            <div className="mt-4 rounded-card border border-line bg-surface p-4">
              <h3 className="text-eyebrow text-muted uppercase">{t('submit.signalsHeading')}</h3>
              <ul className="mt-3 space-y-2.5">
                {outcome.signals.map((signal, index) => (
                  <li
                    key={`${signal.kind}-${index}`}
                    className="text-meta leading-relaxed text-ink-soft"
                  >
                    <span className={cn('font-bold', SIGNAL_TONE[signal.severity])}>
                      {t(SIGNAL_KEYS[signal.severity])}.
                    </span>{' '}
                    {/* The server wrote this sentence, with the figures only it
                        has — how far the file's position sits from the credited
                        place, what the image was stored at. It is shown as it
                        arrived rather than paraphrased. */}
                    {signal.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-meta leading-relaxed text-muted">
                {t('submit.signalsNote')}
              </p>
            </div>
          ) : null}

          {placeNote !== null ? (
            <Notice tone={placeNote.ok ? 'info' : 'warning'} className="mt-4">
              <p>
                {placeNote.message}
                {placeNote.ok ? '' : ` ${t('submit.placeFailedNote')}`}
              </p>
            </Notice>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2.5">
            {outcome.status === 'published' ? (
              <Button asChild iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                <Link href={`/photographs/${outcome.slug}`}>{t('submit.seePhotograph')}</Link>
              </Button>
            ) : null}
            <Button variant="secondary" onClick={draft.reset}>
              {t('submit.uploadAnother')}
            </Button>
          </div>
        </section>
      ) : null}

      {!published ? (
        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" onClick={draft.back} disabled={running}>
            {t('submit.backToReview')}
          </Button>

          <Button
            variant="accent"
            size="lg"
            loading={running}
            onClick={() => {
              void submit();
            }}
          >
            {failure === null ? t('submit.uploadAndPublish') : common('retry')}
          </Button>

          {state.photographId !== null && !running ? (
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
              {t('submit.discard')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!published ? (
        <p className="mt-4 max-w-prose text-meta leading-relaxed text-muted">
          {t('submit.retryNote')}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('submit.discardDialogTitle')}
        body={t('submit.discardDialogBody')}
        confirmLabel={t('submit.discardDialogConfirm')}
        pending={discarding}
        onConfirm={() => {
          void discard();
        }}
      />
    </div>
  );
}
