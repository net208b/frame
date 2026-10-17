'use client';

import { Check, TriangleAlert, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

/**
 * Transient confirmations, rendered as the prototype's dark pill.
 *
 * A toast is the *only* thing some viewers will see after an action, so the
 * region is a polite live region and each pill carries an icon as well as a
 * colour. Nothing important lives here alone: an action that fails also leaves
 * its error in the page, because a toast that has already dismissed itself is
 * no record at all.
 */

const MAX_VISIBLE = 3;
const DISMISS_AFTER_MS = 4000;

type ToastTone = 'default' | 'success' | 'danger';

interface ToastRecord {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'default') => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastPill key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastPill({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className={cn(
        'on-ink pointer-events-auto flex max-w-[min(34rem,100%)] items-center gap-2.5',
        'rounded-pill bg-ink py-3 pr-2.5 pl-[18px] text-caption font-semibold text-on-ink',
        'shadow-popover motion-safe:animate-rise-in',
      )}
    >
      {toast.tone === 'success' && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
      {toast.tone === 'danger' && (
        <TriangleAlert className="size-4 shrink-0 text-on-ink" aria-hidden />
      )}
      <span className="min-w-0">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="grid size-7 shrink-0 place-items-center rounded-full text-on-ink-muted transition-colors hover:text-on-ink"
      >
        <X className="size-3.5" aria-hidden />
        <span className="sr-only">Dismiss this message</span>
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error(
      'useToast() was called outside <ToastProvider>. ToastProvider is mounted in src/app/layout.tsx; a component calling useToast() must render inside it.',
    );
  }
  return context;
}
