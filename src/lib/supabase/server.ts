import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { publicEnv } from '@/lib/config';

/**
 * The request-scoped Supabase client.
 *
 * It is bound to the request's cookies, so every query runs as the signed-in
 * member and row-level security is the real gate rather than a convention in
 * application code. A new client is created per request on purpose: sharing one
 * across requests would let one member's session leak into another's response.
 *
 * Never import `./admin` from anywhere that can serve a public read — the
 * service-role key bypasses RLS and this client is what keeps it unnecessary.
 */
export async function createClient(): Promise<SupabaseClient> {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  // Callers in demo mode must check `isDatabaseConfigured()` first; reaching
  // here without credentials is a programming error, so it throws loudly
  // instead of returning a client that would fail on every query.
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured, so no server client can be created. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/ENVIRONMENT.md.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Writing a cookie from a Server Component throws: the response has
          // already begun. That is expected and safe to ignore here, because
          // `middleware.ts` refreshes the session on every request and writes
          // the rotated tokens to a response that can still carry them.
        }
      },
    },
  });
}
