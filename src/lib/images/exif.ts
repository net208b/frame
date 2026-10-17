import exifr from 'exifr';

import { isValidLatitude, isValidLongitude } from '@/lib/geo';
// The exposure format belongs to the form this readout prefills, so the
// formatter lives with the upload schema and is reused rather than repeated.
import { formatShutterSeconds } from '@/lib/validation/upload';

/**
 * Reading camera metadata, for one purpose only: filling in a form so a member
 * does not have to type what the camera already recorded.
 *
 * EXIF is not evidence. It is written by whatever software touched the file
 * last, it can be edited in seconds, and a photograph with a complete EXIF
 * block is no more likely to belong to the uploader than one with none. So
 * nothing here grants a permission, and nothing here is published without the
 * member choosing it — least of all the GPS position, which is why
 * {@link describeExifGpsPolicy} exists.
 *
 * This module runs in the browser as happily as on the server. Reading EXIF
 * from the chosen file before it is uploaded means a member can see what the
 * file contains, and decline to publish the location, before any of it leaves
 * their machine.
 */

export interface ExifReadout {
  cameraBrand: string | null;
  cameraModel: string | null;
  lensBrand: string | null;
  lensModel: string | null;
  focalLengthMm: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  capturedAt: string | null;
  gps: { latitude: number; longitude: number } | null;
  width: number | null;
  height: number | null;
}

const EMPTY_READOUT: ExifReadout = {
  cameraBrand: null,
  cameraModel: null,
  lensBrand: null,
  lensModel: null,
  focalLengthMm: null,
  aperture: null,
  shutterSpeed: null,
  iso: null,
  capturedAt: null,
  gps: null,
  width: null,
  height: null,
};

/** Only the tags this readout uses, so a 40 MB file is barely touched. */
const PICKED_TAGS = [
  'Make',
  'Model',
  'LensMake',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
  'DateTimeOriginal',
  'ExifImageWidth',
  'ExifImageHeight',
  'Orientation',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
] as const;

/* ------------------------------------------------------------------------ */
/* Normalising                                                               */
/* ------------------------------------------------------------------------ */

/** EXIF strings arrive padded with NULs and, occasionally, with nothing in them. */
function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    // EXIF pads fixed-width strings with NUL and other control bytes.
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return null;
  // Truncated rather than dropped: the field it prefills is bounded too, and a
  // long model name is still a useful starting point for the member.
  return text.slice(0, maxLength);
}

/** Corporate noise in a Make field, which no photographer writes by hand. */
const BRAND_SUFFIXES =
  /\b(corporation|corp|company|co|ltd|limited|inc|incorporated|gmbh|imaging|optical|kabushiki|kaisha)\b\.?/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `NIKON CORPORATION` becomes `NIKON`, `RICOH IMAGING COMPANY, LTD.` becomes `RICOH`. */
function normaliseBrand(value: unknown, maxLength: number): string | null {
  const text = cleanString(value, maxLength);
  if (text === null) return null;
  const stripped = text.replace(BRAND_SUFFIXES, ' ').replace(/[\s,]+/g, ' ').trim();
  return stripped.length > 0 ? stripped : text;
}

/**
 * Drop a brand the model already repeats.
 *
 * A Make of `NIKON CORPORATION` with a Model of `NIKON Z f` must not render as
 * "NIKON CORPORATION NIKON Z f", so the model becomes `Z f` and the two fields
 * read correctly whether a view shows them together or apart.
 */
function normaliseModel(value: unknown, brand: string | null, maxLength: number): string | null {
  const text = cleanString(value, maxLength);
  if (text === null) return null;
  if (brand === null) return text;

  const firstBrandWord = brand.split(' ')[0] ?? brand;
  const prefix = new RegExp(
    `^(?:${escapeRegExp(brand)}|${escapeRegExp(firstBrandWord)})[\\s-]+`,
    'i',
  );
  const stripped = text.replace(prefix, '').trim();
  return stripped.length > 0 ? stripped : text;
}

function firstNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // ISOSpeedRatings and some GPS tags are arrays of rationals.
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'number' && Number.isFinite(first)) return first;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const parsed = firstNumber(value);
  if (parsed === null || parsed < min || parsed > max) return null;
  return parsed;
}

/** The ranges match the bounds the upload schema enforces, to the digit. */
function normaliseAperture(value: unknown): number | null {
  const parsed = boundedNumber(value, 0.7, 64);
  // EXIF stores f-numbers as rationals, so f/1.8 arrives as 1.7999999523162842.
  return parsed === null ? null : Math.round(parsed * 100) / 100;
}

/** The form takes whole millimetres, so a 23.5 mm lens prefills as 24. */
function normaliseFocalLength(value: unknown): number | null {
  const parsed = boundedNumber(value, 0.5, 2_000.49);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  return rounded >= 1 && rounded <= 2_000 ? rounded : null;
}

function normaliseShutter(value: unknown): string | null {
  const seconds = firstNumber(value);
  return seconds === null ? null : formatShutterSeconds(seconds);
}

function normaliseIso(value: unknown): number | null {
  const parsed = boundedNumber(value, 3, 4_000_000);
  return parsed === null ? null : Math.round(parsed);
}

function normalisePixelCount(value: unknown): number | null {
  const parsed = boundedNumber(value, 1, 1_000_000);
  return parsed === null ? null : Math.round(parsed);
}

/** Photography predates 1826 by nothing, and no camera records the future. */
function normaliseCapturedAt(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? // EXIF writes `2024:03:12 18:40:00`, which Date cannot read as-is.
          new Date(value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'))
        : null;

  if (date === null || Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
  if (year < 1826 || date.getTime() > tomorrow) return null;

  // EXIF carries no time zone, so this instant is the camera's clock read in
  // the environment that parsed it. Close enough to prefill a date field, and
  // never presented as more precise than that.
  return date.toISOString();
}

/** `[35, 41, 38.38]` with a ref of `N` becomes `35.69399…`. */
function degreesFromParts(value: unknown, ref: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const [degrees, minutes, seconds] = value;
  const d = typeof degrees === 'number' ? degrees : null;
  if (d === null || !Number.isFinite(d)) return null;

  const m = typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : 0;
  const s = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 0;
  const magnitude = Math.abs(d) + m / 60 + s / 3600;
  const reference = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  const negative = reference === 'S' || reference === 'W' || d < 0;

  return negative ? -magnitude : magnitude;
}

function readGps(tags: Record<string, unknown>): { latitude: number; longitude: number } | null {
  // exifr adds decimal `latitude` and `longitude` when it can; the parts are
  // the fallback, so the readout does not depend on that convenience.
  const latitude =
    boundedNumber(tags.latitude, -90, 90) ??
    degreesFromParts(tags.GPSLatitude, tags.GPSLatitudeRef);
  const longitude =
    boundedNumber(tags.longitude, -180, 180) ??
    degreesFromParts(tags.GPSLongitude, tags.GPSLongitudeRef);

  if (latitude === null || longitude === null) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  // Null Island means the tags were present and empty.
  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

/**
 * The dimensions as a viewer sees them.
 *
 * An orientation of 5 to 8 means the camera recorded the frame rotated a
 * quarter turn, so the stored width is the displayed height. Reporting the
 * stored pair would tell a member their portrait photograph is landscape.
 * These are still only what the file claims; `verifyImageBytes` reads the
 * decoded truth on the server.
 */
function readDimensions(tags: Record<string, unknown>): { width: number | null; height: number | null } {
  const width = normalisePixelCount(tags.ExifImageWidth);
  const height = normalisePixelCount(tags.ExifImageHeight);

  // exifr translates this tag to a phrase such as "Rotate 90 CW" by default,
  // so both the number and the description are read.
  const orientation = tags.Orientation;
  const quarterTurned =
    (typeof orientation === 'number' && orientation >= 5 && orientation <= 8) ||
    (typeof orientation === 'string' && /rotate (90|270)/i.test(orientation));

  return quarterTurned ? { width: height, height: width } : { width, height };
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Read what a file says about itself. A file with no EXIF, a truncated block
 * or a corrupt one all return the same readout full of nulls: a member whose
 * camera writes nothing useful should see an empty form, not an error.
 */
export async function readExif(file: File | Blob | ArrayBuffer): Promise<ExifReadout> {
  let tags: Record<string, unknown>;

  try {
    const parsed: unknown = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: [...PICKED_TAGS],
    });
    if (parsed === null || typeof parsed !== 'object') return EMPTY_READOUT;
    tags = parsed as Record<string, unknown>;
  } catch {
    // Unreadable metadata is an ordinary outcome, not a failure to report.
    return EMPTY_READOUT;
  }

  const cameraBrand = normaliseBrand(tags.Make, 60);
  const lensBrand = normaliseBrand(tags.LensMake, 60);

  return {
    cameraBrand,
    cameraModel: normaliseModel(tags.Model, cameraBrand, 80),
    lensBrand,
    // A lens is often branded by the camera maker, so the camera brand is the
    // fallback prefix to strip when the lens has no Make of its own.
    lensModel: normaliseModel(tags.LensModel, lensBrand ?? cameraBrand, 80),
    focalLengthMm: normaliseFocalLength(tags.FocalLength),
    aperture: normaliseAperture(tags.FNumber),
    shutterSpeed: normaliseShutter(tags.ExposureTime),
    iso: normaliseIso(tags.ISO),
    capturedAt: normaliseCapturedAt(tags.DateTimeOriginal),
    gps: readGps(tags),
    ...readDimensions(tags),
  };
}

/**
 * The paragraph shown beside the GPS question in the upload wizard.
 *
 * Written out rather than assembled from fragments because a member deciding
 * whether to publish where they were standing deserves the whole policy in one
 * place, in plain words.
 */
export function describeExifGpsPolicy(): string {
  return (
    'This file contains the coordinates your camera recorded. FRAME will not publish them unless you choose to: ' +
    'leave this question alone and the position stays out of the photograph entirely. ' +
    'If you do publish a place, the point shown is rounded by policy rather than exact, and rounded further for ' +
    'somewhere sensitive, so a published location never puts a doorway on a map. ' +
    'Camera metadata is also not a claim of authorship — it says which device wrote the file, not who holds the ' +
    'rights to the photograph.'
  );
}
