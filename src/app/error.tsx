'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';

/**
 * The route-level error boundary.
 *
 * It shows the digest and nothing else. The digest is the one value that lets
 * somebody match what they saw to a line in the server log, whereas the error
 * message and stack belong to the server: in production Next replaces the
 * message with a placeholder anyway, and printing whatever survives would be a
 * way of leaking internals to anybody who can make a page fail.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="site-container py-16 lg:py-24">
      <ErrorState
        title="This page could not be loaded"
        description="Something failed on the server while building this page. Nothing you did caused it and nothing was saved or changed. Trying again often works, because a failed read is frequently a transient one."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="secondary">
              <Link href="/discover">Go to Discover</Link>
            </Button>
          </div>
        }
      />

      {error.digest ? (
        <p className="mt-5 text-center text-meta text-muted-soft">
          Quote this reference if you report it:{' '}
          <code className="font-mono font-semibold text-muted">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
