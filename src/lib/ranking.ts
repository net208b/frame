import { APPRECIATION_POLICY } from '@/lib/config';
import type { PhotographCard, SortOption } from '@/types/domain';

/**
 * Ranking rules.
 *
 * The rules are stated plainly here and surfaced in the UI (SORT_EXPLANATIONS)
 * because an opaque feed is how a community platform loses its community's
 * trust. Three commitments:
 *
 * - Appreciation is one-per-member and reversible, enforced by a unique
 *   constraint in the database, so a score cannot be inflated by replaying a
 *   request.
 * - Editor's picks are a separate, labelled surface. They never silently boost
 *   a photograph inside another ordering.
 * - No sponsored or paid placement is mixed into any ordering. If FRAME ever
 *   sells promotion, it must be a distinct, labelled slot.
 */

/**
 * Time-decayed appreciation score.
 *
 * score = appreciations / 2^(ageHours / halfLife)
 *
 * With a 36-hour half-life, a photograph with 20 appreciations today ranks
 * above one with 60 from a week ago, which is what lets new work surface
 * without deleting the history of older work.
 */
export function trendingScore(
  appreciationCount: number,
  publishedAt: string | Date,
  now: Date = new Date(),
): number {
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  if (Number.isNaN(published.getTime())) return 0;

  const ageHours = Math.max(0, (now.getTime() - published.getTime()) / 36e5);
  const decay = 2 ** (ageHours / APPRECIATION_POLICY.trendingHalfLifeHours);

  // The +1 keeps a brand-new photograph with zero appreciations from being
  // mathematically identical to an old one, while staying monotonic.
  return (appreciationCount + 1) / decay;
}

/** In-memory sort, used by the demo dataset. Live queries sort in SQL. */
export function sortPhotographs<T extends PhotographCard>(
  items: readonly T[],
  sort: SortOption,
  now: Date = new Date(),
): T[] {
  const copy = [...items];

  switch (sort) {
    case 'recent':
      return copy.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );

    case 'appreciated':
      return copy.sort((a, b) => {
        const diff = b.appreciationCount - a.appreciationCount;
        if (diff !== 0) return diff;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

    case 'trending':
      return copy.sort(
        (a, b) =>
          trendingScore(b.appreciationCount, b.publishedAt, now) -
          trendingScore(a.appreciationCount, a.publishedAt, now),
      );

    case 'editors':
      return copy
        .filter((item) => item.editorsPick)
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    default:
      return copy;
  }
}

/**
 * Heuristics that mark an appreciation pattern for human review.
 *
 * These are review signals, not punishments, and they key on account identity
 * and timing rather than IP address: an address is shared by everyone behind a
 * university NAT or a mobile carrier, so treating it as identity both misses
 * real abuse and penalises innocent members.
 */
export interface AppreciationBurst {
  actorId: string;
  photographId: string;
  count: number;
  windowMinutes: number;
}

export function isSuspiciousBurst(burst: AppreciationBurst): boolean {
  if (burst.windowMinutes <= 0) return false;
  const perMinute = burst.count / burst.windowMinutes;
  return perMinute > APPRECIATION_POLICY.maxPerMinute / 2;
}
