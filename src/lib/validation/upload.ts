import { z } from 'zod';

import { UPLOAD_POLICY } from '@/lib/config';
import { IMAGE_VARIANTS } from '@/lib/images/variants';
import { formatFileSize } from '@/lib/utils';
import { type ImageVariantName, PHOTO_CATEGORIES } from '@/types/domain';

import {
  choice,
  choiceWithDefault,
  consent,
  identifier,
  optionalDecimal,
  optionalIdentifier,
  optionalInstant,
  optionalInteger,
  optionalText,
  requiredText,
} from './fields';

/**
 * Upload schemas.
 *
 * Everything a client says about a file — its name, its declared type, its
 * size — is a claim. These schemas reject the claims that are obviously wrong
 * so a bad request never reaches storage, and `verifyImageBytes` in
 * `lib/images/process` then checks the bytes that actually arrived. Neither
 * step trusts the other.
 */

/* ------------------------------------------------------------------------ */
/* Shutter speed                                                             */
/* ------------------------------------------------------------------------ */

/** A 1/32000 electronic shutter at one end, a half-hour exposure at the other. */
const MIN_SHUTTER_SECONDS = 1 / 32_000;
const MAX_SHUTTER_SECONDS = 1_800;

/**
 * Render an exposure in seconds the way it is written on a camera: `1/250`
 * below a second, `4s` at or above one. Returns null outside the plausible
 * range so a corrupt EXIF rational cannot become a published setting.
 */
export function formatShutterSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return null;
  if (seconds < MIN_SHUTTER_SECONDS || seconds > MAX_SHUTTER_SECONDS) return null;

  if (seconds >= 1) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
  }
  return `1/${Math.round(1 / seconds)}`;
}

/**
 * Accept either way a photographer writes an exposure and normalise it.
 *
 * `1/250`, `1/250s` and `0.004` all become `1/250`; `4`, `4s` and `4 sec` all
 * become `4s`. A bare number is read as seconds, which means `250` normalises
 * to `250s` rather than `1/250` — so the wizard shows the normalised value back
 * to the member, and a misreading is visible before anything is published.
 */
export function normaliseShutterSpeed(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(secs|sec|s|")$/, '');
  if (cleaned.length === 0) return null;

  const fraction = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (fraction) {
    const [, rawNumerator, rawDenominator] = fraction;
    if (rawNumerator === undefined || rawDenominator === undefined) return null;
    const denominator = Number(rawDenominator);
    if (denominator === 0) return null;
    return formatShutterSeconds(Number(rawNumerator) / denominator);
  }

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) return formatShutterSeconds(Number(cleaned));
  return null;
}

export const shutterSpeedSchema = optionalText({ label: 'Shutter speed', max: 24 }).transform(
  (value, ctx) => {
    if (value === null) return null;
    const normalised = normaliseShutterSpeed(value);
    if (normalised === null) {
      ctx.addIssue('Write the shutter speed as 1/250 or as 4s.');
      return z.NEVER;
    }
    return normalised;
  },
);

/* ------------------------------------------------------------------------ */
/* Capture settings                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Camera settings, all optional and all bounded to what a camera can record.
 * The ISO ceiling is above the highest extended setting any shipping body
 * offers, and the aperture range spans an f/0.7 Planar to a large-format f/64.
 */
export const captureSettingsSchema = z.object({
  cameraBrand: optionalText({ label: 'Camera brand', max: 60 }),
  cameraModel: optionalText({ label: 'Camera model', max: 80 }),
  lensBrand: optionalText({ label: 'Lens brand', max: 60 }),
  lensModel: optionalText({ label: 'Lens model', max: 80 }),
  focalLengthMm: optionalInteger({
    label: 'Focal length',
    min: 1,
    max: 2_000,
    unit: 'mm',
  }),
  aperture: optionalDecimal({ label: 'Aperture', min: 0.7, max: 64 }),
  shutterSpeed: shutterSpeedSchema,
  iso: optionalInteger({ label: 'ISO', min: 3, max: 4_000_000 }),
});

export const editingDetailsSchema = z.object({
  software: optionalText({ label: 'Editing software', max: 80 }),
  notes: optionalText({ label: 'Editing notes', max: 1_200 }),
});

/**
 * What a member says about a frame scanned from film (0038). All optional:
 * the declaration is the tick-box, these are the detail a film photographer
 * has and a disguise has to invent. Ignored for a digital frame.
 */
export const filmDetailsSchema = z.object({
  stock: optionalText({ label: 'Film stock', max: 80 }),
  camera: optionalText({ label: 'Film camera', max: 80 }),
  scanner: optionalText({ label: 'Scanner', max: 80 }),
});

/* ------------------------------------------------------------------------ */
/* Files                                                                     */
/* ------------------------------------------------------------------------ */

export const photoCategorySchema = choice(
  PHOTO_CATEGORIES,
  'Choose one of the FRAME categories for this photograph.',
);

const acceptedTypeSchema = choice(
  UPLOAD_POLICY.acceptedMimeTypes,
  'FRAME accepts JPEG, PNG, WebP and AVIF photographs.',
);

const byteSizeSchema = z.coerce
  .number({ error: 'The file size is missing.' })
  .int({ error: 'The file size must be a whole number of bytes.' })
  .gte(1, { error: 'The file is empty.' })
  .lte(UPLOAD_POLICY.maxFileBytes, {
    error: `The file must be ${formatFileSize(UPLOAD_POLICY.maxFileBytes)} or smaller.`,
  });

const acceptedExtensions = UPLOAD_POLICY.acceptedExtensions;

/**
 * What the picker told us about the chosen file. Accepted so the wizard can
 * fail fast and explain the limits; never treated as proof of anything.
 */
export const uploadDraftSchema = z.object({
  fileName: requiredText({ label: 'File name', max: 255 }).refine(
    (value) => acceptedExtensions.some((extension) => value.toLowerCase().endsWith(extension)),
    { error: `The file needs one of these extensions: ${acceptedExtensions.join(', ')}.` },
  ),
  contentType: acceptedTypeSchema,
  byteSize: byteSizeSchema,
  category: photoCategorySchema,
});

/** Where a signed grant may write. `original` keeps re-processing cheap. */
const UPLOAD_TARGETS = ['original', 'thumb', 'grid', 'display', 'full'] as const;

/**
 * Taken from `IMAGE_VARIANTS` rather than written out, because that record is
 * typed over the whole of {@link ImageVariantName}: adding a derivative there
 * adds it here, and no list can drift out of date. The assertion narrows
 * `string[]` to a non-empty tuple of names, which is what `z.enum` needs.
 */
const variantNames = Object.keys(IMAGE_VARIANTS) as [ImageVariantName, ...ImageVariantName[]];

/** Derivatives are written in the format declared in `IMAGE_VARIANTS`. */
const variantContentTypes = new Set(
  Object.values(IMAGE_VARIANTS).map((variant) => `image/${variant.format}`),
);

export const signUploadSchema = z
  .object({
    photographId: identifier('Photograph reference'),
    target: choiceWithDefault(UPLOAD_TARGETS, 'original', 'That upload target does not exist.'),
    contentType: acceptedTypeSchema,
    byteSize: byteSizeSchema,
  })
  .refine(
    (value) => value.target === 'original' || variantContentTypes.has(value.contentType),
    {
      error: 'A derivative must be uploaded in the format FRAME generates for it.',
      path: ['contentType'],
    },
  );

export const attachVariantsSchema = z.object({
  photographId: identifier('Photograph reference'),
  variants: z
    .array(
      z.object({
        name: choice(variantNames, 'That derivative name does not exist.'),
        key: requiredText({ label: 'Storage key', max: 200 }),
        width: z.coerce
          .number({ error: 'The derivative width is missing.' })
          .int({ error: 'The derivative width must be a whole number.' })
          .gte(1, { error: 'The derivative width must be at least 1 pixel.' })
          .lte(20_000, { error: 'The derivative width is implausibly large.' }),
        height: z.coerce
          .number({ error: 'The derivative height is missing.' })
          .int({ error: 'The derivative height must be a whole number.' })
          .gte(1, { error: 'The derivative height must be at least 1 pixel.' })
          .lte(20_000, { error: 'The derivative height is implausibly large.' }),
        byteSize: byteSizeSchema,
      }),
    )
    .min(1, { error: 'At least one derivative is needed.' })
    .max(variantNames.length, { error: 'There are more derivatives here than FRAME generates.' }),
  blurDataUrl: optionalText({ label: 'Placeholder', max: 4_000 }).refine(
    (value) => value === null || value.startsWith('data:image/'),
    { error: 'The placeholder must be an inline image data URL.' },
  ),
});

/* ------------------------------------------------------------------------ */
/* Publishing                                                               */
/* ------------------------------------------------------------------------ */

export const publishPhotographSchema = z.object({
  photographId: identifier('Photograph reference'),
  title: requiredText({ label: 'Title', max: 120 }),
  altText: requiredText({ label: 'Alt text', min: 10, max: 280 }),
  description: optionalText({ label: 'Description', max: 2_000 }),
  category: photoCategorySchema,
  /** An approved location, chosen by the member. Null is a valid answer. */
  locationId: optionalIdentifier('Location'),
  /**
   * Null unless the member chose to publish the capture date. EXIF holding a
   * date is not consent to show it.
   */
  capturedAt: optionalInstant('Capture date'),
  capture: captureSettingsSchema,
  editing: editingDetailsSchema,
  film: filmDetailsSchema,
  rightsConfirmed: consent(
    'Confirm that this is your photograph and that you hold the rights to publish it.',
  ),
});

export const discardDraftSchema = z.object({
  photographId: identifier('Photograph reference'),
});

export type UploadDraftInput = z.infer<typeof uploadDraftSchema>;
export type SignUploadInput = z.infer<typeof signUploadSchema>;
export type AttachVariantsInput = z.infer<typeof attachVariantsSchema>;
export type CaptureSettingsInput = z.infer<typeof captureSettingsSchema>;
export type EditingDetailsInput = z.infer<typeof editingDetailsSchema>;
export type PublishPhotographInput = z.infer<typeof publishPhotographSchema>;
export type DiscardDraftInput = z.infer<typeof discardDraftSchema>;
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];
