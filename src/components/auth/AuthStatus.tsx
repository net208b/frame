'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Notice } from '@/components/ui/states';
import type { ActionCode, ActionResult } from '@/lib/action-result';
import { isValidationCode } from '@/lib/validation/codes';

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
 *
 * This is also where a validation code becomes a sentence. The schemas in
 * `src/lib/validation/auth.ts` emit keys, not copy, because they run on the
 * server with no translator in reach; the resolver below turns a key into the
 * sentence for the language the reader is actually looking at. A message that
 * is not a key — one the identity service's refusal produced, already
 * translated by the action — is passed through untouched.
 */

type FormState = ActionResult<unknown> | null;

/**
 * The heading for each refusal, by code.
 *
 * Written as a map of key names rather than resolved inline so that adding an
 * `ActionCode` fails to compile until it has a heading, which is what stops a
 * new code reaching a reader as an untitled red box.
 */
const TITLE_KEYS: Record<ActionCode, string> = {
  unauthenticated: 'status.unauthenticated',
  forbidden: 'status.forbidden',
  rate_limited: 'status.rateLimited',
  validation: 'status.validation',
  not_configured: 'status.notConfigured',
  conflict: 'status.conflict',
  not_found: 'status.notFound',
  unknown: 'status.unknown',
};

/**
 * Resolve one message that arrived from the server.
 *
 * `t.has` is checked before `t` so that a code with no copy behind it — a key
 * renamed in the schema but not in the catalogue — shows a plain sentence
 * instead of printing `validation.password.min` at the reader.
 */
function useResolveMessage(): (value: string) => string {
  const t = useTranslations('auth');

  return (value: string) => {
    if (!isValidationCode(value)) return value;
    return t.has(value) ? t(value) : t('status.validationFallback');
  };
}

/**
 * The message filed against one field, resolved for the active language.
 *
 * Forms call this once and then ask it for each field:
 *
 *     const errorFor = useFieldErrors(state);
 *     <TextField error={errorFor('email')} />
 */
export function useFieldErrors(state: FormState): (name: string) => string | undefined {
  const resolve = useResolveMessage();

  return (name: string) => {
    if (!state || state.ok) return undefined;
    const message = state.fieldErrors?.[name];
    return message === undefined ? undefined : resolve(message);
  };
}

export function FormStatus({
  state,
  children,
}: {
  state: FormState;
  /** Shown when the action succeeded, inside the same region. */
  children?: ReactNode;
}) {
  const t = useTranslations('auth');
  const resolve = useResolveMessage();

  /*
   * The one sentence above the form.
   *
   * `parseForm` builds its summary from the issues it found, so for a validation
   * failure that summary is either the single field's code — which resolves — or,
   * when several fields failed, a sentence written in English inside
   * `src/lib/validation/index.ts`, which every feature shares and which this
   * namespace does not own. So the count is recomputed here and the summary is
   * taken from the `auth` catalogue instead. Every other code already carries a
   * sentence the action translated.
   */
  let summary: string | null = null;
  if (state && !state.ok) {
    const fieldCount = Object.keys(state.fieldErrors ?? {}).length;
    summary =
      state.code === 'validation' && fieldCount > 1
        ? t('status.validationSeveral', { count: fieldCount })
        : resolve(state.error);
  }

  return (
    <div aria-live="polite">
      {state && !state.ok ? (
        <Notice
          tone={state.code === 'rate_limited' ? 'warning' : 'danger'}
          title={t(TITLE_KEYS[state.code])}
        >
          {summary}
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
