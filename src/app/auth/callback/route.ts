import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

import { isDemoMode } from '@/lib/config';
import { safeNextPath, sameOriginUrl } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

/**
 * Exchange a one-time code for a session.
 *
 * Every email link and every OAuth provider that this deployment might enable
 * lands here with a `code`. The exchange needs the verifier that was stored
 * when the link was requested, which is why a link opened in a different
 * browser from the one that asked for it cannot succeed — that is a property
 * of the flow, not a bug, and it is reported as a readable failure rather than
 * a blank page.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get('next'));

  if (isDemoMode()) {
    return NextResponse.redirect(sameOriginUrl(request, '/login?error=not_configured'), 303);
  }

  const code = params.get('code');
  if (!code) {
    // A refused or expired link comes back with the identity service's own
    // error parameters and no code at all.
    const providerError = params.get('error_description') ?? params.get('error');
    if (providerError) {
      console.error(`FRAME auth: a sign-in link was refused — ${providerError}`);
    }
    return NextResponse.redirect(sameOriginUrl(request, '/login?error=link_expired'), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(`FRAME auth: a code exchange failed — ${error.message}`);
    return NextResponse.redirect(sameOriginUrl(request, '/login?error=link_expired'), 303);
  }

  // The header is rendered in the root layout, so every page is now stale.
  revalidatePath('/', 'layout');

  return NextResponse.redirect(sameOriginUrl(request, next), 303);
}
