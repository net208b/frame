import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The project's font-size scale, declared in the `@theme` block of
 * `app/globals.css`, plus the two fluid display utilities.
 *
 * tailwind-merge has to be told about these. In Tailwind v4 the `text-*`
 * namespace covers both font sizes and text colours, and tailwind-merge only
 * recognises the stock size scale (`text-sm`, `text-lg`, …). Faced with
 * `text-body` it cannot tell a size from a colour, so it put both in one
 * conflict group and the later class won — which silently deleted the colour
 * from every component that set a size and a colour together. `Button` sets
 * `text-on-ink` with the variant and `text-body` with the size, in that order,
 * so every primary button rendered its label in ink on an ink background and
 * was invisible. Naming the sizes here is what keeps the two groups apart.
 */
const FONT_SIZES = [
  'eyebrow',
  'meta',
  'caption',
  'body',
  'lead',
  'title',
  'section',
  'display',
  'display-fluid',
  'section-fluid',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
});

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compact counts for dense editorial metadata (248, 1.2k, 18k).
 * Intl handles locale-aware grouping; we keep one decimal below 10k.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value < 1000) return String(Math.max(0, Math.round(value)));
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value < 10_000 ? 1 : 0,
  }).format(value);
}

/** "12 March 2024" — unambiguous across locales, no US/EU ordering trap. */
export function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** "March 2024" — used for "member since", which should not expose a day. */
export function formatMonthYear(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Relative time for moderation queues ("4 hours ago"). */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.34524],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ];

  let duration = seconds;
  for (const [unit, size] of divisions) {
    if (Math.abs(duration) < size) return formatter.format(Math.round(duration), unit);
    duration /= size;
  }
  return formatter.format(Math.round(duration), 'year');
}

/** URL-safe slug. Used for photographs and locations. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/** Hard truncation with an ellipsis, for meta descriptions and cards. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

/** Round coordinates for display. Precision is a privacy decision — see lib/geo.ts. */
export function formatCoordinates(latitude: number, longitude: number, precision = 4): string {
  const lat = `${Math.abs(latitude).toFixed(precision)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(precision)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}
