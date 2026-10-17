'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
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
 * The visibility choices are written here rather than imported from the
 * validation module so the select's copy stays a short label with a sentence of
 * explanation, and so the schemas — and Zod with them — stay out of this
 * bundle. The map is keyed by the domain union, so a third visibility could not
 * be added without this list refusing to compile.
 */

const VISIBILITY: Record<CollectionVisibility, { label: string; description: string }> = {
  private: {
    label: 'Private — only you',
    description: 'Only you can open it. This is the default, and it stays that way until you say otherwise.',
  },
  public: {
    label: 'Public — anyone with the link',
    description: 'Anyone can open it and it may appear in the collections index.',
  },
};

const VISIBILITY_ORDER: CollectionVisibility[] = ['private', 'public'];

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

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = collection !== undefined;
  const label = triggerLabel ?? (isEdit ? 'Edit details' : 'Create collection');

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

      toast.show(result.message ?? 'Saved.', 'success');
      reset(false);

      if (isEdit && collection !== undefined && result.data.slug !== collection.slug) {
        // The address moved, so the page we are standing on no longer exists.
        router.replace(`/collections/${result.data.slug}`);
      } else {
        router.refresh();
      }
    } catch {
      setFormError(
        'That could not be saved. Check your connection and try again — nothing has changed.',
      );
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
          title={isEdit ? 'Edit this collection' : 'Create a collection'}
          description={
            isEdit
              ? 'Change the title, the description, the address or who can see it.'
              : 'Group photographs and places together — a shot list for a city, a route to walk, or frames worth returning to.'
          }
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" form={formId} loading={pending}>
                {isEdit ? 'Save changes' : 'Create collection'}
              </Button>
            </>
          }
        >
          <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
            <TextField
              name="title"
              label="Title"
              required
              maxLength={80}
              defaultValue={collection?.title ?? ''}
              error={fieldError(fieldErrors, 'title')}
              placeholder="Tokyo after midnight"
              hint="Up to 80 characters. The address is built from this unless you set one below."
            />

            <TextAreaField
              name="description"
              label="Description"
              rows={3}
              maxLength={600}
              defaultValue={collection?.description ?? ''}
              error={fieldError(fieldErrors, 'description')}
              hint="Optional. Say what holds the set together, so somebody else can tell whether it is for them."
            />

            <SelectField
              name="visibility"
              label="Who can see it"
              defaultValue={collection?.visibility ?? 'private'}
              error={fieldError(fieldErrors, 'visibility')}
              hint={
                <>
                  {VISIBILITY_ORDER.map((value) => (
                    <span key={value} className="mt-0.5 block">
                      <strong className="font-semibold text-ink-soft">
                        {VISIBILITY[value].label}.
                      </strong>{' '}
                      {VISIBILITY[value].description}
                    </span>
                  ))}
                </>
              }
            >
              {VISIBILITY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {VISIBILITY[value].label}
                </option>
              ))}
            </SelectField>

            {isEdit ? (
              <TextField
                name="slug"
                label="Address"
                maxLength={80}
                defaultValue={collection?.slug ?? ''}
                error={fieldError(fieldErrors, 'slug')}
                hint="The part after /collections/ in the link. Changing it breaks any link already shared; clearing it rebuilds the address from the title."
              />
            ) : null}

            <p aria-live="polite" className="sr-only">
              {pending ? 'Saving your collection.' : ''}
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

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries =
    itemCount === 0
      ? 'It holds nothing at the moment.'
      : `Its ${itemCount} ${itemCount === 1 ? 'entry' : 'entries'} go with it.`;

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

      toast.show(result.message ?? 'The collection is deleted.', 'success');
      setOpen(false);
      router.push('/collections');
    } catch {
      setOpen(false);
      setError(
        'That collection could not be deleted. Check your connection and try again — it is still there.',
      );
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
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete “${collectionTitle}”?`}
        body={`${entries} The photographs and places themselves are not affected — only this grouping of them. This cannot be undone.`}
        confirmLabel="Delete collection"
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
