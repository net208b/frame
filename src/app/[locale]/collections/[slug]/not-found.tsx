import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';

/**
 * The 404 a collection page falls back to.
 *
 * It is reached from two different situations on purpose: no collection has
 * this address, or one does but it is private and the reader is not its owner.
 * The copy covers both without distinguishing them, because wording that said
 * "this one is private" would confirm the collection exists — and that is the
 * owner's to disclose, not ours.
 *
 * A `not-found.tsx` gets no `params`, so the locale comes from the request
 * configuration the `[locale]` layout has already settled.
 */
export default function CollectionNotFound() {
  const locale = useLocale();
  const t = useTranslations('collections');

  // See the note on the same device in `collections/page.tsx`: Instrument
  // Serif has no Thai glyphs and a synthesised italic would shear the vowel
  // and tone marks, so Thai takes its accent from weight instead of style.
  const accent = locale === 'th' ? 'font-normal not-italic' : 'font-serif font-normal italic';

  return (
    <div className="site-container py-24">
      <Eyebrow>{t('eyebrow')}</Eyebrow>
      <h1 className="mt-4 max-w-[20ch] text-display-fluid">
        {t.rich('notFound.heading', {
          accent: (chunks) => <em className={accent}>{chunks}</em>,
        })}
      </h1>

      <p className="mt-6 max-w-[56ch] text-lead leading-relaxed text-muted">{t('notFound.body')}</p>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/collections">{t('notFound.browse')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/discover">{t('notFound.discover')}</Link>
        </Button>
      </div>
    </div>
  );
}
