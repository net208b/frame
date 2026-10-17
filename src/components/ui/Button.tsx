import { Slot, Slottable } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink-soft disabled:hover:bg-ink',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-sunken disabled:hover:bg-surface',
  accent: 'bg-accent text-accent-ink hover:bg-accent-strong disabled:hover:bg-accent',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-10 px-[18px] text-caption',
  lg: 'h-12 px-6 text-body',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Render as the single child element instead of a <button> (e.g. a Link). */
  asChild?: boolean;
  /** Shows a spinner and blocks interaction. Keeps the label for screen readers. */
  loading?: boolean;
  iconRight?: ReactNode;
  iconLeft?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  asChild = false,
  loading = false,
  iconLeft,
  iconRight,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      // A button inside a form defaults to submit, which causes accidental
      // submissions from any decorative control. Default to "button" instead.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill font-bold whitespace-nowrap',
        'transition-[background-color,border-color,transform,opacity] duration-200',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'active:not-disabled:translate-y-px',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : iconLeft}
      {/* `Slottable` marks which of these three children is the element that
          `asChild` should merge onto. Without it `Slot` sees three children —
          the icon slots count even when they are undefined — and throws
          "Expected a single React element child". The icons are then rendered
          inside the slotted element, so `<Button asChild iconRight={…}><Link>`
          produces one anchor carrying both the label and the icon. Outside a
          `Slot`, `Slottable` returns its children untouched, so the plain
          <button> path is unchanged. */}
      <Slottable>{children}</Slottable>
      {iconRight}
    </Component>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
