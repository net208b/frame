import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

import { localeFromRequest, withLocalePrefix } from '@/i18n/locales';
import { isDemoMode } from '@/lib/config';
import { safeNextPath, sameOriginUrl } from '@/lib/safe-redirect';
import {
  PROVIDER_FLOW_COOKIE,
  PROVIDER_FLOW_COOKIE_PATH,
  readProviderFlow,
} from '@/lib/sign-in-providers';
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
 * A provider sign-in is told apart from an email link by the marker cookie
 * `signInWithProvider` sets (see PROVIDER_FLOW_COOKIE). It changes two things
 * only: the destination, which a provider sign-in keeps in the cookie rather
 * than in this URL, and the sentence shown when there is no session at the end
 * — "you cancelled" or "that did not complete" instead of "the link expired",
 * which would be untrue of somebody who never had a link.
 *
 * This route has no `[locale]` segment — it is an endpoint, not a page — but
 * every destination below is a page, so the language the member was reading is
 * recovered from the request and carried into the redirect. Without that, a
 * Thai member would finish signing in on an English page.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const locale = localeFromRequest(request);
  const flow = readProviderFlow(request.cookies.get(PROVIDER_FLOW_COOKIE)?.value);
  // An email link names its destination in the URL; a provider sign-in left it
  // in the marker. Either way it is validated here, at the point of use.
  const next = safeNextPath(params.get('next') ?? flow?.next, withLocalePrefix('/', locale));

  /** Every exit clears the marker, whichever way the sign-in went. */
  const finish = (response: NextResponse): NextResponse => {
    if (flow) {
      response.cookies.set(PROVIDER_FLOW_COOKIE, '', {
        path: PROVIDER_FLOW_COOKIE_PATH,
        maxAge: 0,
      });
    }
    return response;
  };

  const toLogin = (reason: string): NextResponse =>
    finish(
      NextResponse.redirect(
        sameOriginUrl(request, withLocalePrefix(`/login?error=${reason}`, locale)),
        303,
      ),
    );

  if (isDemoMode()) return toLogin('not_configured');

  const code = params.get('code');
  if (!code) {
    // A refused or expired link, and a provider sign-in somebody abandoned,
    // both come back with the identity service's error parameters and no code.
    const providerError = params.get('error_description') ?? params.get('error');
    if (providerError) {
      console.error(`FRAME auth: a sign-in was refused — ${providerError}`);
    }

    if (flow) {
      // Pressing Cancel at the provider comes back as `access_denied`. That is
      // a decision, not a fault, and it is reported as one.
      return toLogin(params.get('error') === 'access_denied' ? 'provider_cancelled' : 'provider_failed');
    }
    return toLogin('link_expired');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(`FRAME auth: a code exchange failed — ${error.message}`);
    return toLogin(flow ? 'provider_failed' : 'link_expired');
  }

  // The header is rendered in the locale layout, so every page in every
  // language is now stale.
  revalidatePath('/', 'layout');

  return finish(NextResponse.redirect(sameOriginUrl(request, next), 303));
}
