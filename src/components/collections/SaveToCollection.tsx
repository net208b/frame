'use client';

import { Bookmark, Lock, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
// The router is the locale-aware one, so pushing `/collections` keeps the
// reader in their language. `usePathname` is deliberately Next's own: its value
// is handed to `/login?next=…`, and that destination has to carry the locale
// prefix, because the server action that redirects to it afterwards has no
// other way of knowing which language the member was reading.
import { useRouter } from '@/i18n/navigation';
import type { ActionCode } from '@/lib/action-result';
import { isDemoMode } from '@/lib/config';
import { cn, formatCount } from '@/lib/utils';
import {
  addToCollection,
  createCollection,
  listSaveTargets,
  removeFromCollection,
  type CollectionSaveTarget,
} from '@/server/actions/collections';

/**
 * The two client controls for an entry's membership of a collection: the save
 * dialog a photograph or a place page offers, and the remove control an owner
 * gets on an entry already in one.
 *
 * Three commitments:
 *
 * - Signed out, saving navigates to sign-in with a return path. It does not
 *   open a dialog that would fail, and it does not pretend anything was kept.
 * - With no database there is nothing to save to, so the control is replaced by
 *   a sentence saying so. A button that cannot work does not get rendered.
 * - A tick is optimistic but never final: the server's refusal puts the box
 *   back and says what happened.
 *
 * Every sentence that mentions the thing being saved is one message per kind,
 * selected with ICU rather than assembled from a noun phrase. English could
 * drop "this photograph" into the middle of a sentence; Thai cannot, because
 * the word order is different and there is no space to splice at. So the whole
 * sentence exists twice in each language, once for a photograph and once for a
 * place, and `{kind}` picks.
 *
 * The confirmations are written here from what the action returned —
 * `alreadyPresent`, `removed` — so the reader is told in their own language
 * exactly what the server reported. A refusal (`result.error`) is a reason only
 * the server knows and is shown as it arrives; those sentences are still
 * English.
 */

export type SaveSubjectKind = 'photograph' | 'location';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function subjectIds(kind: SaveSubjectKind, id: string): Record<string, string> {
  return kind === 'photograph' ? { photographId: id } : { locationId: id };
}

export function SaveToCollection({
  subjectKind,
  subjectId,
  subjectLabel,
  variant = 'secondary',
  className,
}: {
  subjectKind: SaveSubjectKind;
  subjectId: string;
  /** The photograph's title or the place's name, used in the copy and the labels. */
  subjectLabel: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const locale = useLocale();
  const t = useTranslations('collections');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>('idle');
  const [targets, setTargets] = useState<CollectionSaveTarget[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const intl = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;
  const ids = subjectIds(subjectKind, subjectId);

  // With no database there is nothing to save to. Say that instead of offering
  // a control that could only fail.
  if (isDemoMode()) {
    return (
      <p
        className={cn(
          'rounded-card border border-line bg-surface px-4 py-3 text-caption leading-relaxed text-muted',
          className,
        )}
      >
        {t.rich('save.demoNotice', {
          code: (chunks) => (
            <code className="font-mono text-[0.95em] font-semibold">{chunks}</code>
          ),
        })}
      </p>
    );
  }

  /**
   * Read the viewer's collections. The outcome is returned rather than acted
   * on, so the caller decides what it means: the trigger opens the dialog only
   * once there is something real to show, while the in-dialog retry leaves the
   * dialog where it is.
   */
  async function load(): Promise<'ready' | 'error' | 'signed-out'> {
    setState('loading');
    setLoadError(null);

    try {
      const result = await listSaveTargets(ids);

      if (!result.ok) {
        if (result.code === 'unauthenticated') {
          setState('idle');
          return 'signed-out';
        }
        setState('error');
        setLoadError(result.error);
        return 'error';
      }

      setTargets(result.data);
      setState('ready');
      return 'ready';
    } catch {
      setState('error');
      setLoadError(t('save.loadFailed'));
      return 'error';
    }
  }

  /**
   * The trigger. A signed-out viewer is sent to sign in instead of being shown
   * a dialog that would close again the moment it tried to save, which is why
   * the list is read before the dialog opens rather than inside it.
   */
  async function openDialog() {
    if (state === 'loading') return;

    const outcome = await load();
    if (outcome === 'signed-out') {
      router.push(loginHref);
      return;
    }
    setOpen(true);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreateError(null);
      setNewTitle('');
      setStatus('');
    }
  }

  async function toggle(target: CollectionSaveTarget) {
    if (busyId !== null) return;

    const next = !target.contains;
    const before = { contains: target.contains, itemCount: target.itemCount };

    function patch(row: Partial<CollectionSaveTarget>) {
      setTargets((current) =>
        current.map((candidate) =>
          candidate.id === target.id ? { ...candidate, ...row } : candidate,
        ),
      );
    }

    function refuse(message: string, code: ActionCode) {
      patch(before);
      setStatus(message);
      toast.show(message, 'danger');
      if (code === 'unauthenticated') router.push(loginHref);
    }

    setBusyId(target.id);
    setStatus(
      next
        ? t('save.savingTo', { title: target.title })
        : t('save.removingFrom', { title: target.title }),
    );
    patch({
      contains: next,
      itemCount: Math.max(0, before.itemCount + (next ? 1 : -1)),
    });

    try {
      // The two actions return different payloads, so each is awaited inside
      // its own branch rather than through one union the compiler would then
      // refuse to read either field from.
      let changed: boolean;
      let confirmation: string;

      if (next) {
        const result = await addToCollection({ collectionId: target.id, ...ids });
        if (!result.ok) {
          refuse(result.error, result.code);
          return;
        }
        changed = !result.data.alreadyPresent;
        confirmation = result.data.alreadyPresent
          ? t('save.alreadySavedIn', { title: target.title })
          : t('save.savedTo', { title: target.title });
      } else {
        const result = await removeFromCollection({ collectionId: target.id, ...ids });
        if (!result.ok) {
          refuse(result.error, result.code);
          return;
        }
        changed = result.data.removed;
        confirmation = result.data.removed
          ? t('save.removedFrom', { title: target.title })
          : t('save.nothingRemoved', { title: target.title });
      }

      // An add that hit the unique constraint, and a remove that matched no
      // row, both leave the membership the member asked for — so the tick is
      // right, but the entry count we nudged was already correct and has to go
      // back. Showing a number one off from the truth is still showing a wrong
      // number.
      if (!changed) patch({ itemCount: before.itemCount });

      setStatus(confirmation);
      toast.show(confirmation, changed ? 'success' : 'default');
    } catch {
      patch(before);
      setStatus(t('save.changeFailedShort'));
      toast.show(t('save.changeFailed'), 'danger');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    const title = newTitle.trim();
    setCreating(true);
    setCreateError(null);

    try {
      // A collection made from here is private, which is the schema's default
      // too: a working set should not become public by accident.
      const created = await createCollection({
        title,
        description: null,
        visibility: 'private',
        slug: null,
      });

      if (!created.ok) {
        setCreateError(created.error);
        if (created.code === 'unauthenticated') router.push(loginHref);
        return;
      }

      const added = await addToCollection({ collectionId: created.data.collectionId, ...ids });
      setNewTitle('');

      // The session can expire between the two writes, which would leave the
      // dialog showing nothing at all.
      if ((await load()) === 'signed-out') {
        setOpen(false);
        router.push(loginHref);
        return;
      }

      if (!added.ok) {
        // The collection exists; only the entry failed. Both halves get said.
        setCreateError(
          t('save.createdNotSaved', { kind: subjectKind, title, reason: added.error }),
        );
        return;
      }

      const confirmation = t('save.createdAndSaved', { kind: subjectKind, title });
      setStatus(confirmation);
      toast.show(confirmation, 'success');
    } catch {
      setCreateError(t('save.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        className={className}
        loading={state === 'loading' && !open}
        onClick={() => void openDialog()}
        iconLeft={<Bookmark aria-hidden className="size-3.5" />}
        aria-label={t('save.triggerAriaLabel', { label: subjectLabel })}
      >
        {tCommon('save')}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={t('save.dialogTitle')}
          description={t('save.dialogDescription', { label: subjectLabel })}
        >
          <p aria-live="polite" className="sr-only">
            {state === 'loading' ? t('save.loading') : status}
          </p>

          {state === 'loading' ? (
            <ul className="space-y-3" aria-hidden>
              {[0, 1, 2].map((row) => (
                <li key={row} className="skeleton h-10 rounded-field" />
              ))}
            </ul>
          ) : null}

          {state === 'error' ? (
            <div role="alert" className="rounded-card bg-danger-bg px-4 py-3">
              <p className="text-caption leading-relaxed text-danger">
                {loadError ?? t('save.loadFailedShort')}
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
                {tCommon('retry')}
              </Button>
            </div>
          ) : null}

          {state === 'ready' && targets.length === 0 ? (
            <p className="text-caption leading-relaxed text-muted">
              {t('save.noneYet', { kind: subjectKind })}
            </p>
          ) : null}

          {state === 'ready' && targets.length > 0 ? (
            <ul className="space-y-3">
              {targets.map((target) => (
                <li key={target.id}>
                  <CheckboxField
                    checked={target.contains}
                    onChange={() => void toggle(target)}
                    disabled={busyId !== null}
                    label={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* The member's own title, as they wrote it. */}
                        <span className="font-semibold">{target.title}</span>
                        {target.visibility === 'private' ? (
                          <span className="inline-flex items-center gap-1 text-meta text-muted">
                            <Lock aria-hidden className="size-2.5" />
                            {t('visibility.private')}
                          </span>
                        ) : null}
                      </span>
                    }
                    description={
                      <span className="tabular-nums">
                        {t('card.entryCount', {
                          count: target.itemCount,
                          formatted: formatCount(target.itemCount, intl),
                        })}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {state === 'ready' || state === 'error' ? (
            <form onSubmit={onCreate} className="mt-6 border-t border-line pt-5">
              <TextField
                name="title"
                label={t('save.newLabel')}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                maxLength={80}
                placeholder={t('save.newPlaceholder')}
                error={createError}
                hint={t('save.newHint', { kind: subjectKind })}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={creating}
                  disabled={newTitle.trim().length === 0}
                  iconLeft={<Plus aria-hidden className="size-3.5" />}
                >
                  {t('save.newSubmit')}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Remove                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * The owner's remove control on an entry inside a collection.
 *
 * Not optimistic: the entry is rendered by a Server Component, so the honest
 * sequence is to write, then refresh and let the server say what is there. The
 * button holds a "removed" state in the meantime so a second click cannot fire
 * the same write twice.
 *
 * This control is handed a collection id and no title, so its confirmation says
 * "the collection" rather than naming one — which is also true to the context:
 * it only ever appears on that collection's own page, under its masthead.
 */
export function RemoveFromCollectionButton({
  collectionId,
  subjectKind,
  subjectId,
  subjectLabel,
  className,
}: {
  collectionId: string;
  subjectKind: SaveSubjectKind;
  subjectId: string;
  subjectLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('collections');

  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRemove() {
    if (pending || removed) return;
    setPending(true);
    setError(null);

    try {
      const result = await removeFromCollection({
        collectionId,
        ...subjectIds(subjectKind, subjectId),
      });

      if (!result.ok) {
        setError(result.error);
        toast.show(result.error, 'danger');
        return;
      }

      setRemoved(true);
      // A delete that matched no row is still the state the owner asked for,
      // but it is not a change — so it is reported, not celebrated.
      toast.show(
        result.data.removed ? t('removeItem.done') : t('removeItem.nothingRemoved'),
        result.data.removed ? 'success' : 'default',
      );
      router.refresh();
    } catch {
      setError(t('removeItem.failed'));
      toast.show(t('removeItem.failed'), 'danger');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onRemove()}
        loading={pending}
        disabled={removed}
        iconLeft={pending ? undefined : <X aria-hidden className="size-3" />}
        aria-label={t('removeItem.ariaLabel', { label: subjectLabel })}
      >
        {removed ? t('removeItem.removedLabel') : t('removeItem.label')}
      </Button>
      {error ? (
        <span role="alert" className="text-meta font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
