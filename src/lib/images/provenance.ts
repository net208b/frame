import type { CaptureProvenance, CaptureSettings } from '@/types/domain';

/**
 * Did the camera say this, or did somebody type it?
 *
 * The upload form prefills the capture fields from the file's EXIF and then
 * lets the member edit them, which is correct — EXIF is often wrong about a
 * manual lens, and a member who knows what they shot with should be able to say
 * so. But the published page then shows a camera, a lens and an exposure with
 * no indication of which of those the file actually carried. The brief asks for
 * a "clear status if typed", and this is the comparison behind it.
 *
 * WHAT THIS IS NOT. It is not proof of anything. `photograph_metadata.exif_source`
 * is the raw readout kept for review, and the schema says plainly what it is
 * worth: "Evidence for a human review, never an ownership proof — EXIF is
 * editable with a free tool." A frame whose EXIF was rewritten before upload
 * reads as `camera` here. So the claim is deliberately narrow — *these values
 * are the ones the file carried* — and never "this photograph is genuine".
 *
 * WHY ONE VALUE AND NOT A FLAG PER FIELD. The photograph page is written as
 * craft information rather than as a properties panel, and a badge beside every
 * row would turn it into one. A reader needs to know whether to read the
 * numbers as the camera's record or as the photographer's account; one line
 * answers that, and the photographer's own words — which no file can carry —
 * are not made to look second-class beside it.
 */

/** What `exif_source` holds: the fields of the readout worth comparing. */
interface ExifSource {
  cameraBrand?: unknown;
  cameraModel?: unknown;
  lensBrand?: unknown;
  lensModel?: unknown;
  focalLengthMm?: unknown;
  aperture?: unknown;
  shutterSpeed?: unknown;
  iso?: unknown;
}

/** The fields EXIF can speak for. Film and editing are never in a file's EXIF. */
const COMPARED = [
  'cameraBrand',
  'cameraModel',
  'lensBrand',
  'lensModel',
  'focalLengthMm',
  'aperture',
  'shutterSpeed',
  'iso',
] as const satisfies ReadonlyArray<keyof CaptureSettings & keyof ExifSource>;

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * One field, compared as the page shows it.
 *
 * Text is compared case-insensitively and trimmed, because "SONY" and "Sony"
 * are the same camera written twice and flagging that as a correction would
 * make the line meaningless. Numbers are compared as numbers, so 1.8 and 1.80
 * agree. Both null is agreement: a field nobody recorded and nobody published
 * is not a discrepancy.
 */
function agrees(published: unknown, recorded: unknown): boolean {
  const publishedText = asText(published);
  const recordedText = asText(recorded);
  if (publishedText !== null || recordedText !== null) {
    return publishedText?.toLowerCase() === recordedText?.toLowerCase();
  }

  const publishedNumber = asNumber(published);
  const recordedNumber = asNumber(recorded);
  if (publishedNumber !== null || recordedNumber !== null) {
    return publishedNumber === recordedNumber;
  }

  return true;
}

/**
 * Where a published photograph's capture values came from.
 *
 * - `camera`  — a readout exists and every published value matches it.
 * - `edited`  — a readout exists and at least one published value differs from
 *               it, or was added where the file held nothing.
 * - `unknown` — no readout at all: a frame scanned from film, or a row from
 *               before the readout was kept. Nothing is claimed either way.
 */
export function captureProvenance(
  capture: CaptureSettings,
  exifSource: unknown,
): CaptureProvenance {
  if (exifSource === null || typeof exifSource !== 'object' || Array.isArray(exifSource)) {
    return 'unknown';
  }

  const recorded = exifSource as ExifSource;

  // A readout that carries none of the compared fields says nothing about them,
  // so it is no better than having no readout: a scan whose EXIF holds only the
  // scanner's dimensions must not make a typed film camera read as "from the
  // camera".
  const hasAnything = COMPARED.some(
    (field) => asText(recorded[field]) !== null || asNumber(recorded[field]) !== null,
  );
  if (!hasAnything) return 'unknown';

  for (const field of COMPARED) {
    if (!agrees(capture[field], recorded[field])) return 'edited';
  }

  return 'camera';
}
