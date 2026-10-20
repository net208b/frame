/**
 * The accounts FRAME can sign somebody in with besides an email address.
 *
 * The identifiers are the identity service's own, which is why X is
 * `twitter`. Supabase offers X twice: `twitter`, over OAuth 1.0a, and `x`, over
 * OAuth 2.0. Only `twitter` is offered here, because the public settings
 * endpoint that decides which buttons to draw (see
 * `enabled-sign-in-providers.ts`) reports `twitter` and does not report `x` at
 * all, enabled or not. A button for `x` could therefore not be shown only when
 * it works. Both sign in through an app in the X developer portal; they differ
 * in which of that app's credentials they use.
 *
 * This module is imported by the sign-in buttons as well as the server, so it
 * holds data and pure functions only.
 */

/** In the order the buttons appear. */
export const SIGN_IN_PROVIDERS = ['google', 'apple', 'facebook', 'twitter'] as const;

export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

/** Brand names, which are not translated. */
export const SIGN_IN_PROVIDER_NAMES: Record<SignInProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
  twitter: 'X',
};

export function isSignInProvider(value: unknown): value is SignInProvider {
  return typeof value === 'string' && (SIGN_IN_PROVIDERS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------ */
/* The in-flight marker                                                      */
/* ------------------------------------------------------------------------ */

/**
 * The cookie that tells `/auth/callback` a provider sign-in is under way.
 *
 * It carries two things the callback cannot otherwise know.
 *
 * Where to land afterwards. The provider is sent back to the bare
 * `/auth/callback`, which is on the identity service's redirect allow-list
 * exactly, rather than to a URL with a `next` query string. A redirect that
 * misses the allow-list is not refused: the identity service quietly sends the
 * member to the site URL instead, where the code is never exchanged and nobody
 * is signed in. Keeping the destination out of the URL removes the one part of
 * that match that could go wrong.
 *
 * That this was a provider sign-in at all. Somebody who presses Cancel at
 * Google comes back with no code, exactly as an expired email link does, and
 * deserves to be told they cancelled rather than that a link ran out.
 *
 * It is not a security boundary: `next` is validated again where it is read,
 * and the provider is only ever used to choose which sentence to show.
 */
export const PROVIDER_FLOW_COOKIE = 'frame-provider-sign-in';

/** Long enough to sign in at the provider, short enough to forget an abandoned attempt. */
export const PROVIDER_FLOW_MAX_AGE_SECONDS = 600;

/** Scoped to the routes that read it, so it is not sent with every page. */
export const PROVIDER_FLOW_COOKIE_PATH = '/auth';

export interface ProviderFlow {
  provider: SignInProvider;
  next: string;
}

export function writeProviderFlow(flow: ProviderFlow): string {
  return JSON.stringify({ provider: flow.provider, next: flow.next });
}

/** `null` for anything that is not a marker this app wrote. */
export function readProviderFlow(raw: string | undefined): ProviderFlow | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { provider, next } = parsed as Record<string, unknown>;
    if (!isSignInProvider(provider) || typeof next !== 'string') return null;

    return { provider, next };
  } catch {
    return null;
  }
}
