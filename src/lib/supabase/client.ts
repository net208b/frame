import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/config';

/**
 * The browser client, used only where the browser genuinely needs Supabase of
 * its own: the auth callback exchange and realtime subscriptions.
 *
 * It carries the publishable key, which is safe to ship, and is still subject
 * to row-level security. Data for a rendered page comes from the server
 * repository instead, so a reader downloads a page rather than a query.
 */
export function createClient(): SupabaseClient {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured, so no browser client can be created. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/ENVIRONMENT.md.',
    );
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
