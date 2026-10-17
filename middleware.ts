import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/**
 * Session refresh, and nothing else.
 *
 * Route protection deliberately does not live here. Middleware runs before a
 * route is resolved and cannot read the database cheaply, so a redirect decided
 * here would be a guess. Authorisation is checked in the page or action that
 * does the work, through `requireViewer()` and `requireModerator()`, where the
 * real role is known.
 */
export default async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the generated image endpoint, the
     * crawler files and bare image requests. Those never carry a session worth
     * refreshing, and running middleware on them only adds latency.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|woff2?|ttf)$).*)',
  ],
};
