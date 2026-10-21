'use client';

import * as RadixLabel from '@radix-ui/react-label';
import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Form controls.
 *
 * Every control is wired to its label, its hint and its error message through
 * real ids, so a screen reader announces the same thing a sighted user reads.
 * Errors are rendered in text, never as colour alone.
 */

const CONTROL_BASE = cn(
  'w-full rounded-field border bg-surface px-3 py-2.5 text-body text-ink',
  'placeholder:text-muted-soft',
  'transition-colors duration-150',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted',
);

function controlClasses(invalid: boolean, className?: string) {
  return cn(
    CONTROL_BASE,
    invalid ? 'border-danger' : 'border-line hover:border-line-strong',
    className,
  );
}

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Hides the visual label but keeps it for assistive technology. */
  hideLabel?: boolean;
  className?: string;
  children: (ids: { controlId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  children,
}: FieldShellProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const invalid = Boolean(error);

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('block', className)}>
      <RadixLabel.Root
        htmlFor={controlId}
        className={cn(
          'mb-1.5 block text-meta font-bold text-ink',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <span className="ml-1 font-normal text-muted" aria-hidden>
            (required)
          </span>
        )}
      </RadixLabel.Root>

      {children({ controlId, describedBy, invalid })}

      {hint && (
        <p id={hintId} className="mt-1.5 text-meta leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-meta font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  wrapperClassName?: string;
}

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  wrapperClassName,
  className,
  required,
  ...props
}: TextFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={wrapperClassName}
    >
      {({ controlId, describedBy, invalid }) => (
        <input
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={controlClasses(invalid, className)}
          {...props}
        />
      )}
    </Field>
  );
}

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'aria-describedby'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  wrapperClassName?: string;
}

export function TextAreaField({
  label,
  hint,
  error,
  hideLabel,
  wrapperClassName,
  className,
  required,
  ...props
}: TextAreaFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={wrapperClassName}
    >
      {({ controlId, describedBy, invalid }) => (
        <textarea
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          rows={4}
          className={cn(controlClasses(invalid, className), 'resize-y leading-relaxed')}
          {...props}
        />
      )}
    </Field>
  );
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-describedby'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  wrapperClassName?: string;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  hideLabel,
  wrapperClassName,
  className,
  required,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={wrapperClassName}
    >
      {({ controlId, describedBy, invalid }) => (
        <select
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={cn(controlClasses(invalid, className), 'appearance-none pr-8')}
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  description,
  error,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  description?: ReactNode;
  error?: string | null;
}) {
  const base = useId();
  const controlId = `${base}-checkbox`;
  const describedId = `${base}-description`;

  return (
    <div className={cn('flex gap-3', className)}>
      <input
        id={controlId}
        type="checkbox"
        aria-describedby={description ? describedId : undefined}
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] border accent-ink',
          error ? 'border-danger' : 'border-line-strong',
        )}
        {...props}
      />
      <div className="min-w-0">
        <RadixLabel.Root htmlFor={controlId} className="block cursor-pointer text-caption text-ink">
          {label}
        </RadixLabel.Root>
        {description && (
          <p id={describedId} className="mt-1 text-meta leading-relaxed text-muted">
            {description}
          </p>
        )}
        {error && <p className="mt-1 text-meta font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
