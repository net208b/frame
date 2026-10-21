'use server';

import {
  fail,
  NOT_CONFIGURED_MESSAGE,
  ok,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { TablesInsert } from '@/lib/supabase/types';
import { parseForm } from '@/lib/validation';
import { REPORT_SUBJECT_LABELS, reportSchema } from '@/lib/validation/report';
import type { ReportSubjectType } from '@/types/domain';

/**
 * Filing a report.
 *
 * A report is the one write a visitor without an account may make, because the
 * people most likely to notice a stolen photograph are the ones who have never
 * joined. That openness has a cost, so the queue is protected by a rate limit
 * on both paths and by the fact that a report records only what was reported
 * and why — the reporter's identity is stored for moderators and never travels
 * back out to a public surface.
 */

type Writer = Awaited<ReturnType<typeof createClient>>;

/**
 * How many reports one source may file.
 *
 * Each window gets its own bucket name on purpose. `check_rate_limit` counts
 * rows by bucket alone and records one hit per allowed call, so two windows
 * sharing a bucket would charge every report twice and halve both limits.
 */
const LIMITS = {
  accountPerHour: { bucket: (id: string) => `report:hour:${id}`, limit: 10, windowSeconds: 3_600 },
  accountPerDay: { bucket: (id: string) => `report:day:${id}`, limit: 40, windowSeconds: 86_400 },
  /**
   * One coarse bucket shared by everyone without a session.
   *
   * This is a weak control and is NOT treated as identity: it cannot tell two
   * visitors apart, so a determined abuser spends the same allowance as the
   * honest reporters behind the same deployment. It exists to bound the damage
   * a script can do to the moderation queue, not to attribute anything. An IP
   * address would be no better — it is shared by everyone behind a carrier NAT
   * — and signing in is the only thing that buys a private allowance.
   */
  anonymousPerHour: { bucket: 'report:anonymous:hour', limit: 20, windowSeconds: 3_600 },
} as const;

/** Keeps a long title out of the moderation queue's row height. */
const MAX_LABEL_LENGTH = 160;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Narrow a PostgREST row to something readable.
 *
 * The select strings here are built from a lookup table rather than written as
 * literals, so supabase-js cannot infer the row shape and hands back a union
 * that includes its own error marker. This is the one place that is resolved,
 * and it is resolved by checking the value rather than by asserting it.
 */
function asRow(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

interface SubjectSource {
  table: string;
  columns: string;
  /** A human-readable name for the queue, or null when the row has none. */
  describe(row: Record<string, unknown>): string | null;
}

const SUBJECT_SOURCES: Record<ReportSubjectType, SubjectSource> = {
  photograph: {
    table: 'photographs',
    columns: 'title',
    describe: (row) => text(row.title),
  },
  location: {
    table: 'locations',
    columns: 'name, city',
    describe: (row) => {
      const name = text(row.name);
      const city = text(row.city);
      if (name && city) return `${name}, ${city}`;
      return name;
    },
  },
  profile: {
    table: 'profiles',
    columns: 'display_name, username',
    describe: (row) => {
      const displayName = text(row.display_name);
      const username = text(row.username);
      if (displayName && username) return `${displayName} (@${username})`;
      return displayName ?? (username ? `@${username}` : null);
    },
  },
  collection: {
    table: 'collections',
    columns: 'title',
    describe: (row) => text(row.title),
  },
  comment: {
    table: 'photograph_comments',
    columns: 'body',
    // A comment has no title, so the queue carries a short snippet of what was
    // said. A deleted or hidden comment comes back with an empty body and falls
    // through to the "Untitled comment" label, which is enough to find it by.
    describe: (row) => {
      const body = text(row.body);
      if (!body) return null;
      return body.length > 80 ? `${body.slice(0, 80)}…` : body;
    },
  },
};

type SubjectLookup = { exists: false } | { exists: true; label: string };

/**
 * Confirm the reported row exists and copy a readable name for the queue.
 *
 * The lookup runs through the same client that will write the report, so a
 * signed-in member can only report what they can actually see. `subject_label`
 * is stored because a report routinely outlives its subject: removing the
 * photograph is often the outcome, and a queue row reading only a UUID is
 * unreviewable afterwards.
 */
async function lookUpSubject(
  writer: Writer,
  subjectType: ReportSubjectType,
  subjectId: string,
): Promise<SubjectLookup> {
  const source = SUBJECT_SOURCES[subjectType];

  const { data, error } = await writer
    .from(source.table)
    .select(source.columns)
    .eq('id', subjectId)
    .maybeSingle();

  // A reference that is not a UUID comes back as a cast error rather than an
  // empty result. Either way there is nothing here to report.
  if (error || data === null || data === undefined) return { exists: false };

  const described = source.describe(asRow(data));
  const label = described ?? `Untitled ${REPORT_SUBJECT_LABELS[subjectType]}`;

  return { exists: true, label: label.slice(0, MAX_LABEL_LENGTH) };
}

/**
 * The client that writes a report filed without a session.
 *
 * Row-level security lets an authenticated member insert a report only under
 * their own id, so an unattributed report has to be written with the service
 * role. Returning null when no service-role key is configured is what keeps
 * this honest: the alternative is telling a visitor their report was filed
 * when the insert was refused.
 */
function anonymousWriter(): Writer | null {
  try {
    return createAdminClient();
  } catch (error) {
    console.error(
      `FRAME reports: an unattributed report could not be written — ${
        error instanceof Error ? error.message : 'the service-role client is unavailable'
      }`,
    );
    return null;
  }
}

export async function submitReport(input: unknown): Promise<ActionResult> {
  // 1. Capability. With no database there is no queue to file into.
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  // 2. Identity. A missing viewer is not a refusal here: an unattributed
  //    report is a supported outcome, not a degraded one.
  const viewer = await getViewer();

  // 3. Rate limit. A suspended member is deliberately still allowed to file:
  //    suspension stops someone contributing content, and a suspended account
  //    reporting abuse is signal a moderator wants rather than noise to block.
  if (viewer) {
    const hourly = await checkRateLimit(
      LIMITS.accountPerHour.bucket(viewer.id),
      LIMITS.accountPerHour.limit,
      LIMITS.accountPerHour.windowSeconds,
    );
    if (!hourly.allowed) {
      return fail(
        `You have filed several reports in the last hour. Try again in ${hourly.retryAfterSeconds} seconds.`,
        'rate_limited',
      );
    }

    const daily = await checkRateLimit(
      LIMITS.accountPerDay.bucket(viewer.id),
      LIMITS.accountPerDay.limit,
      LIMITS.accountPerDay.windowSeconds,
    );
    if (!daily.allowed) {
      return fail(
        'You have reached the daily report limit. If something urgent is still unresolved, reply to the moderation team rather than filing again.',
        'rate_limited',
      );
    }
  } else {
    const anonymous = await checkRateLimit(
      LIMITS.anonymousPerHour.bucket,
      LIMITS.anonymousPerHour.limit,
      LIMITS.anonymousPerHour.windowSeconds,
    );
    if (!anonymous.allowed) {
      return fail(
        'Too many reports have been filed without an account in the last hour. Sign in to file this one now, or try again later.',
        'rate_limited',
      );
    }
  }

  // 4. Validate.
  const parsed = parseForm(input, reportSchema);
  if (!parsed.ok) return fail(parsed.message, 'validation', parsed.fieldErrors);

  const { subjectType, subjectId, reason, details } = parsed.data;

  // 5. Choose the writer, and say so plainly when there is not one.
  const writer = viewer ? await createClient() : anonymousWriter();
  if (!writer) {
    return fail(
      'Reporting without an account is not available in this deployment, because it needs a service-role key. Sign in and file the report from your account — see docs/ENVIRONMENT.md.',
      'not_configured',
    );
  }

  // 6. Confirm the subject exists and capture its name for the queue.
  const subject = await lookUpSubject(writer, subjectType, subjectId);
  if (!subject.exists) {
    return fail(
      'That item could not be found, so there is nothing to report. It may already have been removed.',
      'not_found',
    );
  }

  // 7. Write. `status` is set here rather than left to the column default so
  //    the row this action creates is explicit about entering the open queue.
  const row: TablesInsert<'reports'> = {
    subject_type: subjectType,
    subject_id: subjectId,
    subject_label: subject.label,
    reason,
    details,
    status: 'open',
    reported_by: viewer?.id ?? null,
  };

  const { error } = await writer.from('reports').insert(row);
  if (error) {
    console.error(`FRAME reports: filing a ${subjectType} report failed — ${error.message}`);
    return fail(
      'Your report could not be filed. Try again in a moment, and if it keeps failing email the moderation team.',
      'unknown',
    );
  }

  revalidateLocalisedPath('/moderation');

  return ok(undefined, 'Report filed. A moderator will review it.');
}
