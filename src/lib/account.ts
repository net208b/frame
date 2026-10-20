import { createClient } from '@/lib/supabase/server';

/**
 * What the Settings page needs to know about the signed-in member.
 *
 * Read with the member's own session, so every row here is one RLS already lets
 * them see — nothing is fetched past a policy except the one yes/no answer that
 * `deletion_would_retain_account()` gives, for the reason written beside that
 * function in migration 0011.
 */

export interface OwnSettings {
  username: string;
  displayName: string;
  biography: string | null;
  basedIn: string | null;
  /** ISO 3166-1 alpha-2, chosen by the member. */
  countryCode: string | null;
  website: string | null;
  /** Other places they publish, http(s) only. */
  socialLinks: string[];
  /** How they shoot, from PHOTOGRAPHY_STYLES. */
  styles: string[];
  /** Open to working with somebody. Null means they have not said. */
  collaboration: string | null;
  /** How they want their work discussed. */
  critique: string | null;
  usualGear: string[];
  /**
   * How the account was made: `email` for the Join form, otherwise the
   * provider's id. Read from app metadata, which only the identity service can
   * write — the same source `change_username()` trusts.
   */
  createdWith: string;
  /** An account made through a provider that has not used its one change. */
  canChangeUsername: boolean;
  /** Set once that change has been used. */
  usernameChangedAt: string | null;
  isSuspended: boolean;
  /** Deleting will keep a stripped, closed account rather than erase it. */
  deletionRetainsAccount: boolean;
}

interface ProfileRow {
  username: string;
  display_name: string;
  biography: string | null;
  based_in: string | null;
  country_code: string | null;
  website: string | null;
  social_links: string[] | null;
  style_tags: string[] | null;
  collaboration_status: string | null;
  critique_preference: string | null;
  usual_gear: string[] | null;
  username_changed_at: string | null;
  is_suspended: boolean;
}

/** `null` when nobody is signed in or the profile row does not exist yet. */
export async function getOwnSettings(): Promise<OwnSettings | null> {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const [profileResult, retainResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        `username, display_name, biography, based_in, country_code, website, social_links,
         style_tags, collaboration_status, critique_preference, usual_gear, username_changed_at,
         is_suspended`,
      )
      .eq('id', auth.user.id)
      .maybeSingle(),
    supabase.rpc('deletion_would_retain_account'),
  ]);

  if (profileResult.error) {
    throw new Error(`FRAME settings: reading the profile failed — ${profileResult.error.message}`);
  }
  if (retainResult.error) {
    throw new Error(
      `FRAME settings: asking how deletion would end failed — ${retainResult.error.message}`,
    );
  }

  const row = profileResult.data as ProfileRow | null;
  if (!row) return null;

  const provider = auth.user.app_metadata?.provider;
  const createdWith = typeof provider === 'string' && provider.length > 0 ? provider : 'email';

  return {
    username: row.username,
    displayName: row.display_name,
    biography: row.biography,
    basedIn: row.based_in,
    countryCode: row.country_code,
    website: row.website,
    socialLinks: row.social_links ?? [],
    styles: row.style_tags ?? [],
    collaboration: row.collaboration_status,
    critique: row.critique_preference,
    usualGear: row.usual_gear ?? [],
    createdWith,
    canChangeUsername:
      createdWith !== 'email' && row.username_changed_at === null && !row.is_suspended,
    usernameChangedAt: row.username_changed_at,
    isSuspended: row.is_suspended,
    deletionRetainsAccount: retainResult.data === true,
  };
}
