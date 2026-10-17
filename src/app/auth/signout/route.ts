import { NextResponse, type NextRequest } from 'next/server';

import { sameOriginUrl } from '@/lib/safe-redirect';
import { signOut } from '@/server/actions/auth';

/**
 * Sign out — over POST, and only from FRAME itself.
 *
 * A sign-out on GET can be fired by any image tag on any page, which turns
 * "visit a forum" into "lose your session". The header submits a real form, so
 * POST is all that is needed, and GET answers 405 rather than quietly working.
 *
 * The POST carries no token of its own, so the origin headers are checked
 * here. A cross-site sign-out is a nuisance rather than a disclosure, but it
 * is a nuisance worth refusing.
 */

function isSameOrigin(request: NextRequest): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  // `none` is a typed URL or a bookmark, which cannot be another site's form.
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';

  const origin = request.headers.get('origin');
  // A browser old enough to send neither header is not worth locking out.
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new NextResponse('A sign-out must be submitted from FRAME itself.', { status: 403 });
  }

  const result = await signOut();

  // Demo mode has no session to end, so there is nothing to report: the
  // header already shows a visitor rather than a member.
  const failed = !result.ok && result.code !== 'not_configured';

  // 303 so the browser follows with GET instead of repeating the POST.
  return NextResponse.redirect(
    sameOriginUrl(request, failed ? '/login?error=signout_failed' : '/'),
    303,
  );
}

export async function GET(): Promise<Response> {
  return new NextResponse('A sign-out must be sent as a POST request.', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
