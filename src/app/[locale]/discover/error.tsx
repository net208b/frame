'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';

/**
 * The Discover failure state.
 *
 * The viewer is told what happened and given two real ways on: retry the same
 * query, or go back to the unfiltered gallery, which is what works when the
 * failure is in one filter. The underlying error goes to the server log rather
 * than onto the page — a stack trace tells a visitor nothing and tells an
 * attacker something.
 *
 * An error boundary sits inside the locale layout, so the client provider above
 * it has already supplied the messages for the language the reader was in: a
 * Thai reader gets a Thai failure rather than a fallback into English.
 */
export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('discover');
  const tCommon = useTranslations('common');

  useEffect(() => {
    console.error('Discover failed to load', error);
  }, [error]);

  return (
    <div className="site-container py-16 lg:py-24">
      <ErrorState
        title={t('error.title')}
        description={t('error.body')}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={reset}>{tCommon('retry')}</Button>
            <Button asChild variant="secondary">
              <Link href="/discover">{t('error.fullGallery')}</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
