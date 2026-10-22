import sharp from 'sharp';

/**
 * A perceptual fingerprint of a photograph: the 64-bit difference hash.
 *
 * HOW IT WORKS. The image is reduced to 9 columns by 8 rows of grey. For each
 * row, each of the 8 pairs of neighbouring pixels contributes one bit: 1 when
 * the left pixel is brighter than the right. Sixty-four comparisons, sixty-four
 * bits. Resizing to such a small grid throws away everything but the broad
 * distribution of light, which is exactly the property that survives a
 * re-export, a resize or a recompress — so the same picture saved twice lands a
 * few bits apart, and two different pictures land about thirty-two apart.
 *
 * WHAT IT CANNOT DO, said plainly because /legal/copyright says it too: it
 * cannot tell a crop from a copy (a crop changes the grid), a mirrored frame
 * from its original (the comparisons reverse), or a member re-uploading their
 * own work from somebody taking it. It is a reason for a moderator to put two
 * frames side by side, and no more. Migration 0037 keeps the result; nothing
 * acts on it without a person.
 *
 * THE INPUT IS THE DISPLAY DERIVATIVE, not the original, so that a fingerprint
 * computed later from the public display file — the backfill in
 * scripts/backfill-fingerprints.mjs — is the same fingerprint the upload
 * computed. At 9×8 the two would differ by at most a bit or two anyway, but
 * "the same" is a better property than "close".
 *
 * `fit: 'fill'` on purpose: the aspect ratio is discarded, because the hash is
 * of the picture's light and not of its shape, and a portrait and a landscape
 * export of one frame should still meet.
 */

/** The value stored in `photograph_fingerprints.dhash`: 64 characters of 0 and 1. */
export type Fingerprint = string;

export const FINGERPRINT_BITS = 64;
export const FINGERPRINT_METHOD = 'dhash-9x8-display' as const;

const COLUMNS = 9;
const ROWS = 8;

export async function fingerprint(bytes: Uint8Array | ArrayBuffer): Promise<Fingerprint> {
  // sharp is a native module and this runs only on the server, like process.ts.
  if (typeof window !== 'undefined') throw new Error('fingerprint() is server-only');
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // The display derivative is already bounded, so sharp's default pixel limit
  // stands; `failOn: 'error'` is the setting process.ts decodes with.
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .greyscale()
    .resize(COLUMNS, ROWS, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== COLUMNS || info.height !== ROWS || info.channels !== 1) {
    throw new Error(
      `fingerprint: expected a ${COLUMNS}×${ROWS} single-channel grid, got ${info.width}×${info.height}×${info.channels}`,
    );
  }

  let bits = '';
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS - 1; col += 1) {
      const left = data[row * COLUMNS + col] ?? 0;
      const right = data[row * COLUMNS + col + 1] ?? 0;
      bits += left > right ? '1' : '0';
    }
  }

  if (bits.length !== FINGERPRINT_BITS) {
    throw new Error(`fingerprint: produced ${bits.length} bits, not ${FINGERPRINT_BITS}`);
  }
  return bits;
}

/** Bits that differ between two fingerprints. Only meaningful for two full ones. */
export function hammingDistance(a: Fingerprint, b: Fingerprint): number {
  if (a.length !== FINGERPRINT_BITS || b.length !== FINGERPRINT_BITS) {
    throw new Error('hammingDistance: both fingerprints must be 64 bits');
  }
  let distance = 0;
  for (let index = 0; index < FINGERPRINT_BITS; index += 1) {
    if (a[index] !== b[index]) distance += 1;
  }
  return distance;
}
