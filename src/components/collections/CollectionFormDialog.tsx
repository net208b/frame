'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import {
  createCollection,
  deleteCollection,
  updateCollection,
} from '@/server/actions/collections';
import type { CollectionVisibility } from '@/types/domain';

/**
 * The two client controls that act on a collection record itself: the form that
 * creates or renames one, and the confirmed delete.
 *
 * Both are small leaves. Neither claims anything the server did not do: a
 * refusal is rendered next to the field that caused it and left in the page
 * afterwards, because a toast that has already dismissed itself is no record.
 *
 * The confirmations are written here, in the reader's language, from the facts
 * the action returned — `ok`, the saved slug, whether the address moved. The
 * server also returns an English sentence of its own, and it is deliberately
 * not shown: it is one language, and the member reading this form may not be
 * reading in it. Nothing is claimed that the result did not report.
 *
 * Refusals are a different matter. `result.error` carries a reason only the
 * server knows — an address already taken, a field the schema rejected — so it
 * is shown exactly as it arrives. Those sentences are still English; see the
 * note in the handover.
 *
 * The visibility choices are assembled here rather than imported from the
 * validation module so the select's copy stays a short label with a sentence of
 * explanation, and so the schemas — and Zod with them — stay out of this
 * bundle. The map is keyed by the domain union, so a third visibility could not
 * be added without this list refusing to compile.
 */

const VISIBILITY_ORDER: readonly CollectionVisibility[] = ['private', 'public'];

/**
 * The stored limits, declared once so the field and the sentence that describes
 * it cannot drift apart. They mirror `collectionSchema`, which is the authority:
 * the server trims and re-checks whatever arrives.
 */
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 600;
const SLUG_MAX = 80;

export interface CollectionFormValues {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: CollectionVisibility;
}

function fieldError(errors: Record<string, string>, key: string): string | null {
  return errors[key] ?? null;
}

export function CollectionFormDialog({
  collection,
  triggerLabel,
  triggerVariant = 'primary',
  className,
}: {
  /** Absent when creating, supplied when editing an existing collection. */
  collection?: CollectionFormValues;
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const t = useTranslations('collections');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = collection !== undefined;
  const label = triggerLabel ?? (isEdit ? t('form.editTrigger') : t('form.createTrigger'));

  const visibility: Record<CollectionVisibility, { label: string; description: string }> = {
    private: {
      label: t('form.visibilityPrivateLabel'),
      description: t('form.visibilityPrivateDescription'),
    },
    public: {
      label: t('form.visibilityPublicLabel'),
      description: t('form.visibilityPublicDescription'),
    },
  };

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFormError(null);
      setFieldErrors({});
    }
  }

  function applyFailure(result: Extract<ActionResult<unknown>, { ok: false }>) {
    setFieldErrors(result.fieldErrors ?? {});
    setFormError(result.error);
    if (result.code === 'unauthenticated') {
      router.push(`/login?next=${encodeURIComponent('/collections')}`);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const entries = new FormData(event.currentTarget);
    const payload = {
      collectionId: collection?.id ?? null,
      title: String(entries.get('title') ?? ''),
      description: String(entries.get('description') ?? ''),
      visibility: String(entries.get('visibility') ?? 'private'),
      // Only the edit form offers the address. Left blank, the server rebuilds
      // it from the title.
      slug: isEdit ? String(entries.get('slug') ?? '') : null,
    };

    setPending(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = isEdit
        ? await updateCollection(payload)
        : await createCollection(payload);

      if (!result.ok) {
        applyFailure(result);
        return;
      }

      // The schema trims the title before storing it, so the confirmation
      // names the collection the way it was actually saved.
      const saved = payload.title.trim();

      if (isEdit && collection !== undefined) {
        const moved = result.data.slug !== collection.slug;
        toast.show(
          moved
            ? t('form.updatedWithAddress', { title: saved, slug: result.data.slug })
            : t('form.updated', { title: saved }),
          'success',
        );
        reset(false);

        if (moved) {
          // The address moved, so the page we are standing on no longer exists.
          router.replace(`/collections/${result.data.slug}`);
        } else {
          router.refresh();
        }
        return;
      }

      toast.show(t('form.created', { title: saved }), 'success');
      reset(false);
      router.refresh();
    } catch {
      setFormError(t('form.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Controlled rather than wrapped in a Radix trigger, so the dialog can
          close itself after a successful write. Radix returns focus to whatever
          was focused when it opened, which is this button. */}
      <Button
        variant={triggerVariant}
        className={className}
        onClick={() => reset(true)}
        iconLeft={isEdit ? <Pencil aria-hidden className="size-3.5" /> : undefined}
      >
        {label}
      </Button>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent
          title={isEdit ? t('form.editTitle') : t('form.createTitle')}
          description={isEdit ? t('form.editDescription') : t('form.createDescription')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{tCommon('cancel')}</Button>
              </DialogClose>
              <Button type="submit" form={formId} loading={pending}>
                {isEdit ? t('form.submitEdit') : t('form.submitCreate')}
              </Button>
            </>
          }
        >
          <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
            <TextField
              name="title"
              label={t('form.titleLabel')}
              required
              maxLength={TITLE_MAX}
              defaultValue={collection?.title ?? ''}
              error={fieldError(fieldErrors, 'title')}
              placeholder={t('form.titlePlaceholder')}
              hint={t('form.titleHint', { max: TITLE_MAX })}
            />

            <TextAreaField
              name="description"
              label={t('form.descriptionLabel')}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              defaultValue={collection?.description ?? ''}
              error={fieldError(fieldErrors, 'description')}
              hint={t('form.descriptionHint', { max: DESCRIPTION_MAX })}
            />

            <SelectField
              name="visibility"
              label={t('form.visibilityLabel')}
              defaultValue={collection?.visibility ?? 'private'}
              error={fieldError(fieldErrors, 'visibility')}
              hint={
                <>
                  {VISIBILITY_ORDER.map((value) => (
                    <span key={value} className="mt-0.5 block">
                      <strong className="font-semibold text-ink-soft">
                        {visibility[value].label}.
                      </strong>{' '}
                      {visibility[value].description}
                    </span>
                  ))}
                </>
              }
            >
              {VISIBILITY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {visibility[value].label}
                </option>
              ))}
            </SelectField>

            {isEdit ? (
              <TextField
                name="slug"
                label={t('form.slugLabel')}
                maxLength={SLUG_MAX}
                defaultValue={collection?.slug ?? ''}
                error={fieldError(fieldErrors, 'slug')}
                hint={t('form.slugHint')}
              />
            ) : null}

            <p aria-live="polite" className="sr-only">
              {pending ? t('form.saving') : ''}
            </p>

            {/* The refusal stays in the page rather than only in a toast. */}
            {formError ? (
              <p
                role="alert"
                className="rounded-card bg-danger-bg px-4 py-3 text-caption leading-relaxed text-danger"
              >
                {formError}
              </p>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Delete                                                                    */
/* ------------------------------------------------------------------------ */

export function DeleteCollectionButton({
  collectionId,
  collectionTitle,
  itemCount,
  className,
}: {
  collectionId: string;
  collectionTitle: string;
  itemCount: number;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('collections');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await deleteCollection({ collectionId });

      if (!result.ok) {
        setOpen(false);
        setError(result.error);
        return;
      }

      toast.show(t('deleteDialog.done', { title: collectionTitle }), 'success');
      setOpen(false);
      router.push('/collections');
    } catch {
      setOpen(false);
      setError(t('deleteDialog.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn('inline-flex flex-col items-start gap-2', className)}>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        iconLeft={<Trash2 aria-hidden className="size-3.5" />}
      >
        {tCommon('delete')}
      </Button>

      {/* The collection is named in the question, in both languages, so the
          confirmation can never read "Are you sure?" with no object. The entry
          count and the warning are one message: English selects a plural form,
          Thai has a single one and separates the two sentences with a space,
          which is what a Thai sentence break is. */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('deleteDialog.title', { title: collectionTitle })}
        body={t('deleteDialog.body', { count: itemCount })}
        confirmLabel={t('deleteDialog.confirm')}
        onConfirm={onConfirm}
        pending={pending}
      />

      {error ? (
        <p role="alert" className="max-w-xs text-meta leading-relaxed font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
