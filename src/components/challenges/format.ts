import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';

/**
 * Small helpers the challenge pages share.
 *
 * Challenge copy is editorial and written by staff in both languages, so it
 * is picked by locale rather than shown in whichever language its author
 * used. Times are shown in UTC and say so: a challenge closes at one instant
 * for everybody, and a page that rendered it in the server's own time zone
 * would tell half the world the wrong day.
 */

export function localised(value: { en: string; th: string }, locale: string): string {
  const text = locale.startsWith('th') ? value.th : value.en;
  return text || value.en || value.th;
}

export function intlLocaleOf(locale: string): string {
  return INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** "21 October 2026, 23:59 UTC" in the active language. */
export function formatInstant(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocaleOf(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

/** Whole days until an instant, never negative. */
export function daysUntil(value: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(value) - now) / (24 * 60 * 60 * 1000)));
}
