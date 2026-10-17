'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * The search field.
 *
 * It is a real GET form pointed at `/search`, so it works with no JavaScript
 * at all. When JavaScript is available the submit is intercepted only to keep
 * the client router in play, which is what makes the pending state below
 * possible. The field itself is uncontrolled: the caller remounts this
 * component per query, so the box always shows what the URL says.
 */

/** Matches the ceiling the page applies when it reads `q`. */
const MAX_QUERY_LENGTH = 120;

export function SearchForm({
  initialQuery = '',
  className,
}: {
  initialQuery?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const typed = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    event.preventDefault();

    const href = typed ? `/search?q=${encodeURIComponent(typed)}` : '/search';
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className={cn('max-w-2xl', className)}>
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={handleSubmit}
        className="flex items-start gap-2.5"
      >
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-soft"
          />
          <TextField
            label="Search FRAME"
            hideLabel
            name="q"
            type="search"
            defaultValue={initialQuery}
            placeholder="A city, a place or a photographer"
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 pl-11"
          />
        </div>

        <Button type="submit" size="lg" loading={pending}>
          Search
        </Button>
      </form>

      <div className="mt-2.5 flex min-h-5 flex-wrap items-baseline gap-x-5 gap-y-1">
        {/* Always in the DOM, so the change is announced rather than the region appearing. */}
        <p aria-live="polite" className="text-meta text-muted">
          {pending ? 'Searching' : ''}
        </p>

        {initialQuery ? (
          <Link
            href="/search"
            className="text-meta font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
          >
            Clear this search
          </Link>
        ) : null}
      </div>
    </div>
  );
}
