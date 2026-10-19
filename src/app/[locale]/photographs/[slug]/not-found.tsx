import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';

/**
 * Shown when a photograph slug resolves to nothing the viewer may see.
 *
 * It deliberately does not guess which of the possible reasons applies. A page
 * that says "this was removed" when the truth is a mistyped URL is worse than
 * one that lists what might have happened, and saying "removed for copyright"
 * about someone's work on no evidence would be worse still. The Thai keeps the
 * same hedging: every reason is one of several possibilities, none of them
 * asserted.
 *
 * This file receives no `params`, but it renders inside
 * `src/app/[locale]/layout.tsx`, which has already declared the locale for the
 * request — so `getTranslations` resolves to the language the reader is in.
 */
export default async function PhotographNotFound() {
  const t = await getTranslations('photo');

  return (
    <div className="site-container py-20 lg:py-28">
      <div className="max-w-xl">
        <Eyebrow>{t('notFound.eyebrow')}</Eyebrow>

        <h1 className="text-section-fluid mt-3 font-bold">{t('notFound.title')}</h1>

        <p className="mt-5 text-lead text-ink-soft">{t('notFound.body')}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/discover">{t('notFound.browse')}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/map">{t('notFound.map')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
