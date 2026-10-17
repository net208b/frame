import sharp from 'sharp';
// sharp 0.35 resolves to its ESM typings, which export these as named types
// rather than as a `sharp` namespace.
import type { Metadata, Sharp, SharpOptions } from 'sharp';

import { UPLOAD_POLICY } from '@/lib/config';
import { IMAGE_VARIANTS } from '@/lib/images/variants';
import { formatFileSize } from '@/lib/utils';
import type { ImageVariantName } from '@/types/domain';

/**
 * Turning an uploaded original into the sizes the site actually serves.
 *
 * Two things this module exists for, both of which are easy to mistake for
 * optimisation and are not:
 *
 * 1. **Derivatives.** A gallery request must never download an original. A
 *    full-frame export runs 8–40 MB; a 24-image grid of them is twenty minutes
 *    of a phone's data allowance and a bill nobody budgeted for. So every
 *    upload produces the four sizes in `IMAGE_VARIANTS` and the original is
 *    kept only as the source for re-processing.
 *
 * 2. **Stripping metadata.** Every derivative is written with no EXIF, no XMP,
 *    no IPTC and no GPS. That is a privacy requirement, not a byte saving: an
 *    original routinely carries the coordinates of where the photographer was
 *    standing, their name, their camera's serial number and the software on
 *    their machine, and publishing a file is not consent to publish any of it.
 *    FRAME asks separately about location, and rounds what it publishes.
 *    The one thing a derivative does carry is a standard sRGB colour profile,
 *    which describes the pixels and identifies no person, place or device.
 *
 * Server only: sharp is a native module and must never reach a browser bundle.
 */

/**
 * A ceiling on decoded pixels, well above a 100 MP medium-format file and far
 * below what a crafted file can claim. Without it a 40 KB upload can ask for
 * tens of gigabytes of memory.
 */
const LIMIT_INPUT_PIXELS = 120_000_000;

/**
 * Abort on a decode error but tolerate a warning. A JPEG with trailing rubbish
 * from a card reader decodes to exactly the right image, and refusing it would
 * be a worse answer than accepting it. Both functions here use the same
 * setting, so what verification accepts is what processing can read.
 */
const SHARP_INPUT: SharpOptions = {
  limitInputPixels: LIMIT_INPUT_PIXELS,
  failOn: 'error',
};

/** Widened from the policy's literal tuple so a runtime string can be tested. */
const ACCEPTED_MIME_TYPES: readonly string[] = UPLOAD_POLICY.acceptedMimeTypes;

export type VerifiedImage =
  | { ok: true; mimeType: string; width: number; height: number }
  | { ok: false; reason: string };

export interface BuiltVariant {
  name: ImageVariantName;
  bytes: Uint8Array;
  width: number;
  height: number;
  contentType: string;
}

function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error('lib/images/process runs on the server only: sharp is a native module.');
  }
}

function toInput(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/**
 * The media type of what was actually decoded.
 *
 * Taken from sharp, never from the client: a `.jpg` named file declaring
 * `image/jpeg` can hold anything at all. AVIF is reported by libvips as HEIF
 * compressed with AV1, so that pair is what identifies it — and HEIC, which is
 * the same container with a different codec, stays unaccepted.
 */
function mediaTypeOf(metadata: Metadata): string | null {
  if (metadata.mediaType !== undefined && ACCEPTED_MIME_TYPES.includes(metadata.mediaType)) {
    return metadata.mediaType;
  }

  switch (metadata.format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heif':
      return metadata.compression === 'av1' ? 'image/avif' : null;
    default:
      return null;
  }
}

const ACCEPTED_FORMATS_SENTENCE = 'FRAME accepts JPEG, PNG, WebP and AVIF photographs.';

/**
 * Check that bytes are an image FRAME accepts, large enough to be worth
 * publishing, and decodable.
 *
 * Returns a reason instead of throwing, because every one of these outcomes is
 * something a member can act on, and the wizard shows the reason verbatim.
 */
export async function verifyImageBytes(
  bytes: Uint8Array | ArrayBuffer,
): Promise<VerifiedImage> {
  assertServer();
  const input = toInput(bytes);

  if (input.byteLength === 0) {
    return { ok: false, reason: 'That file is empty.' };
  }

  if (input.byteLength > UPLOAD_POLICY.maxFileBytes) {
    return {
      ok: false,
      reason: `That file is ${formatFileSize(input.byteLength)}. The limit is ${formatFileSize(UPLOAD_POLICY.maxFileBytes)}.`,
    };
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, SHARP_INPUT).metadata();
  } catch {
    return {
      ok: false,
      reason: `That file could not be read as an image. ${ACCEPTED_FORMATS_SENTENCE}`,
    };
  }

  const mimeType = mediaTypeOf(metadata);
  if (mimeType === null) {
    return { ok: false, reason: `That file is not a format FRAME can publish. ${ACCEPTED_FORMATS_SENTENCE}` };
  }

  if ((metadata.pages ?? 1) > 1) {
    return {
      ok: false,
      reason: 'That file holds more than one frame. FRAME publishes single photographs, not animations.',
    };
  }

  // Dimensions with the EXIF rotation applied, which is what a viewer sees: a
  // portrait photograph from a phone is 3024 x 4032 on screen and 4032 x 3024
  // in the file.
  const { width, height } = metadata.autoOrient;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { ok: false, reason: 'That image has no readable dimensions.' };
  }

  if (width < UPLOAD_POLICY.minPixelWidth || height < UPLOAD_POLICY.minPixelHeight) {
    return {
      ok: false,
      reason: `That image is ${width} by ${height} pixels. FRAME needs at least ${UPLOAD_POLICY.minPixelWidth} by ${UPLOAD_POLICY.minPixelHeight}.`,
    };
  }

  return { ok: true, mimeType, width, height };
}

/**
 * Encode one derivative in the format `IMAGE_VARIANTS` declares for it.
 *
 * No `keepMetadata`, `keepExif` or `keepIccProfile` call appears anywhere in
 * this module: sharp drops every tag by default, and that default is the
 * privacy guarantee. `withIccProfile('srgb')` converts a wide-gamut original
 * into sRGB rather than leaving its pixels to be misread as sRGB, which is a
 * statement about colour and not about the photographer.
 */
function encode(pipeline: Sharp, format: 'webp' | 'avif', quality: number): Sharp {
  const managed = pipeline.withIccProfile('srgb');
  return format === 'avif' ? managed.avif({ quality }) : managed.webp({ quality });
}

/**
 * Build every derivative in `IMAGE_VARIANTS`.
 *
 * Never upscales: a variant wider than the source is written at the source
 * width, so a small original stays honest about its size instead of being
 * stretched into a soft imitation of a large one.
 */
export async function buildVariants(bytes: Uint8Array | ArrayBuffer): Promise<BuiltVariant[]> {
  assertServer();
  const input = toInput(bytes);
  const metadata = await sharp(input, SHARP_INPUT).metadata();
  const sourceWidth = metadata.autoOrient.width;

  // `IMAGE_VARIANTS` is keyed by the whole of `ImageVariantName`, so its
  // entries are every variant, in the order they are declared.
  const variants = Object.entries(IMAGE_VARIANTS) as Array<
    [ImageVariantName, (typeof IMAGE_VARIANTS)[ImageVariantName]]
  >;

  const built: BuiltVariant[] = [];

  // One at a time: four simultaneous decodes of a 25 MB original is a lot of
  // memory for a serverless function, and the wall-clock saving is small.
  for (const [name, variant] of variants) {
    const targetWidth = Math.min(variant.width, sourceWidth > 0 ? sourceWidth : variant.width);

    const pipeline = sharp(input, SHARP_INPUT)
      // Apply the EXIF orientation and drop the tag, so the derivative is
      // upright for every viewer rather than only the ones that read EXIF.
      .rotate()
      .resize({ width: targetWidth, fit: 'inside', withoutEnlargement: true });

    const { data, info } = await encode(pipeline, variant.format, variant.quality).toBuffer({
      resolveWithObject: true,
    });

    built.push({
      name,
      bytes: new Uint8Array(data),
      width: info.width,
      height: info.height,
      contentType: `image/${variant.format}`,
    });
  }

  return built;
}

/**
 * A base64 data URL small enough to inline, for `next/image`'s `blurDataURL`.
 *
 * Throws if the bytes cannot be decoded. A caller that has already run
 * {@link verifyImageBytes} can treat that as a bug; a caller that has not
 * should catch it and carry on, because a missing placeholder is cosmetic and
 * is not worth failing an upload over.
 */
export async function blurPlaceholder(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  assertServer();

  const { data } = await sharp(toInput(bytes), SHARP_INPUT)
    .rotate()
    .resize({ width: 16, height: 16, fit: 'inside' })
    .blur(1.1)
    .webp({ quality: 40, effort: 0 })
    .toBuffer({ resolveWithObject: true });

  return `data:image/webp;base64,${data.toString('base64')}`;
}
