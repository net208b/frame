import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/config';

/**
 * Refresh the Supabase session on every matched request.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire mid-session and a member would be signed out at an arbitrary
 * moment. Here the rotated tokens are written onto a response that has not been
 * sent yet, which is the only place they can be persisted.
 *
 * In demo mode there is no Supabase project at all, so the request passes
 * through untouched: the whole interface has to work with an empty environment.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // The response is rebuilt from the mutated request so that this render
        // already sees the refreshed cookies, then the same cookies are written
        // to the outgoing response for the browser.
        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        // Supabase supplies the no-store headers that keep a CDN from caching
        // one member's rotated session and serving it to somebody else.
        for (const [key, headerValue] of Object.entries(headers ?? {})) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // The refresh happens inside this call, which is why it has to run before the
  // response is returned rather than lazily during rendering.
  await supabase.auth.getUser();

  return response;
}
