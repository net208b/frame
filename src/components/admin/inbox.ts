import type { ModerationQueues } from '@/lib/data/repository';
import type { ChallengeSummary, FeatureSummary } from '@/types/domain';

/**
 * Everything waiting on the admin, as one list, newest first.
 *
 * Each item is built from the queue that already knows about it; this module
 * only lines them up. The decision itself happens on the review page through
 * the same actions the moderation desk uses, so nothing here can approve or
 * reject anything on its own.
 */

export type InboxKind = 'upload' | 'place' | 'report' | 'challenge' | 'feature';

export interface InboxItem {
  kind: InboxKind;
  id: string;
  title: string;
  /** Who it came from; null for something staff started themselves. */
  by: string | null;
  createdAt: string;
  thumbUrl: string | null;
  /** How many automated signals asked for a look. */
  signals: number;
  href: string;
}

export function buildInbox(
  queues: ModerationQueues,
  challenges: ChallengeSummary[],
  features: FeatureSummary[],
): InboxItem[] {
  const items: InboxItem[] = [];

  for (const upload of queues.suspiciousUploads) {
    items.push({
      kind: 'upload',
      id: upload.photographId,
      title: upload.title,
      by: upload.uploader.displayName,
      createdAt: upload.createdAt,
      thumbUrl: upload.thumbUrl,
      signals: upload.signals.length,
      href: `/adminnet208b/review/upload/${upload.photographId}`,
    });
  }
  for (const submission of queues.submissions) {
    items.push({
      kind: 'place',
      id: submission.id,
      title: `${submission.proposedName} — ${submission.city}`,
      by: submission.submittedBy.displayName,
      createdAt: submission.createdAt,
      thumbUrl: null,
      signals: submission.signals.length,
      href: `/adminnet208b/review/place/${submission.id}`,
    });
  }
  for (const report of queues.reports) {
    items.push({
      kind: 'report',
      id: report.id,
      title: report.subjectLabel,
      by: report.reportedBy?.displayName ?? null,
      createdAt: report.createdAt,
      thumbUrl: null,
      signals: 0,
      href: `/adminnet208b/review/report/${report.id}`,
    });
  }
  for (const challenge of challenges.filter((entry) => entry.phase === 'judging')) {
    items.push({
      kind: 'challenge',
      id: challenge.id,
      title: challenge.title.en,
      by: null,
      createdAt: challenge.closesAt,
      thumbUrl: null,
      signals: 0,
      href: '/moderation?queue=challenges',
    });
  }
  for (const feature of features.filter((entry) => entry.status === 'draft')) {
    items.push({
      kind: 'feature',
      id: feature.id,
      title: feature.title.en,
      by: null,
      createdAt: feature.publishedAt ?? '',
      thumbUrl: feature.cover?.image.thumbUrl ?? null,
      signals: 0,
      href: '/moderation?queue=features',
    });
  }

  return items.sort((a, b) => Date.parse(b.createdAt || '0') - Date.parse(a.createdAt || '0'));
}
