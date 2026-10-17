import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';

/**
 * A not-found file receives no `params`, so there is no locale to pass to
 * `getTranslations`. It reads the request locale instead, which the `[locale]`
 * layout has already settled with `setRequestLocale` before anything below it
 * renders — the same mechanism that keeps this page in the reader's language
 * when `notFound()` is thrown from the detail page above.
 */
export default async function LocationNotFound() {
  const t = await getTranslations('location');

  return (
    <div className="site-container py-24">
      <Eyebrow>{t('notFound.eyebrow')}</Eyebrow>
      <h1 className="text-display-fluid mt-4 max-w-[18ch]">{t('notFound.title')}</h1>

      <p className="mt-6 max-w-[56ch] text-lead leading-relaxed text-muted">{t('notFound.body')}</p>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/locations">{t('notFound.browseAll')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/map">{t('openMap')}</Link>
        </Button>
      </div>
    </div>
  );
}
