'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  fail,
  NOT_CONFIGURED_MESSAGE,
  ok,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer, getViewerSuspension, type Viewer } from '@/lib/auth';
import { isDemoMode, UPLOAD_POLICY } from '@/lib/config';
import { distanceMetres } from '@/lib/geo';
import { blurPlaceholder, buildVariants, verifyImageBytes } from '@/lib/images/process';
import { storageKeys } from '@/lib/images/variants';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  StorageConfigurationError,
  storageDriver,
  type SignedUploadGrant,
  type StorageDriver,
} from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';
import { parseForm } from '@/lib/validation';
import { latitudeSchema, longitudeSchema } from '@/lib/validation/location';
import {
  discardDraftSchema,
  publishPhotographSchema,
  uploadDraftSchema,
} from '@/lib/validation/upload';
import type { ImageVariantName, PublicationStatus, UploadSignal } from '@/types/domain';

/**
 * The upload write path: draft, derivatives, publication, discard.
 *
 * This is the most security-sensitive module in the product, and the rules it
 * holds to are worth stating before the code:
 *
 * - Nothing the browser says about a file is trusted. The declared type and
 *   size let the wizard fail fast and explain the limits; the bytes that
 *   actually arrived are decoded by `verifyImageBytes` before a single
 *   derivative is written, and the media type recorded is the one sharp read.
 * - Ownership is checked against the signed-in account on every one of these
 *   actions, in addition to row-level security, and regardless of what the UI
 *   offered. A hidden control is not a permission check.
 * - EXIF is a convenience for prefilling a form. It never grants a permission,
 *   it is never proof of authorship, and the position it carries is stored only
 *   when the member chose to share it.
 * - Publication requires a rights confirmation recorded at the moment the box
 *   was ticked. The database enforces that too (`photographs_publishable`), so
 *   neither layer is the only thing standing between a draft and a published
 *   photograph.
 */

/* ------------------------------------------------------------------------ */
/* Shared guards                                                             */
/* ------------------------------------------------------------------------ */

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/** Postgres unique violation, raised when a generated slug is already taken. */
const UNIQUE_VIOLATION = '23505';

/** Statuses that occupy one of a member's pending-upload slots. */
const PENDING_STATUSES = ['draft', 'processing', 'under_review'] as const;

/**
 * How far the camera's own position may sit from the credited place before the
 * upload goes to a human. Deliberately the same 2 km the moderation queue uses
 * to describe the signal, so the queue and this action never disagree about
 * what counts as a conflict.
 */
const EXIF_CONFLICT_METRES = 2_000;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type Guard = { ok: true; viewer: Viewer } | { ok: false; result: ActionResult<never> };

/**
 * Capability, identity and standing, in that order.
 *
 * A suspended member is returned by `getViewer()` on purpose — the pages they
 * can still reach have to be able to explain the suspension — so every write
 * path has to ask about it separately.
 */
async function guardUploader(verb: string): Promise<Guard> {
  if (isDemoMode()) {
    return { ok: false, result: fail(NOT_CONFIGURED_MESSAGE, 'not_configured') };
  }

  const viewer = await getViewer();
  if (!viewer) {
    return { ok: false, result: fail(`Sign in to ${verb}.`, 'unauthenticated') };
  }

  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    return {
      ok: false,
      result: fail(
        suspension.reason
          ? `This account is suspended, so it cannot ${verb}. ${suspension.reason}`
          : `This account is suspended, so it cannot ${verb}.`,
        'forbidden',
      ),
    };
  }

  return { ok: true, viewer };
}

/**
 * The storage driver, or an honest refusal.
 *
 * `capabilities().uploads` is true as soon as a database is configured, so it
 * cannot tell whether the *selected* provider has its credentials. This is
 * where that is found out, and the member is told which variable is missing
 * rather than watching an upload fail for no stated reason.
 */
function resolveDriver():
  | { ok: true; driver: StorageDriver }
  | { ok: false; result: ActionResult<never> } {
  try {
    return { ok: true, driver: storageDriver() };
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return {
        ok: false,
        result: fail(
          `Image storage is not configured, so nothing was uploaded. ${error.message}`,
          'not_configured',
        ),
      };
    }
    throw error;
  }
}

/**
 * The upload policy's hourly and daily limits.
 *
 * Each operation gets its own pair of buckets. The database limiter counts hits
 * per bucket name, so sharing one name across two windows would charge every
 * call twice and halve the effective limit; a bucket per window is what makes
 * "six an hour, twenty a day" mean what it says.
 */
async function limitUploadOperation(
  operation: 'create' | 'process' | 'publish' | 'discard',
  viewerId: string,
  noun: string,
): Promise<ActionResult<never> | null> {
  const perHour = await checkRateLimit(
    `upload:${operation}:hour:${viewerId}`,
    UPLOAD_POLICY.maxUploadsPerHour,
    HOUR_SECONDS,
  );
  if (!perHour.allowed) {
    return fail(
      `FRAME accepts ${UPLOAD_POLICY.maxUploadsPerHour} ${noun} an hour from one account. Try again in ${Math.ceil(perHour.retryAfterSeconds / 60)} minutes.`,
      'rate_limited',
    );
  }

  const perDay = await checkRateLimit(
    `upload:${operation}:day:${viewerId}`,
    UPLOAD_POLICY.maxUploadsPerDay,
    DAY_SECONDS,
  );
  if (!perDay.allowed) {
    return fail(
      `FRAME accepts ${UPLOAD_POLICY.maxUploadsPerDay} ${noun} a day from one account. Try again in ${Math.ceil(perDay.retryAfterSeconds / 3600)} hours.`,
      'rate_limited',
    );
  }

  return null;
}

/**
 * Refuse when the member already has the policy's worth of uploads in flight.
 *
 * A failed count refuses too: a ceiling that disappears whenever its query
 * fails is not a ceiling.
 */
async function pendingUploadGuard(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<ActionResult<never> | null> {
  const { count, error } = await supabase
    .from('photographs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', viewerId)
    .in('status', [...PENDING_STATUSES]);

  if (error) {
    console.error(`FRAME upload: counting uploads in progress failed — ${error.message}`);
    return fail(
      'Your uploads in progress could not be counted, so this upload was not started. Try again in a moment.',
      'unknown',
    );
  }

  const pending = count ?? 0;
  if (pending >= UPLOAD_POLICY.maxPendingUploads) {
    return fail(
      `You have ${pending} uploads waiting to be finished or reviewed, which is the limit of ${UPLOAD_POLICY.maxPendingUploads}. Publish or discard one before starting another.`,
      'conflict',
    );
  }

  return null;
}

interface OwnedPhotograph {
  id: string;
  slug: string;
  status: PublicationStatus;
  imageWidth: number | null;
  imageHeight: number | null;
}

interface OwnedPhotographRow {
  id: string;
  owner_id: string;
  slug: string;
  status: PublicationStatus;
  image_width: number | null;
  image_height: number | null;
}

/**
 * Load a photograph the signed-in member owns.
 *
 * The owner filter is in the query *and* re-asserted on the row, because a
 * mistake in either place is the difference between a member editing their own
 * draft and a member editing somebody else's.
 */
async function loadOwnedPhotograph(
  supabase: SupabaseClient,
  photographId: string,
  viewerId: string,
): Promise<{ ok: true; photograph: OwnedPhotograph } | { ok: false; result: ActionResult<never> }> {
  const { data, error } = await supabase
    .from('photographs')
    .select('id, owner_id, slug, status, image_width, image_height')
    .eq('id', photographId)
    .eq('owner_id', viewerId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      result: fail('That upload could not be read. Try again in a moment.', 'unknown'),
    };
  }

  const row = data as OwnedPhotographRow | null;

  // Indistinguishable from "does not exist", deliberately: a member must not be
  // able to learn that somebody else's photograph id is real.
  if (!row || row.owner_id !== viewerId) {
    return {
      ok: false,
      result: fail('That upload was not found in your account.', 'not_found'),
    };
  }

  return {
    ok: true,
    photograph: {
      id: row.id,
      slug: row.slug,
      status: row.status,
      imageWidth: row.image_width,
      imageHeight: row.image_height,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* createDraft                                                               */
/* ------------------------------------------------------------------------ */

/**
 * What a draft row needs before it can exist.
 *
 * `alt_text` is NOT NULL with a 10–280 character check from the first insert,
 * which is the schema making the accessibility requirement non-negotiable. So
 * the wizard holds everything in memory until the member has written it, and
 * the row is created when they submit rather than when they pick a file.
 */
const createDraftSchema = uploadDraftSchema.extend(
  publishPhotographSchema.pick({ title: true, altText: true }).shape,
);

/** Slugs are `^[a-z0-9]+(-[a-z0-9]+)*$`, so a title in another script needs a fallback. */
function slugBase(title: string): string {
  const base = slugify(title).replace(/-+$/, '');
  return base.length > 0 ? base : 'photograph';
}

function slugAttempt(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '');
  const trimmed = base.slice(0, 60).replace(/-+$/, '');
  return `${trimmed.length > 0 ? trimmed : 'photograph'}-${suffix.length > 0 ? suffix : String(attempt)}`;
}

export async function createDraft(
  input: unknown,
): Promise<ActionResult<{ photographId: string; storagePrefix: string; slug: string }>> {
  const guard = await guardUploader('upload a photograph');
  if (!guard.ok) return guard.result;
  const { viewer } = guard;

  const limited = await limitUploadOperation('create', viewer.id, 'uploads');
  if (limited) return limited;

  const parsed = parseForm(input, createDraftSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);
  const draft = parsed.data;

  const supabase = await createClient();

  const pending = await pendingUploadGuard(supabase, viewer.id);
  if (pending) return pending;

  // The id is generated here rather than by the database so the storage prefix
  // can be written in the same statement as the row it belongs to. The prefix
  // is `<owner>/<photograph>`, exactly what `storageKeys()` builds, which is
  // what makes every key derivable on the server and unchoosable by a client.
  const photographId = randomUUID();
  const storagePrefix = `${viewer.id}/${photographId}`;
  const base = slugBase(draft.title);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = slugAttempt(base, attempt);

    const { error } = await supabase.from('photographs').insert({
      id: photographId,
      owner_id: viewer.id,
      slug,
      title: draft.title,
      alt_text: draft.altText,
      category: draft.category,
      status: 'draft',
      storage_prefix: storagePrefix,
    });

    if (!error) {
      // Nothing public changed: a draft is visible to its owner and to
      // moderators and to nobody else, so there is no path to revalidate yet.
      return ok({ photographId, storagePrefix, slug });
    }

    if (error.code !== UNIQUE_VIOLATION) {
      console.error(`FRAME upload: creating a draft failed — ${error.message}`);
      return fail(
        'This upload could not be started. Nothing was saved, so you can try again.',
        'unknown',
      );
    }
  }

  return fail(
    'A web address could not be reserved for this title. Try a slightly different title.',
    'conflict',
    { title: 'This title could not be turned into a free web address.' },
  );
}

/* ------------------------------------------------------------------------ */
/* attachVariants                                                            */
/* ------------------------------------------------------------------------ */

const attachInputSchema = z.object({
  photographId: discardDraftSchema.shape.photographId,
});

/** A short wait between availability checks on a just-written object. */
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * A request body the DOM types accept.
 *
 * `BufferSource` is `ArrayBufferView<ArrayBuffer>`, and a `Uint8Array` returned
 * from a library is typed over `ArrayBufferLike`, so the bytes are copied into
 * an array that owns its own buffer rather than cast into one.
 */
function toBody(bytes: Uint8Array, contentType: string): Blob {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return new Blob([owned], { type: contentType });
}

/**
 * Read back the original the member uploaded.
 *
 * The driver interface exposes signing, a public URL and deletion, so reading
 * an object back means fetching its URL. A freshly written object can take a
 * moment to become readable through a CDN, hence the short retry, and the query
 * parameter keeps a negative cache entry from being served straight back.
 */
async function fetchStoredOriginal(
  driver: StorageDriver,
  key: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; reason: string }> {
  const base = driver.publicUrl(key);
  const url = `${base}${base.includes('?') ? '&' : '?'}read=${Date.now()}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(500);

    let response: Response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      console.error(
        `FRAME upload: reading ${key} back from storage failed — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    if (!response.ok) continue;

    // Refuse before reading the body when the provider states the size.
    const declared = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > UPLOAD_POLICY.maxFileBytes) {
      return {
        ok: false,
        reason: 'The stored file is larger than the upload limit, so it was not processed.',
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > UPLOAD_POLICY.maxFileBytes) {
      return {
        ok: false,
        reason: 'The stored file is larger than the upload limit, so it was not processed.',
      };
    }
    return { ok: true, bytes };
  }

  return {
    ok: false,
    reason:
      'The uploaded file could not be read back from storage. The upload may not have finished — send the file again.',
  };
}

/** Write one derivative with the grant just issued for its own key. */
async function putWithGrant(grant: SignedUploadGrant, bytes: Uint8Array): Promise<boolean> {
  const contentType = grant.headers['content-type'] ?? 'application/octet-stream';

  try {
    if (grant.fields === undefined) {
      const response = await fetch(grant.url, {
        method: grant.method,
        headers: grant.headers,
        body: toBody(bytes, contentType),
        cache: 'no-store',
      });
      return response.ok;
    }

    // A provider that signs a POST policy carries its fields in the form body,
    // and the file has to be the last part.
    const form = new FormData();
    for (const [name, value] of Object.entries(grant.fields)) form.append(name, value);
    form.append('file', toBody(bytes, contentType));

    const response = await fetch(grant.url, { method: 'POST', body: form, cache: 'no-store' });
    return response.ok;
  } catch (error) {
    console.error(
      `FRAME upload: writing a derivative failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

interface VariantRow {
  photograph_id: string;
  variant: ImageVariantName;
  storage_key: string;
  width: number;
  height: number;
  byte_size: number;
  content_type: string;
}

/**
 * Verify the uploaded bytes, build the sizes the site serves, and store them.
 *
 * A gallery request must never download an original, so this is the step that
 * makes a photograph servable at all. Every derivative is written with no EXIF,
 * no XMP, no IPTC and no GPS — `buildVariants` strips all of it, which is a
 * privacy guarantee rather than a byte saving.
 */
export async function attachVariants(
  input: unknown,
): Promise<ActionResult<{ variants: ImageVariantName[]; width: number; height: number }>> {
  const guard = await guardUploader('process an upload');
  if (!guard.ok) return guard.result;
  const { viewer } = guard;

  // Processing is the expensive step — four encodes of a file up to 25 MB — so
  // it carries the upload policy's limits in its own right.
  const limited = await limitUploadOperation('process', viewer.id, 'uploads');
  if (limited) return limited;

  const parsed = parseForm(input, attachInputSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const resolved = resolveDriver();
  if (!resolved.ok) return resolved.result;
  const driver = resolved.driver;

  const supabase = await createClient();
  const owned = await loadOwnedPhotograph(supabase, parsed.data.photographId, viewer.id);
  if (!owned.ok) return owned.result;
  const photograph = owned.photograph;

  if (photograph.status === 'published' || photograph.status === 'removed') {
    return fail(
      'This photograph is no longer a draft, so its image cannot be replaced here.',
      'conflict',
    );
  }

  const keys = storageKeys(photograph.id, viewer.id);

  const setStatus = async (status: 'draft' | 'processing'): Promise<void> => {
    const { error } = await supabase
      .from('photographs')
      .update({ status })
      .eq('id', photograph.id)
      .eq('owner_id', viewer.id);
    if (error) {
      console.error(
        `FRAME upload: marking ${photograph.id} as ${status} failed — ${error.message}`,
      );
    }
  };

  // Marked as being worked on, and reset below if anything fails, so a failed
  // attempt does not strand the draft in a state it cannot leave.
  await setStatus('processing');

  const original = await fetchStoredOriginal(driver, keys.original);
  if (!original.ok) {
    await setStatus('draft');
    return fail(original.reason, 'not_found');
  }

  // The real magic bytes, read by sharp. The type the browser declared was only
  // ever a hint for failing fast in the form.
  const verified = await verifyImageBytes(original.bytes);
  if (!verified.ok) {
    await setStatus('draft');
    return fail(verified.reason, 'validation', { file: verified.reason });
  }

  let built: Awaited<ReturnType<typeof buildVariants>>;
  try {
    built = await buildVariants(original.bytes);
  } catch (error) {
    console.error(
      `FRAME upload: building derivatives for ${photograph.id} failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await setStatus('draft');
    return fail(
      'The sizes FRAME serves could not be generated from that file. Try exporting it again from your editor.',
      'unknown',
    );
  }

  // Cosmetic, so a failure here must not fail the upload.
  let blurDataUrl: string | null = null;
  try {
    blurDataUrl = await blurPlaceholder(original.bytes);
  } catch {
    blurDataUrl = null;
  }

  const rows: VariantRow[] = [];

  for (const variant of built) {
    const key = keys[variant.name];

    let grant: SignedUploadGrant;
    try {
      grant = await driver.createSignedUpload({
        key,
        contentType: variant.contentType,
        maxBytes: Math.max(1, variant.bytes.byteLength),
      });
    } catch (error) {
      console.error(
        `FRAME upload: signing ${key} failed — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await setStatus('draft');
      return fail(
        'Image storage refused to accept the generated sizes, so nothing was published.',
        'unknown',
      );
    }

    if (!(await putWithGrant(grant, variant.bytes))) {
      await setStatus('draft');
      return fail(
        `The ${variant.name} size could not be stored, so nothing was published. Try again in a moment.`,
        'unknown',
      );
    }

    rows.push({
      photograph_id: photograph.id,
      variant: variant.name,
      storage_key: key,
      width: variant.width,
      height: variant.height,
      byte_size: variant.bytes.byteLength,
      content_type: variant.contentType,
    });
  }

  const { error: imagesError } = await supabase
    .from('photograph_images')
    // One row per variant per photograph, so re-processing replaces a row
    // rather than accumulating duplicates the UI would have to choose between.
    .upsert(rows, { onConflict: 'photograph_id,variant' });

  if (imagesError) {
    console.error(`FRAME upload: recording derivatives failed — ${imagesError.message}`);
    await setStatus('draft');
    return fail(
      'The generated sizes were stored but could not be recorded, so this upload is not ready to publish. Try again in a moment.',
      'unknown',
    );
  }

  // The box the grid reserves is the display derivative's, which is what the
  // repository reads back for a card.
  const display = rows.find((row) => row.variant === 'display') ?? rows.at(-1);
  const width = display?.width ?? verified.width;
  const height = display?.height ?? verified.height;

  const { error: updateError } = await supabase
    .from('photographs')
    .update({
      storage_prefix: `${viewer.id}/${photograph.id}`,
      image_width: width,
      image_height: height,
      blur_data_url: blurDataUrl,
    })
    .eq('id', photograph.id)
    .eq('owner_id', viewer.id);

  if (updateError) {
    console.error(`FRAME upload: recording image dimensions failed — ${updateError.message}`);
    return fail(
      'The image sizes were stored but the photograph record could not be updated. Try processing it again.',
      'unknown',
    );
  }

  return ok({ variants: rows.map((row) => row.variant), width, height });
}

/* ------------------------------------------------------------------------ */
/* publishPhotograph                                                         */
/* ------------------------------------------------------------------------ */

const nullableText = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((value) => value ?? null);

const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

/**
 * The EXIF readout the wizard took in the browser, sent back so a moderator
 * reviewing an ownership claim can see what the file said.
 *
 * It is a record of a claim, nothing more. Every field in an EXIF block can be
 * rewritten with a free tool, so none of it establishes who holds the rights to
 * a photograph.
 */
const exifReadoutSchema = z
  .object({
    cameraBrand: nullableText,
    cameraModel: nullableText,
    lensBrand: nullableText,
    lensModel: nullableText,
    focalLengthMm: nullableNumber,
    aperture: nullableNumber,
    shutterSpeed: nullableText,
    iso: nullableNumber,
    capturedAt: nullableText,
    gps: z
      .object({ latitude: latitudeSchema, longitude: longitudeSchema })
      .nullish()
      .transform((value) => value ?? null),
    width: nullableNumber,
    height: nullableNumber,
  })
  .nullish()
  .transform((value) => value ?? null);

const publishInputSchema = publishPhotographSchema.extend({
  exif: exifReadoutSchema,
  /**
   * Whether the member chose to share the position their camera recorded.
   * Anything other than an explicit `true` is a no: silence is not consent, and
   * an unanswered question must never resolve to publishing where somebody was.
   */
  shareExifGps: z
    .boolean()
    .nullish()
    .transform((value) => value === true),
});

type PublishInput = z.output<typeof publishInputSchema>;

interface ChosenLocation {
  id: string;
  slug: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Check that a chosen place exists and is approved.
 *
 * The cookie-bound client sees approved locations only, so a pending or
 * rejected id simply does not resolve — which is the behaviour we want rather
 * than something to work around.
 */
async function resolveLocation(
  supabase: SupabaseClient,
  locationId: string,
): Promise<ChosenLocation | null> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, slug, name, latitude, longitude')
    .eq('id', locationId)
    .eq('status', 'approved')
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    slug: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
  };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * The review signals for this upload.
 *
 * Every one of them is a hint for a person. None is evidence, and none removes
 * anything on its own. Only a `high` signal holds a photograph back, and the
 * single thing that earns `high` is the camera's own position disagreeing with
 * the place the member credited — the one case where publishing straight away
 * could mislabel somewhere real on a public map.
 */
function reviewSignals(input: {
  exif: PublishInput['exif'];
  capture: PublishInput['capture'];
  shareExifGps: boolean;
  location: ChosenLocation | null;
  width: number | null;
  height: number | null;
}): UploadSignal[] {
  const signals: UploadSignal[] = [];
  const { exif, capture, location, width, height } = input;

  const hasAnyExif =
    exif !== null &&
    (exif.cameraBrand !== null ||
      exif.cameraModel !== null ||
      exif.capturedAt !== null ||
      exif.iso !== null ||
      exif.aperture !== null);

  if (!hasAnyExif) {
    signals.push({
      kind: 'exif-missing',
      severity: 'info',
      message:
        'No camera metadata was read from the file. Missing EXIF is common and proves nothing either way.',
    });
  }

  const exifModel = exif?.cameraModel ?? null;
  if (
    exifModel !== null &&
    capture.cameraModel !== null &&
    exifModel.toLowerCase() !== capture.cameraModel.toLowerCase()
  ) {
    signals.push({
      kind: 'exif-conflict',
      severity: 'info',
      message: `The file records a ${exifModel}; the upload credits a ${capture.cameraModel}. Correcting a camera name is ordinary.`,
    });
  }

  const exifGps = exif?.gps ?? null;
  if (
    input.shareExifGps &&
    exifGps !== null &&
    location !== null &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number'
  ) {
    const metres = Math.round(
      distanceMetres(exifGps, { latitude: location.latitude, longitude: location.longitude }),
    );
    if (metres > EXIF_CONFLICT_METRES) {
      signals.push({
        kind: 'exif-conflict',
        severity: 'high',
        message: `The position in the file sits ${metres} m from ${location.name}, so a moderator checks the credited place before this appears.`,
        relatedLabel: location.name,
      });
    }
  }

  if (
    (width !== null && width < UPLOAD_POLICY.minPixelWidth) ||
    (height !== null && height < UPLOAD_POLICY.minPixelHeight)
  ) {
    signals.push({
      kind: 'low-resolution',
      severity: 'warn',
      message: `Stored at ${width ?? '?'}×${height ?? '?'}, below the ${UPLOAD_POLICY.minPixelWidth}×${UPLOAD_POLICY.minPixelHeight} FRAME asks for.`,
    });
  }

  return signals;
}

/**
 * What of the readout is kept on the record.
 *
 * The position is never written here: it has its own consent-gated columns
 * below. The capture date is dropped unless the member chose to publish it,
 * because the metadata row of a published photograph is readable by anyone and
 * a capture time can place a person somewhere on a particular evening.
 */
function exifSourceRecord(
  exif: PublishInput['exif'],
  publishCapturedAt: boolean,
): Record<string, unknown> | null {
  if (exif === null) return null;

  return {
    cameraBrand: exif.cameraBrand,
    cameraModel: exif.cameraModel,
    lensBrand: exif.lensBrand,
    lensModel: exif.lensModel,
    focalLengthMm: exif.focalLengthMm,
    aperture: exif.aperture,
    shutterSpeed: exif.shutterSpeed,
    iso: exif.iso,
    capturedAt: publishCapturedAt ? exif.capturedAt : null,
    width: exif.width,
    height: exif.height,
    /** True when the file held a position that was deliberately not recorded. */
    positionWithheld: exif.gps !== null,
    readAt: new Date().toISOString(),
  };
}

export async function publishPhotograph(
  input: unknown,
): Promise<ActionResult<{ slug: string; status: PublicationStatus; signals: UploadSignal[] }>> {
  const guard = await guardUploader('publish a photograph');
  if (!guard.ok) return guard.result;
  const { viewer } = guard;

  const limited = await limitUploadOperation('publish', viewer.id, 'photographs');
  if (limited) return limited;

  const parsed = parseForm(input, publishInputSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);
  const payload = parsed.data;

  const supabase = await createClient();
  const owned = await loadOwnedPhotograph(supabase, payload.photographId, viewer.id);
  if (!owned.ok) return owned.result;
  const photograph = owned.photograph;

  if (photograph.status === 'removed') {
    return fail(
      'This photograph was removed by a moderator, so it cannot be published from here.',
      'forbidden',
    );
  }

  // The sizes the site serves have to exist first: without them a card has
  // nothing to render but the original, which is the one file a reader must
  // never be sent.
  const { data: imageRows, error: imagesError } = await supabase
    .from('photograph_images')
    .select('variant, width, height')
    .eq('photograph_id', photograph.id);

  if (imagesError) {
    return fail('The stored sizes could not be read. Try again in a moment.', 'unknown');
  }

  const variants = new Map<string, { width: number | null; height: number | null }>();
  for (const row of (imageRows ?? []) as Array<{
    variant: string | null;
    width: number | null;
    height: number | null;
  }>) {
    if (row.variant) variants.set(row.variant, { width: row.width, height: row.height });
  }

  const required: ImageVariantName[] = ['grid', 'display'];
  const missing = required.filter((name) => !variants.has(name));
  if (missing.length > 0) {
    return fail(
      `This upload is not finished: the ${missing.join(' and ')} ${missing.length === 1 ? 'size has' : 'sizes have'} not been generated. Send the file again and wait for processing to finish.`,
      'conflict',
    );
  }

  let location: ChosenLocation | null = null;
  if (payload.locationId !== null) {
    location = await resolveLocation(supabase, payload.locationId);
    if (!location) {
      return fail('That place is not an approved FRAME location.', 'validation', {
        locationId: 'Choose a place from the list, or propose a new one for review.',
      });
    }
  }

  const displaySize = variants.get('display') ?? null;
  const width = displaySize?.width ?? photograph.imageWidth;
  const height = displaySize?.height ?? photograph.imageHeight;

  const signals = reviewSignals({
    exif: payload.exif,
    capture: payload.capture,
    shareExifGps: payload.shareExifGps,
    location,
    width,
    height,
  });

  const needsReview = signals.some((signal) => signal.severity === 'high');
  const status: PublicationStatus = needsReview ? 'under_review' : 'published';
  const publishCapturedAt = payload.capturedAt !== null;
  const sharedGps = payload.shareExifGps ? (payload.exif?.gps ?? null) : null;
  const now = new Date().toISOString();

  // Written before the photograph row, so a metadata failure cannot leave a
  // published photograph with no record of how it was made.
  const { error: metadataError } = await supabase.from('photograph_metadata').upsert(
    {
      photograph_id: photograph.id,
      camera_brand_text: payload.capture.cameraBrand,
      camera_model_text: payload.capture.cameraModel,
      lens_brand_text: payload.capture.lensBrand,
      lens_model_text: payload.capture.lensModel,
      focal_length_mm: payload.capture.focalLengthMm,
      aperture: payload.capture.aperture,
      shutter_speed: payload.capture.shutterSpeed,
      iso: payload.capture.iso,
      editing_software: payload.editing.software,
      editing_notes: payload.editing.notes,
      exif_source: exifSourceRecord(payload.exif, publishCapturedAt),
      // Stored only on an explicit choice. Consent still does not publish the
      // point: a place reaches the map when a moderator approves a submission,
      // and what is published is rounded by policy.
      exif_gps_latitude: sharedGps?.latitude ?? null,
      exif_gps_longitude: sharedGps?.longitude ?? null,
      exif_gps_consent: sharedGps !== null,
    },
    { onConflict: 'photograph_id' },
  );

  if (metadataError) {
    console.error(`FRAME upload: saving capture metadata failed — ${metadataError.message}`);
    return fail(
      'The camera details could not be saved, so nothing was published. Try again in a moment.',
      'unknown',
    );
  }

  const { data: published, error: publishError } = await supabase
    .from('photographs')
    .update({
      title: payload.title,
      description: payload.description,
      alt_text: payload.altText,
      category: payload.category,
      location_id: payload.locationId,
      captured_at: payload.capturedAt,
      publish_captured_at: publishCapturedAt,
      // The moment the member ticked the box. The whole copyright policy rests
      // on this declaration, so the timestamp is the record of it.
      rights_confirmed_at: now,
      status,
      published_at: status === 'published' ? now : null,
    })
    .eq('id', photograph.id)
    .eq('owner_id', viewer.id)
    .select('slug, status')
    .maybeSingle();

  if (publishError || !published) {
    console.error(
      `FRAME upload: publishing ${photograph.id} failed — ${publishError?.message ?? 'no row returned'}`,
    );
    return fail(
      'This photograph could not be published. Nothing was changed, so you can try again.',
      'unknown',
    );
  }

  const row = published as { slug: string; status: PublicationStatus };

  revalidatePath('/');
  revalidatePath('/discover');
  revalidatePath('/community');
  revalidatePath(`/photographs/${row.slug}`);
  revalidatePath(`/photographers/${viewer.username}`);
  if (location) {
    revalidatePath('/locations');
    revalidatePath(`/locations/${location.slug}`);
    revalidatePath('/map');
  }
  if (row.status === 'under_review') revalidatePath('/moderation');

  return ok(
    { slug: row.slug, status: row.status, signals },
    row.status === 'published'
      ? 'Your photograph is published.'
      : 'Your photograph is with a moderator before it appears.',
  );
}

/* ------------------------------------------------------------------------ */
/* discardDraft                                                              */
/* ------------------------------------------------------------------------ */

export async function discardDraft(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const guard = await guardUploader('discard an upload');
  if (!guard.ok) return guard.result;
  const { viewer } = guard;

  const limited = await limitUploadOperation('discard', viewer.id, 'discarded uploads');
  if (limited) return limited;

  const parsed = parseForm(input, discardDraftSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const resolved = resolveDriver();
  if (!resolved.ok) return resolved.result;

  const supabase = await createClient();
  const owned = await loadOwnedPhotograph(supabase, parsed.data.photographId, viewer.id);
  if (!owned.ok) return owned.result;
  const photograph = owned.photograph;

  if (photograph.status === 'published') {
    return fail(
      'This photograph is published. Taking published work down is a separate request, so that an appreciation count and a place entry are not deleted by accident.',
      'conflict',
    );
  }

  const keys = storageKeys(photograph.id, viewer.id);

  // Objects first: a deleted row leaves nothing pointing at them, and the
  // orphan would be the original — the one file with the full metadata block
  // still in it.
  try {
    await resolved.driver.remove([keys.original, keys.thumb, keys.grid, keys.display, keys.full]);
  } catch (error) {
    console.error(
      `FRAME upload: deleting the objects for ${photograph.id} failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return fail(
      'The stored image could not be deleted, so the draft was kept rather than leaving files behind with nothing pointing at them. Try again in a moment.',
      'unknown',
    );
  }

  const { error: deleteError } = await supabase
    .from('photographs')
    .delete()
    .eq('id', photograph.id)
    .eq('owner_id', viewer.id);

  if (deleteError) {
    console.error(`FRAME upload: deleting draft ${photograph.id} failed — ${deleteError.message}`);
    return fail(
      'The stored image was deleted but the draft record could not be. Reload the page and try again.',
      'unknown',
    );
  }

  revalidatePath(`/photographers/${viewer.username}`);

  return ok({ slug: photograph.slug }, 'That upload has been discarded.');
}
