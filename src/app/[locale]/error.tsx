'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';

/**
 * The route-level error boundary.
 *
 * It shows the digest and nothing else. The digest is the one value that lets
 * somebody match what they saw to a line in the server log, whereas the error
 * message and stack belong to the server: in production Next replaces the
 * message with a placeholder anyway, and printing whatever survives would be a
 * way of leaking internals to anybody who can make a page fail.
 *
 * Unlike `app/global-error.tsx`, this boundary is inside the locale layout, so
 * the messages and the active language are both available and a failure is
 * reported in the language the reader was already in.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');

  return (
    <div className="site-container py-16 lg:py-24">
      <ErrorState
        title={t('route.title')}
        description={t('route.description')}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button onClick={reset}>{tCommon('retry')}</Button>
            <Button asChild variant="secondary">
              <Link href="/discover">{t('route.goToDiscover')}</Link>
            </Button>
          </div>
        }
      />

      {error.digest ? (
        <p className="mt-5 text-center text-meta text-muted-soft">
          {/* One sentence with the reference inside it, not a label and a
              value concatenated: the punctuation and the word order around it
              differ between the two languages. */}
          {t.rich('route.reference', {
            digest: error.digest,
            code: (chunks) => <code className="font-mono font-semibold text-muted">{chunks}</code>,
          })}
        </p>
      ) : null}
    </div>
  );
}
