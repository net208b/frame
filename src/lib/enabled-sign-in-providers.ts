import { isDemoMode, publicEnv } from '@/lib/config';
import { SIGN_IN_PROVIDERS, type SignInProvider } from '@/lib/sign-in-providers';

/**
 * Which providers the identity service will accept right now.
 *
 * Read from Supabase's public settings endpoint rather than from an
 * environment variable, so a provider switched on in the dashboard gets its
 * button without a deploy and a provider switched off loses it. A button that
 * leads to "provider is not enabled" is a button that does not work, and the
 * two sources of truth an environment variable would create are exactly how
 * that happens.
 *
 * Cached for five minutes. The answer changes when somebody edits the
 * dashboard, which is rare, while asking on every render would send a request
 * to the identity service for every visitor to a sign-in page. A provider
 * switched off can therefore keep its button for up to five minutes; the
 * action that the button posts to asks again, so it still cannot be used.
 *
 * Every failure answers "none". The email form keeps working, and drawing a
 * button on a guess is the thing this function exists to prevent.
 *
 * Server only: it is called from pages and from a server action, never from a
 * component that ships to the browser.
 */

const REVALIDATE_SECONDS = 300;

interface AuthSettings {
  external?: Record<string, unknown>;
}

export async function enabledSignInProviders(): Promise<SignInProvider[]> {
  if (isDemoMode()) return [];

  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  if (!supabaseUrl || !supabasePublishableKey) return [];

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      console.error(
        `FRAME auth: the sign-in provider settings could not be read (HTTP ${response.status})`,
      );
      return [];
    }

    const external = ((await response.json()) as AuthSettings).external ?? {};
    return SIGN_IN_PROVIDERS.filter((provider) => external[provider] === true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FRAME auth: the sign-in provider settings could not be read — ${message}`);
    return [];
  }
}
