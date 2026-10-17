'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';

/**
 * The Discover failure state.
 *
 * The viewer is told what happened and given two real ways on: retry the same
 * query, or go back to the unfiltered gallery, which is what works when the
 * failure is in one filter. The underlying error goes to the server log rather
 * than onto the page — a stack trace tells a visitor nothing and tells an
 * attacker something.
 */
export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Discover failed to load', error);
  }, [error]);

  return (
    <div className="site-container py-16 lg:py-24">
      <ErrorState
        title="The gallery could not be loaded"
        description="Something went wrong while reading the photographs. This is on our side, not yours."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="secondary">
              <Link href="/discover">Start from the full gallery</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
