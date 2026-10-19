import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

import { localeFromRequest, withLocalePrefix } from '@/i18n/locales';
import { isDemoMode } from '@/lib/config';
import { safeNextPath, sameOriginUrl } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

/**
 * Confirm an email address, or open a recovery link.
 *
 * This is the token-hash half of the flow: an email template that points at
 * `/auth/confirm?token_hash={{ .TokenHash }}&type=...` lands here, and the
 * hash is verified server-side. It is the only form that works when the member
 * opens the link on a different device from the one that requested it.
 *
 * Supabase's default templates send the member through the identity service's
 * own verify endpoint instead, which arrives here with a code. That exchange
 * lives in /auth/callback, so the request is handed over rather than written
 * twice.
 *
 * Either way the member ends on a page that says what happened. A silent
 * redirect to the home page would leave them guessing whether it worked.
 */

/** The email link types this app issues or can be sent by the identity service. */
const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const;

type EmailLinkType = (typeof EMAIL_OTP_TYPES)[number];

function readType(value: string | null): EmailLinkType | null {
  return EMAIL_OTP_TYPES.find((candidate) => candidate === value) ?? null;
}

/** Where a confirmed link lands when it did not name a destination. */
function defaultDestination(type: EmailLinkType): string {
  if (type === 'recovery') return '/reset-password';
  if (type === 'email_change') return '/verify-email?status=email_changed';
  return '/verify-email?status=confirmed';
}

/** Where a refused link lands: the page that can issue a new one. */
function failureDestination(type: EmailLinkType | null): string {
  return type === 'recovery' ? '/forgot-password?status=link_expired' : '/verify-email?status=invalid';
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = readType(params.get('type'));
  // An email link carries no Referer, so a member who asked for it from a Thai
  // page is recognised by the `locale` parameter the link was built with, or by
  // the locale cookie if they are still in the same browser. Otherwise they
  // land in English, which is the same language a stranger following the link
  // would get.
  const locale = localeFromRequest(request);

  if (isDemoMode()) {
    return NextResponse.redirect(
      sameOriginUrl(request, withLocalePrefix('/login?error=not_configured', locale)),
      303,
    );
  }

  if (!tokenHash && params.get('code')) {
    const handover = request.nextUrl.clone();
    handover.pathname = '/auth/callback';
    return NextResponse.redirect(handover, 303);
  }

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      sameOriginUrl(request, withLocalePrefix(failureDestination(type), locale)),
      303,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error(`FRAME auth: an email link could not be verified — ${error.message}`);
    return NextResponse.redirect(
      sameOriginUrl(request, withLocalePrefix(failureDestination(type), locale)),
      303,
    );
  }

  // Verifying the link signs the member in, so the header changes everywhere.
  revalidatePath('/', 'layout');

  const requested = params.get('next');
  const fallback = withLocalePrefix(defaultDestination(type), locale);
  const destination = requested ? safeNextPath(requested, fallback) : fallback;

  return NextResponse.redirect(
    sameOriginUrl(request, withLocalePrefix(destination, locale)),
    303,
  );
}
