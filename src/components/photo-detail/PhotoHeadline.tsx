import { getLocale, getTranslations } from 'next-intl/server';

import { AppreciateButton } from '@/components/photo/AppreciateButton';
import { CategoryTag } from '@/components/photo/CategoryTag';
import { TranslationBlock, Translated } from '@/components/translation/AutoTranslated';
import { anyTranslation } from '@/lib/translation/applies';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { cn, formatDate } from '@/lib/utils';
import type { PhotographDetail } from '@/types/domain';

/**
 * The top of the information column: what this photograph is called, what the
 * photographer wanted from it, and the one control this page actually offers.
 *
 * The h1 is the title and nothing else, so the page announces the frame rather
 * than the site.
 *
 * The publication line is one message with a `<date>` tag rather than the word
 * "Published" followed by a `<time>` element: Thai writes "เผยแพร่เมื่อ" with
 * no space before the date, and where the date sits in the sentence is the
 * translator's call, not the component's.
 */
export async function PhotoHeadline({
  photo,
  className,
}: {
  photo: PhotographDetail;
  className?: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('photo'), getLocale()]);
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];

  const published = formatDate(photo.publishedAt, intlLocale);
  // The domain type uses null for "signed out", which is what keeps the
  // appreciate control from pretending to be a toggle for a visitor.
  const signedIn = photo.viewerHasAppreciated !== null;

  return (
    <header className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag category={photo.category} tone="surface" />
        {photo.editorsPick ? (
          <span className="inline-flex items-center rounded-pill bg-ink px-2.5 py-1.5 text-eyebrow text-on-ink uppercase">
            {t('headline.editorsPick')}
          </span>
        ) : null}
      </div>

      <TranslationBlock
        className="mt-4"
        locale={locale}
        available={anyTranslation(locale, photo.translations.title, photo.translations.description)}
      >
        <Translated
          as="h1"
          className="text-section-fluid font-bold"
          original={photo.title}
          translation={photo.translations.title}
        />

        {photo.description ? (
          <Translated
            as="p"
            className="mt-4 text-lead text-ink-soft"
            original={photo.description}
            translation={photo.translations.description}
          />
        ) : null}
      </TranslationBlock>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <AppreciateButton
          photographId={photo.id}
          slug={photo.slug}
          title={photo.title}
          initialCount={photo.appreciationCount}
          initialHasAppreciated={photo.viewerHasAppreciated}
          signedIn={signedIn}
          variant="inline"
        />

        {published ? (
          <p className="text-meta text-muted">
            {t.rich('headline.published', {
              date: (chunks) => (
                <time dateTime={photo.publishedAt} className="text-ink-soft">
                  {chunks}
                </time>
              ),
              published,
            })}
          </p>
        ) : null}
      </div>
    </header>
  );
}
