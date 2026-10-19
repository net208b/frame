import { Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '@/i18n/locales';
import { cn } from '@/lib/utils';
import type { SubmissionSignal, UploadSignal } from '@/types/domain';

/**
 * One automated check, as a moderator reads it.
 *
 * Every signal in FRAME is advisory: the checks can say a coordinate falls
 * outside its country's bounding box or that a file carried no EXIF, and
 * neither of those establishes anything on its own. So a badge names the check,
 * carries its own glyph for the severity — shape, not only colour — and sits
 * next to the sentence the check produced rather than replacing it.
 *
 * Rendered as a list item, because signals always arrive as a set and a
 * moderator reading three of them needs them announced as three.
 *
 * The *name* of each check is translated here; the *sentence* each check
 * produced is not. Those sentences are written where the check runs —
 * `evaluateLocationSubmission` in `lib/geo.ts`, the repository, the upload
 * action — and carry values from the data ("Within 40 m of an existing
 * location"). They reach a Thai moderator in English, which is a gap rather
 * than a decision: dropping them would hide what the check actually found,
 * which is the one thing a moderator needs.
 */

type Severity = SubmissionSignal['severity'];

/**
 * Keyed by the union, so a new signal kind cannot be added without a name. The
 * values are keys into the `moderation` namespace rather than English strings,
 * which keeps the compiler's exhaustiveness check while the name itself is
 * translated at the point it is rendered.
 */
export const SUBMISSION_SIGNAL_MESSAGE_KEYS: Record<SubmissionSignal['kind'], string> = {
  'possible-duplicate': 'submissionSignal.possible-duplicate',
  'coordinate-country-mismatch': 'submissionSignal.coordinate-country-mismatch',
  'coordinate-out-of-range': 'submissionSignal.coordinate-out-of-range',
  'low-precision': 'submissionSignal.low-precision',
  'rate-limited': 'submissionSignal.rate-limited',
  'sensitive-area': 'submissionSignal.sensitive-area',
};

export const UPLOAD_SIGNAL_MESSAGE_KEYS: Record<UploadSignal['kind'], string> = {
  'perceptual-hash-match': 'uploadSignal.perceptual-hash-match',
  'exif-missing': 'uploadSignal.exif-missing',
  'exif-conflict': 'uploadSignal.exif-conflict',
  'burst-upload': 'uploadSignal.burst-upload',
  'embedded-credit-mismatch': 'uploadSignal.embedded-credit-mismatch',
  'low-resolution': 'uploadSignal.low-resolution',
};

const TONES: Record<Severity, string> = {
  info: 'bg-info-bg text-info',
  warn: 'bg-warning-bg text-warning',
  high: 'bg-danger-bg text-danger',
};

/** A distinct glyph per severity, so the level survives a greyscale print. */
const GLYPHS: Record<Severity, typeof Info> = {
  info: Info,
  warn: TriangleAlert,
  high: OctagonAlert,
};

export async function SignalBadge({
  locale,
  severity,
  label,
  message,
  children,
  className,
}: {
  locale: Locale;
  severity: Severity;
  label: string;
  message?: string;
  /** Extra detail the signal carries, such as a link to the place it matched. */
  children?: ReactNode;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });
  const Glyph = GLYPHS[severity];

  return (
    <li className={cn('flex flex-wrap items-baseline gap-x-2.5 gap-y-1', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-meta font-bold',
          TONES[severity],
        )}
      >
        <Glyph className="size-3 shrink-0 self-center" aria-hidden />
        {label}
        <span className="sr-only"> — {t(`severity.${severity}`)}</span>
      </span>
      {message ? <span className="text-meta text-ink-soft">{message}</span> : null}
      {children}
    </li>
  );
}
