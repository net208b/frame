import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';

/**
 * Reached when no member holds this username — including when an account has
 * been removed. The copy says only that, because "deleted" and "suspended" are
 * things a visitor has no business being told about someone else.
 *
 * A `not-found` file receives no `params`, so the locale is read from the
 * request rather than from the URL segment. It is there: the `[locale]` layout
 * above this one has already called `setRequestLocale`, and the links below go
 * through `@/i18n/navigation`, which keeps the reader in the language they
 * arrived in.
 */
export default async function PhotographerNotFound() {
  const t = await getTranslations('profile');

  return (
    <div className="site-container pt-20 pb-28">
      <div className="max-w-[46ch]">
        <Eyebrow>{t('notFound.eyebrow')}</Eyebrow>

        <h1 className="mt-3 text-section-fluid font-bold">{t('notFound.title')}</h1>

        <p className="mt-5 text-lead leading-relaxed text-ink-soft">{t('notFound.body')}</p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild>
            <Link href="/community">{t('notFound.community')}</Link>
          </Button>

          <Link
            href="/discover"
            className="text-caption font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
          >
            {t('notFound.discover')}
          </Link>
        </div>
      </div>
    </div>
  );
}
