'use client';

import { Heart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/system/Toast';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link, useRouter } from '@/i18n/navigation';
import type { ActionCode } from '@/lib/action-result';
import { cn, formatCount } from '@/lib/utils';
import { toggleAppreciation } from '@/server/actions/appreciation';

/**
 * The appreciate control.
 *
 * Optimistic, but never dishonest: a failed request puts the previous state
 * back and says what went wrong, and a signed-out visitor gets a real link to
 * sign in rather than a button that silently does nothing.
 *
 * The accessible label is one whole message per language, because the two
 * languages do not agree on where the photograph's name goes: English reads
 * "Appreciate <name>" and Thai "ชื่นชม <name>", and the count that follows is
 * a plural in English and a single form in Thai. It also says the full number
 * rather than the compact figure on the face of the button — "1,214
 * appreciations" is what a screen reader should read out, not "1.2k".
 */

type Variant = 'overlay' | 'inline';

const SHELL: Record<Variant, string> = {
  overlay: 'grid size-9 place-items-center rounded-pill',
  inline: 'inline-flex h-10 items-center gap-2 rounded-pill border px-4 text-caption font-bold',
};

const ACTIVE: Record<Variant, string> = {
  overlay: 'bg-accent text-accent-ink hover:bg-accent-strong',
  inline: 'border-accent-strong bg-accent text-accent-ink hover:bg-accent-strong',
};

const IDLE: Record<Variant, string> = {
  overlay: 'bg-surface/88 text-ink hover:bg-surface',
  inline: 'border-line bg-surface text-ink hover:border-line-strong',
};

/**
 * Which failures this component can describe itself.
 *
 * Anything not listed here keeps the server's own `error`, which is the honest
 * fallback: inventing a friendlier sentence would mean guessing what went
 * wrong. Those server messages are still English — see the follow-ups.
 */
const KNOWN_CODES: Partial<Record<ActionCode, string>> = {
  rate_limited: 'appreciate.rateLimited',
  not_configured: 'appreciate.notConfigured',
  unauthenticated: 'appreciate.unauthenticated',
};

export function AppreciateButton({
  photographId,
  slug,
  initialCount,
  initialHasAppreciated,
  signedIn,
  variant = 'overlay',
  title,
  className,
}: {
  photographId: string;
  slug: string;
  initialCount: number;
  initialHasAppreciated: boolean | null;
  signedIn: boolean;
  variant?: Variant;
  /** The photograph's title, so the accessible label names the frame itself. */
  title?: string;
  className?: string;
}) {
  const t = useTranslations('photo');
  const locale = useLocale();
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];

  const router = useRouter();
  const toast = useToast();

  const [count, setCount] = useState(initialCount);
  const [appreciated, setAppreciated] = useState(initialHasAppreciated === true);
  const [pending, setPending] = useState(false);

  // A fresh server render — after our own revalidation, or because someone else
  // appreciated the same frame — should win over our local copy. Never mid
  // request, or an in-flight toggle would be overwritten by the old total.
  const serverState = `${initialCount}:${String(initialHasAppreciated)}`;
  const [syncedWith, setSyncedWith] = useState(serverState);
  if (!pending && serverState !== syncedWith) {
    setSyncedWith(serverState);
    setCount(initialCount);
    setAppreciated(initialHasAppreciated === true);
  }

  const name = slug.replace(/-/g, ' ').trim();
  const photographName = title ?? (name || t('appreciate.thisPhotograph'));
  const loginHref = `/login?next=${encodeURIComponent(`/photographs/${slug}`)}`;
  const classes = (active: boolean) =>
    cn(
      'transition-colors duration-150',
      SHELL[variant],
      active ? ACTIVE[variant] : IDLE[variant],
      className,
    );

  function messageFor(code: ActionCode, error: string): string {
    const key = KNOWN_CODES[code];
    return key ? t(key) : error;
  }

  // Signed out, this control navigates, so it is a link. Nothing is mutated and
  // nothing pretends to have been saved.
  if (!signedIn) {
    return (
      <Link
        href={loginHref}
        aria-label={t('appreciate.signInLabel', {
          name: photographName,
          count: initialCount,
        })}
        className={classes(false)}
      >
        <Heart aria-hidden className="size-4" />
        {variant === 'inline' ? (
          <span className="tabular-nums" aria-hidden>
            {formatCount(initialCount, intlLocale)}
          </span>
        ) : null}
      </Link>
    );
  }

  async function onToggle() {
    if (pending) return;

    const previous = { count, appreciated };
    setPending(true);
    setAppreciated(!previous.appreciated);
    setCount(Math.max(0, previous.count + (previous.appreciated ? -1 : 1)));

    try {
      const result = await toggleAppreciation(photographId);

      if (result.ok) {
        // The server's total is the only one worth trusting.
        setAppreciated(result.data.appreciated);
        setCount(result.data.count);
        return;
      }

      setAppreciated(previous.appreciated);
      setCount(previous.count);
      toast.show(messageFor(result.code, result.error), 'danger');
      if (result.code === 'unauthenticated') router.push(loginHref);
    } catch {
      setAppreciated(previous.appreciated);
      setCount(previous.count);
      toast.show(t('appreciate.failed'), 'danger');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={appreciated}
      aria-busy={pending || undefined}
      aria-label={t('appreciate.label', { name: photographName, count })}
      className={cn(classes(appreciated), 'disabled:cursor-not-allowed disabled:opacity-60')}
    >
      <Heart aria-hidden className={cn('size-4', appreciated && 'fill-current')} />
      {variant === 'inline' ? (
        <span className="tabular-nums" aria-hidden>
          {formatCount(count, intlLocale)}
        </span>
      ) : null}
    </button>
  );
}
