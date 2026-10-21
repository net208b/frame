'use client';

import { UserCheck, UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/system/Toast';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link, useRouter } from '@/i18n/navigation';
import type { ActionCode } from '@/lib/action-result';
import { cn, formatCount } from '@/lib/utils';
import { toggleFollow } from '@/server/actions/follow';

/**
 * The follow control.
 *
 * Optimistic, but never dishonest: a failed request puts the previous state
 * back and says what went wrong, and a signed-out visitor gets a real link to
 * sign in rather than a button that silently does nothing. The same shape as
 * the appreciate control, for the same reasons.
 *
 * The accessible label is one whole message per language, because the two
 * languages do not put the photographer's name in the same place.
 */

const KNOWN_CODES: Partial<Record<ActionCode, string>> = {
  rate_limited: 'follow.rateLimited',
  not_configured: 'follow.notConfigured',
  unauthenticated: 'follow.unauthenticated',
};

export function FollowButton({
  profileId,
  username,
  displayName,
  initialFollowerCount,
  initialFollowing,
  signedIn,
  className,
}: {
  profileId: string;
  username: string;
  displayName: string;
  initialFollowerCount: number;
  /** Null when nobody is signed in: an unknown state, not an un-followed one. */
  initialFollowing: boolean | null;
  signedIn: boolean;
  className?: string;
}) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];

  const router = useRouter();
  const toast = useToast();

  const [count, setCount] = useState(initialFollowerCount);
  const [following, setFollowing] = useState(initialFollowing === true);
  const [pending, setPending] = useState(false);

  // A fresh server render should win over the local copy, but never mid
  // request, or an in-flight toggle would be overwritten by the old total.
  const serverState = `${initialFollowerCount}:${String(initialFollowing)}`;
  const [syncedWith, setSyncedWith] = useState(serverState);
  if (!pending && serverState !== syncedWith) {
    setSyncedWith(serverState);
    setCount(initialFollowerCount);
    setFollowing(initialFollowing === true);
  }

  const loginHref = `/login?next=${encodeURIComponent(`/photographers/${username}`)}`;
  const shell =
    'inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-caption font-bold transition-colors duration-150';

  function messageFor(code: ActionCode, error: string): string {
    const key = KNOWN_CODES[code];
    return key ? t(key) : error;
  }

  if (!signedIn) {
    return (
      <Link
        href={loginHref}
        aria-label={t('follow.signInLabel', { name: displayName })}
        className={cn(shell, 'border-line bg-surface text-ink hover:border-line-strong', className)}
      >
        <UserPlus aria-hidden className="size-4" />
        <span>{t('follow.action')}</span>
      </Link>
    );
  }

  async function onToggle() {
    if (pending) return;

    const previous = { count, following };
    setPending(true);
    setFollowing(!previous.following);
    setCount(Math.max(0, previous.count + (previous.following ? -1 : 1)));

    try {
      const result = await toggleFollow(profileId);
      if (result.ok) {
        setFollowing(result.data.following);
        setCount(result.data.followerCount);
        // The feed is a different page and it just changed.
        router.refresh();
        return;
      }

      setFollowing(previous.following);
      setCount(previous.count);
      toast.show(messageFor(result.code, result.error), 'danger');
      if (result.code === 'unauthenticated') router.push(loginHref);
    } catch {
      setFollowing(previous.following);
      setCount(previous.count);
      toast.show(t('follow.failed'), 'danger');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={following}
      aria-busy={pending || undefined}
      aria-label={
        following
          ? t('follow.followingLabel', { name: displayName })
          : t('follow.followLabel', { name: displayName })
      }
      className={cn(
        shell,
        following
          ? 'border-accent-strong bg-accent text-accent-ink hover:bg-accent-strong'
          : 'border-line bg-surface text-ink hover:border-line-strong',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {following ? (
        <UserCheck aria-hidden className="size-4" />
      ) : (
        <UserPlus aria-hidden className="size-4" />
      )}
      <span aria-hidden>{following ? t('follow.following') : t('follow.action')}</span>
      <span className="tabular-nums opacity-70" aria-hidden>
        {formatCount(count, intlLocale)}
      </span>
    </button>
  );
}
