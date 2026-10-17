import type { NextRequest } from 'next/server';

/**
 * Where an auth flow is allowed to send somebody afterwards.
 *
 * Every `next` parameter in this app passes through here. A sign-in page that
 * forwards to whatever a query string asks for is an open redirect: the link
 * looks like FRAME, the password is typed into FRAME, and the member lands on
 * somebody else's page still believing they are here. So the rule is narrow —
 * a path on this site, nothing else — and anything that fails it falls back to
 * a known-good destination rather than being repaired.
 */

/**
 * Destinations that would bounce a member straight back out of the flow they
 * just completed. Signing in only to be returned to the sign-in form reads as
 * a failure, and `/auth/signout` would end the session that was just created.
 */
const REFUSED_PREFIXES = ['/auth/', '/api/'] as const;
const REFUSED_PATHS = ['/login', '/join', '/auth'] as const;

/** Control characters can split a header or truncate a URL in a browser. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function safeNextPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;

  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 512) return fallback;
  if (CONTROL_CHARACTERS.test(candidate)) return fallback;

  // One leading slash and no second one: `//evil.example` is a
  // protocol-relative URL, and some browsers read a backslash as a slash, so
  // `/\evil.example` is the same trick written differently.
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback;

  const pathname = candidate.split(/[?#]/, 1)[0] ?? '/';
  if (REFUSED_PATHS.includes(pathname as (typeof REFUSED_PATHS)[number])) return fallback;
  if (REFUSED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return fallback;

  return candidate;
}

/**
 * An absolute URL on the origin the request actually arrived at.
 *
 * `request.nextUrl` already accounts for the forwarded host, which matters
 * because a session cookie set on one host is useless on another: redirecting
 * to a URL built from a configured base would hand the browser a cookie for a
 * site it is no longer on.
 */
export function sameOriginUrl(request: NextRequest, path: string): URL {
  const url = request.nextUrl.clone();
  const [pathname = '/', search = ''] = path.split('?', 2);

  url.pathname = pathname;
  url.search = search;
  url.hash = '';

  return url;
}
