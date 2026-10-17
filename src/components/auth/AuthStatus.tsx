'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { Notice } from '@/components/ui/states';
import type { ActionCode, ActionResult } from '@/lib/action-result';

/**
 * The one status region every account form reports through.
 *
 * It is rendered from the first paint and never unmounted, because a live
 * region that arrives at the same moment as its first message is frequently
 * not announced at all. Forms therefore keep this region in place and swap
 * their own contents around it.
 *
 * Each notice carries a heading as well as a colour: the tone is a second
 * signal, never the only one.
 */

type FormState = ActionResult<unknown> | null;

const TITLES: Record<ActionCode, string> = {
  unauthenticated: 'Could not sign in',
  forbidden: 'Not permitted',
  rate_limited: 'Too many attempts',
  validation: 'Check the form',
  not_configured: 'Not available in this deployment',
  conflict: 'Already in use',
  not_found: 'Not found',
  unknown: 'Something went wrong',
};

export function FormStatus({
  state,
  children,
}: {
  state: FormState;
  /** Shown when the action succeeded, inside the same region. */
  children?: ReactNode;
}) {
  return (
    <div aria-live="polite">
      {state && !state.ok ? (
        <Notice tone={state.code === 'rate_limited' ? 'warning' : 'danger'} title={TITLES[state.code]}>
          {state.error}
        </Notice>
      ) : null}

      {state?.ok ? children : null}
    </div>
  );
}

/**
 * What an account form shows once its action has actually written something.
 *
 * It takes the sentence the action returned rather than writing its own, so
 * the page cannot claim more than happened — several of these messages are
 * deliberately conditional ("if that address has an account…") and rewording
 * them here would turn a careful sentence into a false one.
 */
export function FormSuccess({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-success-bg px-4 py-4">
      <p className="flex items-center gap-2 text-caption font-bold text-success">
        {icon ?? <Check className="size-4 shrink-0" aria-hidden />}
        {title}
      </p>
      <div className="mt-1.5 text-caption leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

/** The message filed against one field, if the last attempt produced one. */
export function fieldError(state: FormState, name: string): string | undefined {
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[name];
}
