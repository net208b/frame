/**
 * The policy figures the wizard quotes, reduced to a number and a unit.
 *
 * Every limit on the seven steps comes from `UPLOAD_POLICY` or
 * `LOCATION_POLICY`, and none of it may be written into the copy in either
 * language: a figure typed into a sentence is a second source of truth that
 * stops agreeing with the server the day somebody raises the limit. So the
 * figure is derived here, the unit is a word the message chooses, and the
 * sentence interpolates both.
 *
 * This module holds no React and carries no `'use client'`, because the page
 * reads these on the server with `getTranslations` and the steps read them in
 * the browser through `useUploadFormat`. The hook lives in `format.ts`.
 *
 * Why the parts rather than the finished strings `formatFileSize` and
 * `precisionLabel` produce: the unit is an abbreviation in one language and a
 * different abbreviation in the other. `precisionLabel` says "about 11 m";
 * Thai says "ประมาณ 11 ม.".
 */

/**
 * Metres per degree of latitude, as `precisionLabel` in `lib/geo.ts` uses it.
 *
 * It is restated rather than imported because `precisionLabel` returns an
 * English phrase and exports no numeric form, and `lib/geo.ts` belongs to the
 * location feature rather than to the wizard. The two must agree — a precision
 * quoted here and one quoted on a location page describe the same policy — so
 * changing one means changing the other.
 */
const METRES_PER_DEGREE = 111_320;

export type ByteUnit = 'B' | 'KB' | 'MB' | 'GB';

/**
 * A byte count as a figure and a unit, rounded the way `formatFileSize` rounds:
 * one decimal below ten, none above, so "1.5 MB" and "25 MB".
 */
export function fileSizeParts(bytes: number): { size: number; unit: ByteUnit } {
  if (!Number.isFinite(bytes) || bytes <= 0) return { size: 0, unit: 'B' };
  if (bytes < 1024) return { size: Math.round(bytes), unit: 'B' };

  const units: readonly ByteUnit[] = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return {
    size: size < 10 ? Math.round(size * 10) / 10 : Math.round(size),
    unit: units[index] ?? 'GB',
  };
}

/** The ground distance a coordinate precision amounts to, as figure and unit. */
export function precisionParts(decimals: number): { value: number; unit: 'm' | 'km' } {
  const metres = METRES_PER_DEGREE / 10 ** decimals;
  if (metres >= 1000) return { value: Math.round(metres / 100) / 10, unit: 'km' };
  return { value: Math.round(metres), unit: 'm' };
}
