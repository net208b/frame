import { isDatabaseConfigured } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

/**
 * Rate limiting for write actions.
 *
 * The bucket is built by the caller and must be scoped to an account, not to an
 * IP address. An address is shared by everyone behind a university NAT or a
 * mobile carrier, so treating it as identity both misses real abuse and
 * punishes innocent members. This module does not try to improve on the bucket
 * it is handed, with one exception: the window length is appended to the
 * storage key, so two different windows on the same bucket are two independent
 * counters rather than one shared one.
 */

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/* ------------------------------------------------------------------------ */
/* In-process fallback                                                      */
/* ------------------------------------------------------------------------ */

/**
 * The fallback counter, used when no database is configured.
 *
 * It is per-instance and therefore NOT a security control on its own: a
 * serverless deployment runs many instances, and a determined caller only has
 * to be routed to a cold one. It exists so that the limits are still exercised
 * in local development and demo mode, where there is no shared store at all.
 * The database RPC is the real limiter.
 */
const MAX_TRACKED_BUCKETS = 5_000;

interface BucketState {
  /** Hit times in milliseconds, newest last, trimmed to the window. */
  hits: number[];
  lastSeen: number;
}

const buckets = new Map<string, BucketState>();

/** Keep the map bounded: expired buckets first, then the least recently used. */
function evictIfNeeded(now: number, windowMs: number): void {
  if (buckets.size < MAX_TRACKED_BUCKETS) return;

  for (const [key, state] of buckets) {
    if (now - state.lastSeen > windowMs) buckets.delete(key);
  }
  if (buckets.size < MAX_TRACKED_BUCKETS) return;

  const byAge = [...buckets.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  const target = Math.floor(MAX_TRACKED_BUCKETS * 0.9);
  for (const [key] of byAge) {
    if (buckets.size <= target) break;
    buckets.delete(key);
  }
}

function checkInProcess(bucket: string, limit: number, windowSeconds: number): RateLimitVerdict {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  evictIfNeeded(now, windowMs);

  const state = buckets.get(bucket) ?? { hits: [], lastSeen: now };
  const hits = state.hits.filter((at) => now - at < windowMs);

  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(bucket, { hits, lastSeen: now });
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(bucket, { hits, lastSeen: now });
  return { allowed: true, remaining: Math.max(0, limit - hits.length), retryAfterSeconds: 0 };
}

/* ------------------------------------------------------------------------ */
/* Database-backed limiter                                                  */
/* ------------------------------------------------------------------------ */

interface RpcVerdictRow {
  allowed?: unknown;
  remaining?: unknown;
  retry_after_seconds?: unknown;
}

/** The RPC returns a one-row table, which PostgREST may unwrap to an object. */
function readVerdict(payload: unknown): RateLimitVerdict | null {
  const row: RpcVerdictRow | null = Array.isArray(payload)
    ? ((payload[0] ?? null) as RpcVerdictRow | null)
    : typeof payload === 'object' && payload !== null
      ? (payload as RpcVerdictRow)
      : null;

  if (!row || typeof row.allowed !== 'boolean') return null;

  return {
    allowed: row.allowed,
    remaining: typeof row.remaining === 'number' ? Math.max(0, row.remaining) : 0,
    retryAfterSeconds:
      typeof row.retry_after_seconds === 'number' ? Math.max(0, row.retry_after_seconds) : 0,
  };
}

/** PostgREST reports a function it cannot find in the schema cache as PGRST202. */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

/**
 * Count one attempt against `bucket` and say whether it may proceed.
 *
 * With a database configured the count is kept in Postgres, so the limit holds
 * across server instances. Without one the in-process fallback answers.
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitVerdict> {
  if (limit <= 0) {
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
  }

  // A counter belongs to one bucket *and* one window, so the window is part of
  // the storage key. Without this, an action that applies both a per-minute and
  // a per-hour limit to the same caller — appreciation does — records a hit in
  // each check, and every attempt is counted twice. Both limits then bite at
  // half their stated value, silently. Namespacing here rather than asking each
  // caller to encode the window in its bucket name makes that impossible to
  // reintroduce; a caller that already distinguishes its windows is unaffected.
  const key = `${bucket}@${windowSeconds}s`;

  if (!isDatabaseConfigured()) {
    return checkInProcess(key, limit, windowSeconds);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_bucket: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // A missing function means the migrations have not been applied yet. That
    // is a deployment problem, not an attack, so the fallback keeps the app
    // usable and the error is logged for whoever deploys it.
    if (MISSING_FUNCTION_CODES.has(error.code)) {
      console.error(
        `FRAME rate limit: public.check_rate_limit is unavailable (${error.code}); using the per-instance fallback. Apply the database migrations.`,
      );
      return checkInProcess(key, limit, windowSeconds);
    }

    // Any other failure denies the attempt. A limiter that opens up when its
    // store is unreachable is not a limiter.
    console.error(`FRAME rate limit: check for "${key}" failed — ${error.message}`);
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
  }

  const verdict = readVerdict(data);
  if (!verdict) {
    console.error(
      `FRAME rate limit: public.check_rate_limit returned an unreadable row for "${key}".`,
    );
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
  }

  return verdict;
}
