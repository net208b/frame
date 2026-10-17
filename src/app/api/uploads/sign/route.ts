import { NOT_CONFIGURED_MESSAGE } from '@/lib/action-result';
import { getViewer, getViewerSuspension } from '@/lib/auth';
import { isDemoMode, UPLOAD_POLICY } from '@/lib/config';
import { storageKeys } from '@/lib/images/variants';
import { checkRateLimit } from '@/lib/rate-limit';
import { StorageConfigurationError, storageDriver } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { formatFileSize } from '@/lib/utils';
import { parseForm } from '@/lib/validation';
import { signUploadSchema } from '@/lib/validation/upload';

/**
 * The signed-upload grant.
 *
 * A browser uploading 25 MB through a Next.js server costs memory and time for
 * nothing, so the bytes go straight to the storage provider. That means issuing
 * a credential, and the whole value of this endpoint is in what it refuses:
 *
 * - The storage key is **derived here**, from the signed-in account and the
 *   photograph it owns. A client never names the key, so it can neither choose
 *   where its bytes land nor write over another member's object.
 * - The grant is scoped to that one key, that one media type and the size the
 *   client declared, so a grant for a 2 MB JPEG cannot be reused to push a
 *   200 MB file or a different format.
 * - The response carries a signature and never a secret.
 * - Everything the client said about the file is still a claim. `attachVariants`
 *   decodes the bytes that actually arrived before anything is published.
 *
 * POST only. Next answers any other method with 405.
 */

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/** Statuses that occupy one of a member's pending-upload slots. */
const PENDING_STATUSES = ['draft', 'processing', 'under_review'] as const;

const NO_STORE: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  // A grant is a credential for one object. It must never be cached anywhere.
  'cache-control': 'no-store, no-cache, must-revalidate',
};

function problem(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ ok: false, error, ...extra }), {
    status,
    headers: NO_STORE,
  });
}

export async function POST(request: Request): Promise<Response> {
  // 1. Capability. No database means no storage and no session to check, so
  //    there is nothing honest to sign.
  if (isDemoMode()) {
    return problem(503, NOT_CONFIGURED_MESSAGE, { code: 'not_configured' });
  }

  // 2. Identity.
  const viewer = await getViewer();
  if (!viewer) {
    return problem(401, 'Sign in to upload a photograph.', { code: 'unauthenticated' });
  }

  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    return problem(403, 'This account is suspended, so it cannot upload photographs.', {
      code: 'forbidden',
    });
  }

  // 3. Rate limits, on the account rather than an address: an address is shared
  //    by everyone behind a carrier NAT, so it is neither identity nor a fair
  //    unit to punish.
  const perHour = await checkRateLimit(
    `upload:sign:hour:${viewer.id}`,
    UPLOAD_POLICY.maxUploadsPerHour,
    HOUR_SECONDS,
  );
  if (!perHour.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'rate_limited',
        error: `FRAME accepts ${UPLOAD_POLICY.maxUploadsPerHour} uploads an hour from one account. Try again in ${Math.ceil(perHour.retryAfterSeconds / 60)} minutes.`,
      }),
      {
        status: 429,
        headers: { ...NO_STORE, 'retry-after': String(perHour.retryAfterSeconds) },
      },
    );
  }

  const perDay = await checkRateLimit(
    `upload:sign:day:${viewer.id}`,
    UPLOAD_POLICY.maxUploadsPerDay,
    DAY_SECONDS,
  );
  if (!perDay.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'rate_limited',
        error: `FRAME accepts ${UPLOAD_POLICY.maxUploadsPerDay} uploads a day from one account. Try again in ${Math.ceil(perDay.retryAfterSeconds / 3600)} hours.`,
      }),
      {
        status: 429,
        headers: { ...NO_STORE, 'retry-after': String(perDay.retryAfterSeconds) },
      },
    );
  }

  // 4. Validate the request body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, 'That request body was not readable JSON.', { code: 'validation' });
  }

  const parsed = parseForm(body, signUploadSchema);
  if (!parsed.ok) {
    return problem(422, parsed.message, {
      code: 'validation',
      fieldErrors: parsed.fieldErrors,
    });
  }
  const grantRequest = parsed.data;

  // The schema already bounds this, and it is asserted again next to the grant
  // that depends on it, because this number becomes the grant's ceiling.
  if (grantRequest.byteSize > UPLOAD_POLICY.maxFileBytes) {
    return problem(
      422,
      `That file is ${formatFileSize(grantRequest.byteSize)}. The limit is ${formatFileSize(UPLOAD_POLICY.maxFileBytes)}.`,
      { code: 'validation', fieldErrors: { byteSize: 'That file is over the size limit.' } },
    );
  }

  const supabase = await createClient();

  // 5. Authorise: the photograph has to be one this account owns and is still
  //    working on. Row-level security says the same thing; this is the check
  //    that lets the answer be a sentence instead of an empty result.
  const { data, error } = await supabase
    .from('photographs')
    .select('id, owner_id, status')
    .eq('id', grantRequest.photographId)
    .eq('owner_id', viewer.id)
    .maybeSingle();

  if (error) {
    return problem(500, 'That upload could not be read. Try again in a moment.', {
      code: 'unknown',
    });
  }

  const photograph = data as { id: string; owner_id: string; status: string } | null;

  // Indistinguishable from "does not exist": a member must not be able to learn
  // that somebody else's photograph id is real.
  if (!photograph || photograph.owner_id !== viewer.id) {
    return problem(404, 'That upload was not found in your account.', { code: 'not_found' });
  }

  if (photograph.status === 'published' || photograph.status === 'removed') {
    return problem(409, 'This photograph is no longer a draft, so its image cannot be replaced.', {
      code: 'conflict',
    });
  }

  // 6. The pending ceiling, so one account cannot leave a hundred half-finished
  //    uploads occupying storage and the review queue.
  const { count, error: countError } = await supabase
    .from('photographs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', viewer.id)
    .in('status', [...PENDING_STATUSES]);

  if (countError) {
    return problem(
      500,
      'Your uploads in progress could not be counted, so no upload was authorised.',
      { code: 'unknown' },
    );
  }

  const pending = count ?? 0;
  if (pending > UPLOAD_POLICY.maxPendingUploads) {
    return problem(
      409,
      `You have ${pending} uploads waiting to be finished or reviewed, which is past the limit of ${UPLOAD_POLICY.maxPendingUploads}. Publish or discard one before uploading another.`,
      { code: 'conflict' },
    );
  }

  // 7. Derive the key. This is the line that makes the endpoint safe: the owner
  //    segment is the session's account and the photograph segment is a row that
  //    account owns, so no request can point the grant anywhere else.
  const key = storageKeys(photograph.id, viewer.id)[grantRequest.target];

  try {
    const grant = await storageDriver().createSignedUpload({
      key,
      contentType: grantRequest.contentType,
      // Scoped to the size the client declared, not to the policy ceiling, so a
      // grant is only ever as large as the file it was asked for.
      maxBytes: grantRequest.byteSize,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        key,
        url: grant.url,
        method: grant.method,
        headers: grant.headers,
        ...(grant.fields === undefined ? {} : { fields: grant.fields }),
        expiresInSeconds: grant.expiresInSeconds,
        contentType: grantRequest.contentType,
        maxBytes: grantRequest.byteSize,
      }),
      { status: 201, headers: NO_STORE },
    );
  } catch (cause) {
    if (cause instanceof StorageConfigurationError) {
      return problem(503, `Image storage is not configured. ${cause.message}`, {
        code: 'not_configured',
      });
    }

    console.error(
      `FRAME upload: signing ${key} failed — ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return problem(502, 'Image storage would not authorise this upload. Nothing was sent.', {
      code: 'unknown',
    });
  }
}
