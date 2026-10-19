'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

import { Field } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * A password input with a show/hide toggle.
 *
 * The toggle is a real button carrying its own accessible name, not an icon
 * that only works with a mouse. The name states what the next press will do
 * ("Show password" / "Hide password") rather than using `aria-pressed`: a
 * toggle whose label already changes and which also reports a pressed state is
 * announced twice and read as contradictory. Revealing the characters is the
 * single most effective way to stop somebody mistyping a password they cannot
 * see, so it is offered everywhere a password is typed.
 *
 * The accessible name is one whole message, not the visible word plus a hidden
 * noun. English can glue "Show" and " password" together with a space; Thai
 * writes ซ่อนรหัสผ่าน with no space anywhere in it, and a message split in two
 * cannot be put back together in both languages. So the short word on screen
 * and the full name read by a screen reader are two separate messages, and the
 * visible one is hidden from assistive technology to keep the name from being
 * announced twice.
 *
 * The input markup is written out here rather than reusing `TextField`,
 * because the toggle has to sit inside the control's box. The classes below
 * mirror the control styling in components/ui/Field.tsx, which keeps it
 * private; if that file's input changes, this has to change with it.
 */

const CONTROL = cn(
  'w-full rounded-field border bg-surface py-2.5 pr-20 pl-3 text-body text-ink',
  'placeholder:text-muted-soft',
  'transition-colors duration-150',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted',
);

export interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'aria-describedby'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function PasswordField({
  label,
  hint,
  error,
  className,
  required,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations('auth');

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={controlId}
            type={visible ? 'text' : 'password'}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            className={cn(
              CONTROL,
              invalid ? 'border-danger' : 'border-line hover:border-line-strong',
              className,
            )}
            {...props}
          />

          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className={cn(
              'absolute inset-y-0 right-0 inline-flex items-center gap-1.5 rounded-field px-3',
              'text-meta font-bold text-muted transition-colors hover:text-ink',
            )}
          >
            {visible ? (
              <EyeOff className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Eye className="size-3.5 shrink-0" aria-hidden />
            )}
            {/* The visible word carries the state, so the icon is never the
                only signal; the sr-only sentence beside it is the whole
                accessible name, which says what the next press will do. */}
            <span aria-hidden>
              {visible ? t('passwordToggle.hide') : t('passwordToggle.show')}
            </span>
            <span className="sr-only">
              {visible ? t('passwordToggle.hidePassword') : t('passwordToggle.showPassword')}
            </span>
          </button>
        </div>
      )}
    </Field>
  );
}
