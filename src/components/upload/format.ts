'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { DEFAULT_LOCALE, INTL_LOCALES, isLocale, type Locale } from '@/i18n/locales';
import { formatDate } from '@/lib/utils';

import { fileSizeParts, precisionParts } from './limits';

/**
 * The numbers the seven steps read out, in the language the wizard is in.
 *
 * One hook rather than a formatter imported per step, because three of these
 * are decisions rather than conveniences and each one would otherwise be made
 * again in every file that needs it:
 *
 * - `plain` turns grouping *off*. It is for pixel dimensions, stage numbers and
 *   character counts, where "6240 × 4160" is the convention every camera and
 *   every image editor uses and "6,240 × 4,160" reads as two numbers in a list.
 *   A policy limit quoted inside prose keeps its grouping, because "4,000,000"
 *   is easier to read than "4000000" — those go through ICU's own `number`
 *   format inside the message.
 * - `coordinate` pins the fraction digits. `Intl` defaults to three, which
 *   would quietly round a position the member is being asked about.
 * - `date` goes through `INTL_LOCALES` rather than the bare locale, which is
 *   what keeps English on "12 March 2024" rather than the American order, and
 *   Thai on Gregorian years rather than the Buddhist era.
 */

export interface UploadFormat {
  /** The active locale, for the few callers that need it rather than a string. */
  locale: Locale;
  /** A pixel dimension, a stage number or a character count: no grouping. */
  plain: (value: number) => string;
  /** One half of a coordinate, at a fixed number of decimals. */
  coordinate: (value: number, decimals: number) => string;
  /** A byte count with its unit, e.g. "25 MB". */
  fileSize: (bytes: number) => string;
  /** A coordinate precision in words, e.g. "about 11 m". */
  precision: (decimals: number) => string;
  /** A date, or null when there is no readable one to show. */
  date: (value: string | Date | null | undefined) => string | null;
}

export function useUploadFormat(): UploadFormat {
  const t = useTranslations('upload');
  const format = useFormatter();
  const active = useLocale();

  return useMemo(() => {
    // `useLocale` is typed as a bare string, and the `[locale]` segment can
    // carry anything, so it is narrowed rather than asserted.
    const locale = isLocale(active) ? active : DEFAULT_LOCALE;

    return {
      locale,
      plain: (value: number) => format.number(value, { useGrouping: false }),
      coordinate: (value: number, decimals: number) =>
        format.number(value, {
          useGrouping: false,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }),
      fileSize: (bytes: number) => t('limits.fileSize', fileSizeParts(bytes)),
      precision: (decimals: number) => t('limits.precision', precisionParts(decimals)),
      date: (value: string | Date | null | undefined) => formatDate(value, INTL_LOCALES[locale]),
    };
  }, [active, format, t]);
}
