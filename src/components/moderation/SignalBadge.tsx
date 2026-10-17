import { Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

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
 */

type Severity = SubmissionSignal['severity'];

/** Keyed by the union, so a new signal kind cannot be added without a name. */
export const SUBMISSION_SIGNAL_LABELS: Record<SubmissionSignal['kind'], string> = {
  'possible-duplicate': 'Possible duplicate',
  'coordinate-country-mismatch': 'Coordinate and country disagree',
  'coordinate-out-of-range': 'Coordinate out of range',
  'low-precision': 'Low precision',
  'rate-limited': 'Rate limited',
  'sensitive-area': 'Sensitive area',
};

export const UPLOAD_SIGNAL_LABELS: Record<UploadSignal['kind'], string> = {
  'perceptual-hash-match': 'Similar image on file',
  'exif-missing': 'No EXIF',
  'exif-conflict': 'EXIF disagrees with the place',
  'burst-upload': 'Burst upload',
  'embedded-credit-mismatch': 'Embedded credit differs',
  'low-resolution': 'Below the minimum size',
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

const SEVERITY_WORDS: Record<Severity, string> = {
  info: 'For information',
  warn: 'Worth checking',
  high: 'Needs attention',
};

export function SignalBadge({
  severity,
  label,
  message,
  children,
  className,
}: {
  severity: Severity;
  label: string;
  message?: string;
  /** Extra detail the signal carries, such as a link to the place it matched. */
  children?: ReactNode;
  className?: string;
}) {
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
        <span className="sr-only"> — {SEVERITY_WORDS[severity]}</span>
      </span>
      {message ? <span className="text-meta text-ink-soft">{message}</span> : null}
      {children}
    </li>
  );
}
