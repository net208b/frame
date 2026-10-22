'use server';

import { randomUUID } from 'node:crypto';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { fail, ok, type ActionResult } from '@/lib/action-result';
import { getViewer, getViewerSuspension, type Viewer } from '@/lib/auth';
import { isDemoMode, UPLOAD_POLICY } from '@/lib/config';
import { distanceMetres } from '@/lib/geo';
import { FINGERPRINT_METHOD, fingerprint } from '@/lib/images/fingerprint';
import { blurPlaceholder, buildVariants, verifyImageBytes } from '@/lib/images/process';
import { readExif, type ExifReadout } from '@/lib/images/exif';
import { assessCameraEvidence, type ExifVerdict } from '@/lib/images/exif-gate';
import { checkImageContent, type ContentCheckResult } from '@/lib/moderation/content-check';
import { storageKeys } from '@/lib/images/variants';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  StorageConfigurationError,
  storageDriver,
  type SignedUploadGrant,
  type StorageDriver,
} from '@/lib/storage';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { scheduleTranslation } from '@/lib/translation/store';
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
 * What an action is doing, for the sentences that name it.
 *
 * A key rather than an English verb. The refusals used to be assembled —
 * `Sign in to ${verb}.` — which reads fine in English and cannot be translated:
 * Thai puts the verb somewhere else in the sentence, and a translator handed a
 * fragment has nothing to work with. Each of these selects a whole sentence
 * from `upload.actions.signedOut` and `upload.actions.suspended` instead.
 */
type UploaderAction = 'upload' | 'process' | 'publish' | 'discard' | 'delete';

/** The upload surface's own messages, as `account` and `auth` already do it. */
async function messages() {
  return getTranslations('upload');
}

/**
 * Capability, identity and standing, in that order.
 *
 * A suspended member is returned by `getViewer()` on purpose — the pages they
 * can still reach have to be able to explain the suspension — so every write
 * path has to ask about it separately.
 */
async function guardUploader(action: UploaderAction): Promise<Guard> {
  const t = await messages();

  if (isDemoMode()) {
    return { ok: false, result: fail(t('actions.notConfigured'), 'not_configured') };
  }

  const viewer = await getViewer();
  if (!viewer) {
    return { ok: false, result: fail(t('actions.signedOut', { action }), 'unauthenticated') };
  }

  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    // The reason is a moderator's own sentence, in whatever language they wrote
    // it. It is appended rather than interpolated into the refusal so that the
    // translated half stays one whole unit and the quoted half stays theirs.
    const refusal = t('actions.suspended', { action });
    return {
      ok: false,
      result: fail(
        suspension.reason ? `${refusal} ${suspension.reason}` : refusal,
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
async function resolveDriver(): Promise<
  { ok: true; driver: StorageDriver } | { ok: false; result: ActionResult<never> }
> {
  try {
    return { ok: true, driver: storageDriver() };
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return {
        ok: false,
        result: fail(
          // The driver's own sentence names the variable that is missing. It
          // is an operator's message rather than a member's, so it is appended
          // whole rather than translated.
          (await messages())('actions.storageNotConfigured', { detail: error.message }),
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
): Promise<ActionResult<never> | null> {
  const t = await messages();

  const perHour = await checkRateLimit(
    `upload:${operation}:hour:${viewerId}`,
    UPLOAD_POLICY.maxUploadsPerHour,
    HOUR_SECONDS,
  );
  if (!perHour.allowed) {
    return fail(
      t('actions.rateLimitedHour', {
        operation,
        limit: UPLOAD_POLICY.maxUploadsPerHour,
        minutes: Math.max(1, Math.ceil(perHour.retryAfterSeconds / 60)),
      }),
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
      t('actions.rateLimitedDay', {
        operation,
        limit: UPLOAD_POLICY.maxUploadsPerDay,
        hours: Math.max(1, Math.ceil(perDay.retryAfterSeconds / 3600)),
      }),
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
  const t = await messages();
  const { count, error } = await supabase
    .from('photographs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', viewerId)
    .in('status', [...PENDING_STATUSES]);

  if (error) {
    console.error(`FRAME upload: counting uploads in progress failed — ${error.message}`);
    return fail(t('actions.pendingCountFailed'), 'unknown');
  }

  const pending = count ?? 0;
  if (pending >= UPLOAD_POLICY.maxPendingUploads) {
    return fail(
      t('actions.pendingLimit', { pending, limit: UPLOAD_POLICY.maxPendingUploads }),
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
  const t = await messages();
  const { data, error } = await supabase
    .from('photographs')
    .select('id, owner_id, slug, status, image_width, image_height')
    .eq('id', photographId)
    .eq('owner_id', viewerId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      result: fail(t('actions.readFailed'), 'unknown'),
    };
  }

  const row = data as OwnedPhotographRow | null;

  // Indistinguishable from "does not exist", deliberately: a member must not be
  // able to learn that somebody else's photograph id is real.
  if (!row || row.owner_id !== viewerId) {
    return {
      ok: false,
      result: fail(t('actions.notYours'), 'not_found'),
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

/**
 * The address a frame is published at, derived from its title.
 *
 * Slugs are `^[a-z0-9]+(-[a-z0-9]+)*$` — the schema's own CHECK — so `slugify`
 * keeps the Latin letters and digits of a title and drops everything else. A
 * title written in Thai, Japanese, Korean, Arabic or Greek has none of those,
 * and folds to the empty string.
 *
 * WHAT WENT WRONG. The fallback for an empty fold was the literal word
 * `photograph`, returned as the first attempt. So the first frame titled
 * "ตลาดเช้าบางกะปิ" was published at `/photographs/photograph`, which says
 * nothing about it, and the next one had to lose a unique-violation race
 * before it got an address at all. The attempts after the first appended
 * `Math.random()`, so the same draft retried could land anywhere, and four
 * attempts was the whole budget.
 *
 * WHAT IT DOES NOW. A title that folds to nothing is not translated here —
 * nothing has been published yet, so there is no translation to read (0035),
 * and transliterating one script well, let alone all of them, is not something
 * this function can honestly claim to do. Instead the address is built from
 * what the row actually knows: the member's username, which the schema already
 * constrains to this same charset, and a slice of the photograph's own id.
 * `nirutrps-7f3a9c1d` says whose frame it is and is unique by construction,
 * which beats `photograph` on both counts.
 *
 * THE DISCRIMINATOR IS THE ID, NOT A RANDOM STRING. Two members publishing
 * "Rain" on the same evening collide, and the retry has to separate them. The
 * id does that without luck: no two rows share one, so the first retry is
 * already the last one it needs, and a draft retried after a dropped response
 * asks for the same address rather than a new one.
 */
interface SlugSeed {
  /** The readable part of the address. */
  base: string;
  /** False when the title folded to nothing and the base is a stand-in. */
  fromTitle: boolean;
}

function slugBase(title: string, username: string): SlugSeed {
  const fromTitle = slugify(title).replace(/-+$/, '');
  if (fromTitle.length > 0) return { base: fromTitle, fromTitle: true };

  const fromUsername = slugify(username).replace(/-+$/, '');
  return { base: fromUsername.length > 0 ? fromUsername : 'photograph', fromTitle: false };
}

/** Hex out of the row's own id: `[0-9a-f]`, so always a legal slug segment. */
function idDiscriminator(photographId: string, length: number): string {
  return photographId.replace(/[^0-9a-f]/gi, '').toLowerCase().slice(0, length);
}

function slugAttempt(seed: SlugSeed, attempt: number, photographId: string): string {
  // A stand-in base is shared by every frame this member titles in their own
  // script, so it carries the discriminator from the first attempt instead of
  // waiting to lose a race for it.
  if (attempt === 0 && seed.fromTitle) return seed.base;

  const trimmed = seed.base.slice(0, 60).replace(/-+$/, '') || 'photograph';
  // Eight hex digits of a uuid, widened on each retry. The widening is there
  // so the loop has somewhere to go, not because the first slice is expected
  // to collide — it cannot collide with this row's own id, and a different
  // row would have to match both the base and the first eight digits.
  const suffix = idDiscriminator(photographId, Math.min(8 + attempt * 4, 32));
  return suffix.length > 0 ? `${trimmed}-${suffix}` : `${trimmed}-${attempt + 1}`;
}

export async function createDraft(
  input: unknown,
): Promise<ActionResult<{ photographId: string; storagePrefix: string; slug: string }>> {
  const guard = await guardUploader('upload');
  if (!guard.ok) return guard.result;
  const t = await messages();
  const { viewer } = guard;

  const limited = await limitUploadOperation('create', viewer.id);
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
  const seed = slugBase(draft.title, viewer.username);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = slugAttempt(seed, attempt, photographId);

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
        t('actions.createFailed'),
        'unknown',
      );
    }
  }

  return fail(
    t('actions.slugFailed'),
    'conflict',
    { title: 'This title could not be turned into a free web address.' },
  );
}

/* ------------------------------------------------------------------------ */
/* attachVariants                                                            */
/* ------------------------------------------------------------------------ */

const attachInputSchema = z.object({
  photographId: discardDraftSchema.shape.photographId,
  /** The member says this is a scanned negative — see lib/images/exif-gate. */
  filmDeclared: z.boolean().optional().transform((value) => value === true),
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
  // Through the driver, from the private originals bucket (0031) — never
  // through a public address, which an original no longer has.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(500);

    let bytes: Uint8Array | null;
    try {
      bytes = await driver.readOriginal(key);
    } catch (error) {
      console.error(
        `FRAME upload: reading ${key} back from storage failed — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    if (bytes === null) continue;

    // The bucket's own file_size_limit caps this already; checked again
    // because the number that matters is the one this code believes.
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
  const guard = await guardUploader('process');
  if (!guard.ok) return guard.result;
  const t = await messages();
  const { viewer } = guard;

  // Processing is the expensive step — four encodes of a file up to 25 MB — so
  // it carries the upload policy's limits in its own right.
  const limited = await limitUploadOperation('process', viewer.id);
  if (limited) return limited;

  const parsed = parseForm(input, attachInputSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const resolved = await resolveDriver();
  if (!resolved.ok) return resolved.result;
  const driver = resolved.driver;

  const supabase = await createClient();
  const owned = await loadOwnedPhotograph(supabase, parsed.data.photographId, viewer.id);
  if (!owned.ok) return owned.result;
  const photograph = owned.photograph;

  if (photograph.status === 'published' || photograph.status === 'removed') {
    return fail(
      t('actions.notADraft'),
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
  // Every way out of processing that is not success takes the original with
  // it. It lives in the private originals bucket (0031), but it still carries
  // the file's EXIF, a GPS position included, and FRAME keeps nothing it does
  // not need — and nothing is lost by deleting it: a retry from the wizard
  // uploads the file again before it calls this action.
  const discardOriginal = async (): Promise<void> => {
    try {
      await driver.remove([keys.original]);
    } catch (error) {
      console.error(
        `FRAME upload: deleting the original for ${photograph.id} after a failed attempt failed — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  await setStatus('processing');

  const original = await fetchStoredOriginal(driver, keys.original);
  if (!original.ok) {
    await setStatus('draft');
    await discardOriginal();
    return fail(original.reason, 'not_found');
  }

  // The real magic bytes, read by sharp. The type the browser declared was only
  // ever a hint for failing fast in the form.
  const verified = await verifyImageBytes(original.bytes);
  if (!verified.ok) {
    await setStatus('draft');
    await discardOriginal();
    return fail(verified.reason, 'validation', { file: verified.reason });
  }

  // THE CAMERA-ONLY RULE, on the bytes that arrived — never on what the form
  // said. The verdict is written with the service role whatever it is, so a
  // moderator can see what the file carried, and the trigger in 0021 will not
  // let this photograph go to review without a `camera` on file. A refused
  // file is removed from storage: it will not be published, and it may carry
  // a position the member never agreed to publish.
  const readout = await readExif(original.bytes.slice().buffer);
  const verdict = assessCameraEvidence(readout, { filmDeclared: parsed.data.filmDeclared });
  const recorded = await recordExifCheck(photograph.id, readout, verdict, parsed.data.filmDeclared);
  if (!recorded) {
    await setStatus('draft');
    await discardOriginal();
    return fail(t('actions.exifNotRecorded'), 'unknown');
  }
  if (verdict.verdict === 'rejected') {
    await setStatus('draft');
    await discardOriginal();
    const reason = await describeExifRefusal(verdict);
    return fail(reason, 'validation', { file: reason });
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
    await discardOriginal();
    return fail(
      t('actions.variantsFailed'),
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

  // The perceptual fingerprint (0037), from the display derivative so the
  // backfill script computes the same value from the public file. A failure
  // is logged and the upload continues: the fingerprint is a hint for the
  // review queue, and an upload with no hint still goes to a person.
  await recordFingerprint(
    photograph.id,
    built.find((variant) => variant.name === 'display')?.bytes ?? original.bytes,
  );

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
    await discardOriginal();
      return fail(
        t('actions.storageRefused'),
        'unknown',
      );
    }

    if (!(await putWithGrant(grant, variant.bytes))) {
      await setStatus('draft');
    await discardOriginal();
      return fail(
        t('actions.variantFailed', { variant: variant.name }),
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
    await discardOriginal();
    return fail(
      t('actions.variantsNotRecorded'),
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
    await discardOriginal();
    return fail(
      t('actions.recordNotUpdated'),
      'unknown',
    );
  }

  // The automated content check, on the display size: re-encoded, stripped of
  // every tag, and the size a reader actually sees. Its answer is written with
  // the service role into a table members cannot write, because publishPhotograph
  // trusts it. A failure here never fails the upload — the photograph simply
  // goes to a person instead of publishing on its own.
  const displayBytes = built.find((variant) => variant.name === 'display')?.bytes ?? null;
  await recordContentCheck(photograph.id, displayBytes);

  // The original has done its job. It is in the private originals bucket
  // (0031), with no public address, but it still carries the file's EXIF —
  // including a GPS position the member may have chosen not to publish — and
  // every size FRAME serves now exists, so it goes. A failure is logged and
  // does not fail the upload: the member has done nothing wrong.
  try {
    await driver.remove([keys.original]);
  } catch (error) {
    console.error(
      `FRAME upload: deleting the original for ${photograph.id} failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return ok({ variants: rows.map((row) => row.variant), width, height });
}

/**
 * Run the content check and store its answer, as the service role.
 *
 * Without a service-role key nothing can be stored, and publishPhotograph will
 * find no clear answer and send the upload to review — the safe failure.
 */
/**
 * A ceiling on paid classifier calls per UTC day.
 *
 * Google offers no daily quota for Cloud Vision — only a per-minute rate — so
 * the cap lives here. Past it the check is not called and the upload goes to a
 * person, which bounds the bill however many uploads arrive: the default of
 * 2,000 a day is at most about $90 a month past the free tier.
 */
const CONTENT_CHECK_DAILY_LIMIT = (() => {
  const value = Number(process.env.CONTENT_CHECK_DAILY_LIMIT);
  return Number.isInteger(value) && value >= 0 ? value : 2_000;
})();

async function contentChecksToday(): Promise<number | null> {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count, error } = await createAdminClient()
      .from('photograph_content_checks')
      .select('photograph_id', { count: 'exact', head: true })
      .eq('provider', 'google_vision_safesearch')
      .gte('checked_at', startOfDay.toISOString());
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

async function recordContentCheck(photographId: string, image: Uint8Array | null): Promise<void> {
  // An unknown count is treated as "at the limit": a check that cannot prove it
  // is within budget does not spend.
  const usedToday = image ? await contentChecksToday() : null;
  const overBudget = usedToday === null || usedToday >= CONTENT_CHECK_DAILY_LIMIT;

  const result: ContentCheckResult = image && !overBudget
    ? await checkImageContent(image)
    : {
        provider: 'none',
        verdict: 'unavailable',
        adult: null,
        racy: null,
        violence: null,
        medical: null,
        spoof: null,
        note: image
          ? 'The automated check has reached its daily limit, so a person reviews this upload.'
          : 'No display size was generated, so the automated check could not run.',
      };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from('photograph_content_checks').upsert(
      {
        photograph_id: photographId,
        provider: result.provider,
        verdict: result.verdict,
        adult: result.adult,
        racy: result.racy,
        violence: result.violence,
        medical: result.medical,
        spoof: result.spoof,
        note: result.note,
        checked_at: new Date().toISOString(),
      },
      { onConflict: 'photograph_id' },
    );
    if (error) {
      console.error(`FRAME upload: recording the content check for ${photographId} failed — ${error.message}`);
    }
  } catch (error) {
    console.error(
      `FRAME upload: the content check for ${photographId} could not be recorded — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Store the EXIF verdict, as the service role. Returns false when it could
 * not be stored — and then the upload stops, because without a record the
 * trigger would refuse the photograph later with a sentence that would not
 * make sense to the member.
 */
async function recordExifCheck(
  photographId: string,
  readout: ExifReadout,
  verdict: ExifVerdict,
  filmDeclared: boolean,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('photograph_exif_checks').upsert(
      {
        photograph_id: photographId,
        verdict: verdict.verdict,
        device_class: verdict.deviceClass,
        missing: verdict.missing,
        make: readout.cameraBrand,
        model: readout.cameraModel,
        lens_make: readout.lensBrand,
        lens_model: readout.lensModel,
        body_serial: readout.bodySerial,
        lens_serial: readout.lensSerial,
        focal_length_mm: readout.focalLengthMm,
        aperture: readout.aperture,
        shutter_speed: readout.shutterSpeed,
        iso: readout.iso,
        metering_mode: readout.meteringMode,
        flash: readout.flash,
        software: readout.software,
        captured_at: readout.capturedAt,
        // A yes/no only. The coordinates stay out of this table by design.
        has_gps: readout.gps !== null,
        film_declared: filmDeclared,
        checked_at: new Date().toISOString(),
      },
      { onConflict: 'photograph_id' },
    );
    if (error) {
      console.error(`FRAME upload: recording the EXIF check for ${photographId} failed — ${error.message}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      `FRAME upload: the EXIF check for ${photographId} could not be recorded — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

/**
 * Store the perceptual fingerprint, as the service role (0037). Never throws:
 * a photograph without one simply produces no match signal, and the queue
 * still shows it to a person.
 */
async function recordFingerprint(photographId: string, bytes: Uint8Array): Promise<void> {
  try {
    const dhash = await fingerprint(bytes);
    const { error } = await createAdminClient().from('photograph_fingerprints').upsert(
      { photograph_id: photographId, dhash, method: FINGERPRINT_METHOD, computed_at: new Date().toISOString() },
      { onConflict: 'photograph_id' },
    );
    if (error) {
      console.error(`FRAME upload: recording the fingerprint for ${photographId} failed — ${error.message}`);
    }
  } catch (error) {
    console.error(
      `FRAME upload: the fingerprint for ${photographId} could not be computed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Published photographs this one looks like, as signals (0037). High
 * severity, so `publishIfCleared` holds the upload for a person — but the
 * wording keeps to what a fingerprint can actually say. It cannot tell which
 * frame came first or a crop from a copy, and a member re-uploading their own
 * work matches their own work, which the message says rather than hides.
 */
interface SimilarRow {
  match_slug: string;
  match_title: string;
  match_username: string;
  same_owner: boolean;
  distance: number;
}

async function fingerprintSignals(photographId: string): Promise<UploadSignal[]> {
  try {
    const { data, error } = await createAdminClient().rpc('similar_photographs', {
      p_photograph_ids: [photographId],
      p_max_distance: UPLOAD_POLICY.perceptualMatchMaxDistance,
    });
    if (error) {
      console.error(`FRAME upload: comparing fingerprints for ${photographId} failed — ${error.message}`);
      return [];
    }
    return ((data ?? []) as SimilarRow[]).map((match) => ({
      kind: 'perceptual-hash-match' as const,
      severity: 'high' as const,
      message: match.same_owner
        ? `Looks like “${match.match_title}”, already published by this member — ${match.distance} of 64 bits differ. A re-upload of their own work, or a near-duplicate frame.`
        : `Looks like “${match.match_title}” by @${match.match_username} — ${match.distance} of 64 bits differ. Put the two side by side; the fingerprint cannot say which came first.`,
      relatedLabel: `/photographs/${match.match_slug}`,
    }));
  } catch (error) {
    console.error(
      `FRAME upload: the fingerprint comparison for ${photographId} could not run — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

/**
 * The one signal the server adds from the EXIF verdict: a declared film scan.
 * High severity, so `publishIfCleared` never publishes it on its own — the
 * claim and the absent camera record are for a person to look at together.
 */
async function filmSignals(
  photographId: string,
  film: { stock: string | null; camera: string | null; scanner: string | null },
): Promise<UploadSignal[]> {
  try {
    const { data } = await createAdminClient()
      .from('photograph_exif_checks')
      .select('verdict, film_declared, device_class, make, model')
      .eq('photograph_id', photographId)
      .maybeSingle();
    const row = data as {
      verdict?: string;
      film_declared?: boolean;
      device_class?: string;
      make?: string | null;
      model?: string | null;
    } | null;
    if (row?.verdict === 'film') {
      // What the file itself says, and what the member said (0038). A scan
      // from a scanner names the scanner; a phone picture with its record
      // stripped names nothing. Neither proves anything — the message gives
      // the reviewer both to put beside the frame.
      const said = [film.stock, film.camera, film.scanner].filter(Boolean).join(' · ');
      const scannerNamed = row.device_class === 'scanner'
        ? `The file names a scanner: ${[row.make, row.model].filter(Boolean).join(' ')}.`
        : 'The file names no scanner and no camera.';
      return [
        {
          kind: 'film-declared',
          severity: 'high',
          message: `The member declared a film scan. ${scannerNamed} ${
            said ? `They say: ${said}.` : 'They gave no film, camera or scanner.'
          } Check the frame and the gear by eye.`,
        },
      ];
    }
  } catch (error) {
    console.error(
      `FRAME upload: reading the EXIF verdict for ${photographId} failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return [];
}

/** The refusal, in the reader's language, naming what was missing. */
async function describeExifRefusal(verdict: ExifVerdict): Promise<string> {
  const t = await messages();
  if (verdict.deviceClass === 'phone') return t('actions.exifRejectedPhone');
  // A scanner's record with the film box unticked: the one refusal that has
  // a two-second fix, so the sentence says what it is.
  if (verdict.deviceClass === 'scanner') return t('actions.exifRejectedScanner');
  const fields = verdict.missing.map((field) => t(`exifGate.fields.${field}`)).join(', ');
  return `${t('actions.exifRejectedMissing', { fields })} ${t('actions.exifRejectedHelp')}`;
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
  const guard = await guardUploader('publish');
  if (!guard.ok) return guard.result;
  const { viewer } = guard;
  const t = await messages();

  const limited = await limitUploadOperation('publish', viewer.id);
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
      t('actions.removedByModerator'),
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
    return fail(t('actions.sizesUnreadable'), 'unknown');
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
      t('actions.unfinished', { count: missing.length, sizes: missing.join(', ') }),
      'conflict',
    );
  }

  let location: ChosenLocation | null = null;
  if (payload.locationId !== null) {
    location = await resolveLocation(supabase, payload.locationId);
    if (!location) {
      return fail(t('actions.placeNotApproved'), 'validation', {
        locationId: t('actions.placeNotApprovedField'),
      });
    }
  }

  const displaySize = variants.get('display') ?? null;
  const width = displaySize?.width ?? photograph.imageWidth;
  const height = displaySize?.height ?? photograph.imageHeight;

  const signals = await filmSignals(photograph.id, payload.film);
  signals.push(...(await fingerprintSignals(photograph.id)));
  signals.push(...reviewSignals({
    exif: payload.exif,
    capture: payload.capture,
    shareExifGps: payload.shareExifGps,
    location,
    width,
    height,
  }));

  // The member's own write always lands as 'under_review' (0012 makes this a
  // database rule: an owner cannot set 'published'). Further down, the server
  // publishes it with the service role if the automated checks cleared it. A
  // photograph that is already published and is being edited stays published —
  // taking it down for a retitle would punish the member for fixing a typo.
  const alreadyPublished = photograph.status === 'published';
  const status: PublicationStatus = alreadyPublished ? 'published' : 'under_review';
  const publishCapturedAt = payload.capturedAt !== null;
  const sharedGps = payload.shareExifGps ? (payload.exif?.gps ?? null) : null;
  const now = new Date().toISOString();

  // Written before the photograph row, so a metadata failure cannot leave a
  // published photograph with no record of how it was made.
  const metadataRow = {
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
      // The member's film statements (0038). The wizard sends them empty for
      // a digital frame, and optionalText turns empty into null.
      film_stock: payload.film.stock,
      film_camera: payload.film.camera,
      film_scanner: payload.film.scanner,
      exif_source: exifSourceRecord(payload.exif, publishCapturedAt),
      // Stored only on an explicit choice. Consent still does not publish the
      // point: a place reaches the map when a moderator approves a submission,
      // and what is published is rounded by policy.
      exif_gps_latitude: sharedGps?.latitude ?? null,
      exif_gps_longitude: sharedGps?.longitude ?? null,
      exif_gps_consent: sharedGps !== null,
  };

  // Update, then insert if there was nothing to update — not an upsert. 0015
  // makes the position columns unreadable to members, and an upsert's
  // `SET col = EXCLUDED.col` counts as reading them, so it is refused. A plain
  // UPDATE or INSERT only writes them.
  const { data: updatedMetadata, error: updateMetadataError } = await supabase
    .from('photograph_metadata')
    .update(metadataRow)
    .eq('photograph_id', photograph.id)
    .select('photograph_id');

  let metadataError = updateMetadataError;
  if (!metadataError && (!Array.isArray(updatedMetadata) || updatedMetadata.length === 0)) {
    ({ error: metadataError } = await supabase.from('photograph_metadata').insert(metadataRow));
  }

  if (metadataError) {
    console.error(`FRAME upload: saving capture metadata failed — ${metadataError.message}`);
    return fail(
      t('actions.cameraFailed'),
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
      // Left as it was on a published photograph; the database refuses an owner
      // who sets it, because it is the moment a moderator published the work.
      ...(alreadyPublished ? {} : { published_at: null }),
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
      t('actions.publishFailed'),
      'unknown',
    );
  }

  const row = published as { slug: string; status: PublicationStatus };

  if (row.status === 'under_review') {
    row.status = await publishIfCleared(photograph.id, signals);
  }

  // Published means public, and public is the only state whose words are sent
  // to a translation provider (0035). An upload still waiting for a moderator
  // is not translated, and neither is one that was just held back.
  if (row.status === 'published') scheduleTranslation('photograph', photograph.id);

  revalidateLocalisedPath('/');
  revalidateLocalisedPath('/discover');
  revalidateLocalisedPath('/community');
  revalidateLocalisedPath(`/photographs/${row.slug}`);
  revalidateLocalisedPath(`/photographers/${viewer.username}`);
  if (location) {
    revalidateLocalisedPath('/locations');
    revalidateLocalisedPath(`/locations/${location.slug}`);
    revalidateLocalisedPath('/map');
  }
  if (row.status === 'under_review') revalidateLocalisedPath('/moderation');

  return ok(
    { slug: row.slug, status: row.status, signals },
    row.status === 'published'
      ? 'Your photograph is published.'
      : 'Your photograph is with a moderator before it appears.',
  );
}

/**
 * Publish an upload the automated checks cleared, as the service role.
 *
 * Three things must all hold: the content check stored at processing time says
 * `clear`, none of the upload's own signals is high-severity, and the row is
 * still 'under_review' (a moderator may have acted in between). Anything else
 * — including any failure to read or write — leaves it in the review queue,
 * which is where an unanswered question belongs.
 */
async function publishIfCleared(photographId: string, signals: UploadSignal[]): Promise<PublicationStatus> {
  if (signals.some((signal) => signal.severity === 'high')) return 'under_review';

  try {
    const admin = createAdminClient();
    const { data: check, error: checkError } = await admin
      .from('photograph_content_checks')
      .select('verdict')
      .eq('photograph_id', photographId)
      .maybeSingle();

    if (checkError || (check as { verdict?: string } | null)?.verdict !== 'clear') {
      return 'under_review';
    }

    const { data: updated, error: publishError } = await admin
      .from('photographs')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', photographId)
      .eq('status', 'under_review')
      .select('status')
      .maybeSingle();

    if (publishError || !updated) {
      if (publishError) {
        console.error(`FRAME upload: auto-publishing ${photographId} failed — ${publishError.message}`);
      }
      return 'under_review';
    }
    return 'published';
  } catch (error) {
    console.error(
      `FRAME upload: auto-publishing ${photographId} could not run — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 'under_review';
  }
}

/* ------------------------------------------------------------------------ */
/* discardDraft                                                              */
/* ------------------------------------------------------------------------ */

export async function discardDraft(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const guard = await guardUploader('discard');
  if (!guard.ok) return guard.result;
  const t = await messages();
  const { viewer } = guard;

  const limited = await limitUploadOperation('discard', viewer.id);
  if (limited) return limited;

  const parsed = parseForm(input, discardDraftSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const resolved = await resolveDriver();
  if (!resolved.ok) return resolved.result;

  const supabase = await createClient();
  const owned = await loadOwnedPhotograph(supabase, parsed.data.photographId, viewer.id);
  if (!owned.ok) return owned.result;
  const photograph = owned.photograph;

  if (photograph.status === 'published') {
    return fail(
      t('actions.alreadyPublished'),
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
      t('actions.imageNotDeleted'),
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
      t('actions.imageDeletedRecordKept'),
      'unknown',
    );
  }

  revalidateLocalisedPath(`/photographers/${viewer.username}`);

  return ok({ slug: photograph.slug }, 'That upload has been discarded.');
}

/* ------------------------------------------------------------------------ */
/* deleteOwnPhotograph                                                       */
/* ------------------------------------------------------------------------ */

/**
 * A member deletes one of their own photographs, published or not.
 *
 * discardDraft refuses published work so that a slip in the upload wizard
 * cannot take a public photograph down. This is the deliberate route: it is
 * reached from the photograph's own page, behind a confirmation that names
 * what is lost.
 *
 * Every size is deleted from storage first, then the row. The row's
 * dependants go with it (images, metadata, appreciation, collection entries,
 * the content check — all `on delete cascade`), and the location and
 * collection counters recount themselves on delete. Reports and moderation
 * decisions about it are kept: they are records of what happened, not copies
 * of the work.
 *
 * A suspended account may still do this. Suspension stops someone adding to
 * FRAME; it does not take away the right to remove their own work from it.
 */
export async function deleteOwnPhotograph(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const t = await messages();

  if (isDemoMode()) return fail(t('actions.notConfigured'), 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail(t('actions.signedOut', { action: 'delete' }), 'unauthenticated');

  const limited = await limitUploadOperation('discard', viewer.id);
  if (limited) return limited;

  const parsed = parseForm(input, discardDraftSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const resolved = await resolveDriver();
  if (!resolved.ok) return resolved.result;

  const supabase = await createClient();
  const owned = await loadOwnedPhotograph(supabase, parsed.data.photographId, viewer.id);
  if (!owned.ok) return owned.result;
  const photograph = owned.photograph;

  // Read before the row goes, for revalidating the place's pages afterwards.
  const { data: placeRow } = await supabase
    .from('photographs')
    .select('locations(slug)')
    .eq('id', photograph.id)
    .maybeSingle();
  const place = (placeRow as { locations?: { slug?: string } | Array<{ slug?: string }> | null } | null)
    ?.locations;
  const locationSlug = (Array.isArray(place) ? place[0]?.slug : place?.slug) ?? null;

  const keys = storageKeys(photograph.id, viewer.id);
  try {
    await resolved.driver.remove([keys.original, keys.thumb, keys.grid, keys.display, keys.full]);
  } catch (error) {
    console.error(
      `FRAME upload: deleting the objects for ${photograph.id} failed — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return fail(
      t('actions.filesNotDeleted'),
      'unknown',
    );
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('photographs')
    .delete()
    .eq('id', photograph.id)
    .eq('owner_id', viewer.id)
    .select('id');

  if (deleteError || !Array.isArray(deleted) || deleted.length === 0) {
    console.error(
      `FRAME upload: deleting photograph ${photograph.id} failed — ${deleteError?.message ?? 'no row deleted'}`,
    );
    return fail(
      t('actions.filesDeletedRecordKept'),
      'unknown',
    );
  }

  revalidateLocalisedPath('/');
  revalidateLocalisedPath('/discover');
  revalidateLocalisedPath('/community');
  revalidateLocalisedPath(`/photographs/${photograph.slug}`);
  revalidateLocalisedPath(`/photographers/${viewer.username}`);
  if (locationSlug) {
    revalidateLocalisedPath('/locations');
    revalidateLocalisedPath(`/locations/${locationSlug}`);
    revalidateLocalisedPath('/map');
  }
  if (photograph.status === 'under_review') revalidateLocalisedPath('/moderation');

  return ok({ slug: photograph.slug }, 'The photograph is deleted.');
}
