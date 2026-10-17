'use client';

import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/states';
import type { ActionCode } from '@/lib/action-result';
import { cn, formatFileSize } from '@/lib/utils';
import { submitLocation } from '@/server/actions/locations';
import {
  attachVariants,
  createDraft,
  discardDraft,
  publishPhotograph,
} from '@/server/actions/upload';
import type { PublicationStatus, UploadSignal } from '@/types/domain';

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
 */

/* ------------------------------------------------------------------------ */
/* Stages                                                                    */
/* ------------------------------------------------------------------------ */

const STAGES = ['draft', 'grant', 'upload', 'process', 'publish', 'place'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_COPY: Record<Stage, { title: string; detail: string }> = {
  draft: {
    title: 'Reserve the record',
    detail: 'FRAME creates the draft that will own the file, under your account.',
  },
  grant: {
    title: 'Authorise the upload',
    detail:
      'The server works out where the file goes and issues a grant for that one object, that one format and that one size. Nothing about the destination is chosen by this browser.',
  },
  upload: {
    title: 'Send the file',
    detail: 'The bytes go straight to storage rather than through FRAME.',
  },
  process: {
    title: 'Check and resize',
    detail:
      'The server decodes the file that actually arrived, refuses anything that is not a photograph it can publish, then builds the sizes the site serves and strips every tag from each of them.',
  },
  publish: {
    title: 'Publish',
    detail: 'Your declaration is recorded and the photograph is written to the gallery.',
  },
  place: {
    title: 'Queue the proposed place',
    detail: 'Your proposal goes to a moderator. Your photograph does not wait for it.',
  },
};

interface Failure {
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
const GUIDANCE: Record<ActionCode, string> = {
  not_configured:
    'Nothing was uploaded and nothing was saved. This is a configuration gap in the deployment, not something your file did wrong.',
  unauthenticated:
    'Your session has ended. Sign in again in another tab and press submit here — everything you have entered is still on this page, as long as you do not reload it.',
  forbidden: 'The reason is above. Nothing was uploaded.',
  rate_limited:
    'Wait for the time given above and submit again. Nothing was lost, and nothing was partly published.',
  validation:
    'Step back to the field named above, correct it, and return here. Nothing has been published.',
  conflict:
    'This upload is no longer in the state FRAME expected. Reload the page to see where it actually stands before trying again.',
  not_found:
    'FRAME cannot find this upload under your account any more. Reload the page and start it again.',
  unknown:
    'Nothing was published. Submitting again is safe — it reuses the same record rather than making a second one.',
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

type GrantResult =
  | { ok: true; grant: Grant }
  | { ok: false; error: string; code: ActionCode };

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
    return {
      ok: false,
      error: 'FRAME could not be reached to authorise the upload, so nothing was sent.',
      code: 'unknown',
    };
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
    return {
      ok: false,
      error:
        error ??
        `FRAME refused to authorise this upload (HTTP ${response.status}) and gave no reason that can be shown here.`,
      code: asActionCode(body?.code),
    };
  }

  const grant = parseGrant(payload);
  if (!grant) {
    return {
      ok: false,
      error:
        'FRAME returned an upload grant this page could not read, so nothing was sent. Reload and try again.',
      code: 'unknown',
    };
  }

  return { ok: true, grant };
}

/* ------------------------------------------------------------------------ */
/* The upload itself                                                         */
/* ------------------------------------------------------------------------ */

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
): Promise<{ ok: true } | { ok: false; error: string }> {
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
      resolve({
        ok: false,
        error: `Image storage refused the file with HTTP ${request.status}. Nothing was published. If the grant had expired, submitting again issues a fresh one.`,
      });
    });

    request.addEventListener('error', () => {
      resolve({
        ok: false,
        error:
          'The connection to image storage dropped before the file finished, so nothing was published. Submitting again starts the transfer from the beginning.',
      });
    });

    request.addEventListener('timeout', () => {
      resolve({ ok: false, error: 'The upload timed out before it finished, so nothing was published.' });
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

function StageRow({
  stage,
  stageState,
  percent,
}: {
  stage: Stage;
  stageState: StageState;
  percent: number;
}) {
  const copy = STAGE_COPY[stage];
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
          STAGES.indexOf(stage) + 1
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-caption',
            stageState === 'pending' ? 'text-muted' : 'font-bold text-ink',
          )}
        >
          {copy.title}
          <span className="ml-2 font-normal text-muted">
            {stageState === 'done'
              ? 'done'
              : stageState === 'active'
                ? 'in progress'
                : stageState === 'failed'
                  ? 'stopped here'
                  : 'not started'}
          </span>
        </p>
        <p className="mt-1 text-meta leading-relaxed text-muted">{copy.detail}</p>

        {showBar ? (
          <div className="mt-2.5 flex items-center gap-3">
            {/* A div rather than <progress>: the element cannot be styled to
                the design without vendor pseudo-elements Tailwind does not
                reach, and the ARIA role carries the same information. */}
            <div
              role="progressbar"
              aria-label="File upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${percent} per cent sent`}
              className="h-1.5 w-full max-w-xs overflow-hidden rounded-pill bg-surface-sunken"
            >
              <div
                className="h-full bg-ink transition-[width] duration-200 ease-out-soft"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-meta font-bold tabular-nums text-ink">{percent}%</span>
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

export function StepSubmit({
  draft,
  uploadsConfigured,
}: {
  draft: UploadDraft;
  uploadsConfigured: boolean;
}) {
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
        message: 'No file is attached to this upload any more. Go back to step one and choose it again.',
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
      stop('grant', granted.error, granted.code);
      return;
    }
    finish('grant');

    /* 3. The bytes. */
    setActive('upload');
    const sent = await sendFile(granted.grant, file, setPercent);
    if (!sent.ok) {
      stop('upload', sent.error, 'unknown');
      return;
    }
    finish('upload');

    /* 4. Server-side verification and the derivatives. */
    setActive('process');
    const processed = await attachVariants({ photographId });
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
          ? {
              ok: true,
              message:
                queued.message ??
                'Your proposed place is queued for a moderator and will appear once it is approved.',
            }
          : { ok: false, message: queued.error },
      );
      finish('place');
    }

    setActive(null);
    setRunning(false);
    draft.markSubmitted();
    toast.show(
      published.data.status === 'published'
        ? 'Your photograph is published.'
        : 'Your photograph is with a moderator.',
      'success',
    );
  }, [draft, state, toast]);

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

    toast.show('That upload has been discarded.', 'success');
    setRunning(false);
    setFailure(null);
    setOutcome(null);
    setPlaceNote(null);
    setDone([]);
    setPercent(0);
    draft.reset();
  }, [draft, state.photographId, toast]);

  const published = outcome !== null;

  return (
    <div>
      <h2 className="text-section font-bold">Send it</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        {state.file
          ? `${state.file.name}, ${formatFileSize(state.file.size)}, going to storage and then through the server's own checks.`
          : 'No file is attached to this upload.'}
      </p>

      {!uploadsConfigured ? (
        <Notice tone="warning" title="Nothing will be uploaded from this deployment" className="mt-6">
          <p>
            This copy of FRAME cannot accept a photograph: it has no database, or the storage
            provider it was pointed at is missing its credentials. The notice at the top of this
            page names exactly what is absent. Either way there is nowhere for the file to go, so
            the wizard is here in full only as a design review.
          </p>
          <p className="mt-2">
            Submitting will refuse and repeat that explanation rather than show you a success that
            did not happen. The variables that turn uploads on are listed in{' '}
            <code className="font-mono text-[0.95em] font-semibold">docs/ENVIRONMENT.md</code>.
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
          ? `${STAGE_COPY[active].title}${active === 'upload' ? ` — ${percent}% sent` : '…'}`
          : failure !== null
            ? `Stopped at: ${STAGE_COPY[failure.stage].title}.`
            : outcome !== null
              ? outcome.status === 'published'
                ? 'Published.'
                : 'Uploaded and waiting on a moderator.'
              : 'Not started.'}
      </p>

      {failure !== null ? (
        <Notice tone="danger" title="This upload stopped" className="mt-5">
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
          <p className="mt-2">{GUIDANCE[failure.code]}</p>
        </Notice>
      ) : null}

      {outcome !== null ? (
        <section aria-label="What happened to this upload" className="mt-6">
          <Notice
            tone={outcome.status === 'published' ? 'success' : 'info'}
            title={
              outcome.status === 'published'
                ? 'Published'
                : 'Uploaded, and with a moderator before it appears'
            }
          >
            <p>
              {outcome.status === 'published'
                ? 'Your photograph is live, the sizes FRAME serves have been generated from it, and every tag has been stripped from each of them. The original is kept privately as the source for re-processing.'
                : 'Your photograph has been stored and processed, and one of the automated checks asked for a person to look at it. A moderator reads it, usually within a day, and you will see it in your portfolio either way — published, or with the reason it was not.'}
            </p>
          </Notice>

          {outcome.signals.length > 0 ? (
            <div className="mt-4 rounded-card border border-line bg-surface p-4">
              <h3 className="text-eyebrow text-muted uppercase">What the checks noticed</h3>
              <ul className="mt-3 space-y-2.5">
                {outcome.signals.map((signal, index) => (
                  <li key={`${signal.kind}-${index}`} className="text-meta leading-relaxed text-ink-soft">
                    <span className={cn('font-bold', SIGNAL_TONE[signal.severity])}>
                      {signal.severity === 'high'
                        ? 'Held for review'
                        : signal.severity === 'warn'
                          ? 'Worth knowing'
                          : 'For information'}
                      .
                    </span>{' '}
                    {signal.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-meta leading-relaxed text-muted">
                These are checks with an opinion, not verdicts. A moderator sees the same list.
              </p>
            </div>
          ) : null}

          {placeNote !== null ? (
            <Notice tone={placeNote.ok ? 'info' : 'warning'} className="mt-4">
              <p>
                {placeNote.message}
                {placeNote.ok
                  ? ''
                  : ' Your photograph published normally. You can propose the place again from the location index without re-uploading.'}
              </p>
            </Notice>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2.5">
            {outcome.status === 'published' ? (
              <Button asChild iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                <Link href={`/photographs/${outcome.slug}`}>See the photograph</Link>
              </Button>
            ) : null}
            <Button variant="secondary" onClick={draft.reset}>
              Upload another photograph
            </Button>
          </div>
        </section>
      ) : null}

      {!published ? (
        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            onClick={draft.back}
            disabled={running}
          >
            Back to review
          </Button>

          <Button
            variant="accent"
            size="lg"
            loading={running}
            onClick={() => {
              void submit();
            }}
          >
            {failure === null ? 'Upload and publish' : 'Try again'}
          </Button>

          {state.photographId !== null && !running ? (
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
              Discard this upload
            </Button>
          ) : null}
        </div>
      ) : null}

      {!published ? (
        <p className="mt-4 max-w-prose text-meta leading-relaxed text-muted">
          Submitting again after a failure reuses the same record rather than starting a second
          one, so a retry cannot leave a half-finished upload behind. Nothing is kept in this
          browser between visits: leaving the page loses what you have typed, which is why FRAME
          asks before you go.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this upload?"
        body="The draft record and any file already stored for it are deleted, and the form here is cleared. This cannot be undone."
        confirmLabel="Discard"
        pending={discarding}
        onConfirm={() => {
          void discard();
        }}
      />
    </div>
  );
}
