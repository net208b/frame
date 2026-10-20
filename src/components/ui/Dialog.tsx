'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Modal dialog built on Radix, which supplies the parts that are tedious and
 * easy to get wrong by hand: focus trapping, restoring focus to the trigger,
 * Escape to close, scroll locking and the correct ARIA wiring.
 */

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  size = 'md',
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const widths = {
    sm: 'max-w-[420px]',
    md: 'max-w-[520px]',
    lg: 'max-w-[720px]',
  } as const;

  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <RadixDialog.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'max-h-[calc(100vh-3rem)] overflow-y-auto rounded-panel bg-paper p-7 shadow-modal',
          'data-[state=open]:animate-rise-in',
          widths[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <RadixDialog.Title className="text-section font-semibold tracking-tight">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Close
            aria-label="Close dialog"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-muted transition-colors hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </RadixDialog.Close>
        </div>

        {description ? (
          <RadixDialog.Description className="mt-2 text-caption leading-relaxed text-muted">
            {description}
          </RadixDialog.Description>
        ) : (
          // Radix warns when a dialog has no description; an explicit empty one
          // is clearer than suppressing the warning.
          <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
        )}

        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/**
 * Confirmation for destructive actions.
 *
 * Deliberately requires the caller to name the thing being deleted, so the
 * dialog can never read "Are you sure?" with no object.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={title}
        description={body}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </DialogClose>
            <Button variant="danger" loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
