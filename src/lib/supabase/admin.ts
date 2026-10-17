import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import { serverEnv } from '@/lib/config';

/**
 * The service-role client. It bypasses row-level security entirely.
 *
 * Reach for it only where a privileged write genuinely cannot be expressed as
 * the acting member: creating a profile row for a brand-new account, or a
 * moderator action that has to touch another member's row. Everything else —
 * including every public read — uses `./server`, so RLS stays the enforcement
 * point rather than a second copy of the rules in application code.
 *
 * This module must never be imported from a client component. The guard below
 * turns such an import into an immediate, obvious failure rather than a leaked
 * key, but the import graph is the real defence.
 */
export function createAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createAdminClient() was called in a browser bundle. The service-role key must never reach a client component.',
    );
  }

  const env = serverEnv();
  const serviceRoleKey = env.supabaseServiceRoleKey;

  if (!serviceRoleKey) {
    throw new Error(
      'No service-role key is configured, so privileged writes are unavailable. Set SUPABASE_SERVICE_ROLE_KEY — see docs/ENVIRONMENT.md.',
    );
  }

  return createSupabaseClient(env.supabaseUrl, serviceRoleKey, {
    auth: {
      // A service-role client has no user session to persist or refresh, and
      // persisting one would be a way to confuse it with a member's client.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
