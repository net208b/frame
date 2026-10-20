import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Two jobs on one request: refresh the Supabase session, and settle the locale.
 *
 * Route protection deliberately does not live here. Middleware runs before a
 * route is resolved and cannot read the database cheaply, so a redirect decided
 * here would be a guess. Authorisation is checked in the page or action that
 * does the work, through `requireViewer()` and `requireModerator()`, where the
 * real role is known.
 *
 * ORDER, and why this one. Both halves want to own the response: `updateSession`
 * builds one so it can write rotated cookies onto it, and the next-intl
 * middleware builds one that is either a redirect to a prefixed path or a
 * rewrite into the `[locale]` segment. Returning either one alone throws the
 * other's work away.
 *
 * So the session is refreshed first. `updateSession` writes the rotated cookies
 * back onto the `NextRequest` as well as onto its own response — that is what
 * lets the current render see the refreshed token rather than the expiring one.
 * The locale response is built *after* that, from the same request object, so it
 * inherits the refreshed cookie header. Then the rotated cookies and the
 * no-store headers are copied across onto the response that is actually
 * returned. Running the locale middleware first and the session refresh second
 * would also work, but the locale response's request headers are snapshotted at
 * the moment it is built, so the render would use the pre-refresh cookie for one
 * request — a signed-in member would flicker to signed-out.
 */

const handleLocaleRouting = createIntlMiddleware(routing);

/**
 * Route handlers are endpoints, not pages: they have no `[locale]` segment and
 * must not be redirected into one — `/api/uploads/sign` prefixed to
 * `/en/api/uploads/sign` is a 404. They still want the session refresh, which is
 * why they are excluded here rather than in the matcher.
 */
function isLocalisedPath(pathname: string): boolean {
  return !pathname.startsWith('/api') && !pathname.startsWith('/auth');
}

/** Next's own plumbing. Copying these across would break the locale rewrite. */
function isInternalHeader(name: string): boolean {
  return name === 'set-cookie' || name.startsWith('x-middleware-');
}

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  // In demo mode this returns an untouched pass-through, as it always has.
  const sessionResponse = await updateSession(request);

  if (!isLocalisedPath(request.nextUrl.pathname)) return sessionResponse;

  const response = handleLocaleRouting(request);

  // Supabase's rotated session cookies, so the browser is told about them even
  // though the response they were written onto is not the one going back.
  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  // And the headers Supabase supplied with them, which are the no-store
  // directives that keep a CDN from caching one member's session for somebody
  // else. The locale cookie and the `Link` alternates header are already on
  // `response` and are left alone.
  for (const [name, value] of sessionResponse.headers) {
    if (isInternalHeader(name)) continue;
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the generated image endpoint, the
     * crawler files and bare image requests. Those never carry a session worth
     * refreshing, and running middleware on them only adds latency.
     *
     * The pattern matches the bare root (so `/` can be redirected to `/en`) and
     * every locale-prefixed path, because `/en/discover` is just another path
     * none of the exclusions below name. `/api` and `/auth` stay matched on
     * purpose: they are skipped for locale routing inside the function above,
     * but their sessions are still refreshed.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|llms\\.txt|google[0-9a-f]+\\.html|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|woff2?|ttf)$).*)',
  ],
};
