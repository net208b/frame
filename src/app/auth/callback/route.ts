import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

import { localeFromRequest, withLocalePrefix } from '@/i18n/locales';
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
 *
 * This route has no `[locale]` segment — it is an endpoint, not a page — but
 * every destination below is a page, so the language the member was reading is
 * recovered from the request and carried into the redirect. Without that, a
 * Thai member would finish signing in on an English page.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const locale = localeFromRequest(request);
  const next = safeNextPath(params.get('next'), withLocalePrefix('/', locale));

  if (isDemoMode()) {
    return NextResponse.redirect(
      sameOriginUrl(request, withLocalePrefix('/login?error=not_configured', locale)),
      303,
    );
  }

  const code = params.get('code');
  if (!code) {
    // A refused or expired link comes back with the identity service's own
    // error parameters and no code at all.
    const providerError = params.get('error_description') ?? params.get('error');
    if (providerError) {
      console.error(`FRAME auth: a sign-in link was refused — ${providerError}`);
    }
    return NextResponse.redirect(
      sameOriginUrl(request, withLocalePrefix('/login?error=link_expired', locale)),
      303,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(`FRAME auth: a code exchange failed — ${error.message}`);
    return NextResponse.redirect(
      sameOriginUrl(request, withLocalePrefix('/login?error=link_expired', locale)),
      303,
    );
  }

  // The header is rendered in the locale layout, so every page in every
  // language is now stale.
  revalidatePath('/', 'layout');

  return NextResponse.redirect(sameOriginUrl(request, next), 303);
}
