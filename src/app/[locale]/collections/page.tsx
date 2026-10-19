import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { CollectionFormDialog } from '@/components/collections/CollectionFormDialog';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Button } from '@/components/ui/Button';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getCollections } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import type { Collection } from '@/types/domain';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'collections' });

  return buildMetadata({
    title: t('meta.indexTitle'),
    description: t('meta.indexDescription'),
    path: '/collections',
    locale,
  });
}

const GRID = 'grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

const LOGIN_HREF = `/login?next=${encodeURIComponent('/collections')}`;

/**
 * The serif italic accent word inside a display headline, which is a Latin-only
 * device.
 *
 * Instrument Serif has no Thai glyphs at all, so `font-serif` on Thai text
 * falls through to whatever serif the reader's system happens to carry, and
 * `italic` is then synthesised — a sheared Thai glyph drags its vowel and tone
 * marks out of position, which is the exact failure the tracking reset in
 * `globals.css` exists to avoid. Thai has no italic convention to borrow
 * either. So in Thai the accent is carried by weight instead: the display sizes
 * sit at 780 and Noto Sans Thai is loaded as a variable font, so dropping one
 * phrase to 400 is a real contrast that leaves every mark where it belongs.
 */
function accentClass(locale: Locale): string {
  return locale === 'th' ? 'font-normal not-italic' : 'font-serif font-normal italic';
}

function CollectionGrid({
  collections,
  showVisibility = false,
}: {
  collections: readonly Collection[];
  showVisibility?: boolean;
}) {
  return (
    <ul className={GRID}>
      {collections.map((collection) => (
        <li key={collection.id}>
          <CollectionCard collection={collection} showVisibility={showVisibility} />
        </li>
      ))}
    </ul>
  );
}

export default async function CollectionsPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'collections' });
  const viewer = await getViewer();

  const [shared, own] = await Promise.all([
    getCollections(),
    viewer
      ? getCollections({ ownerId: viewer.id, includePrivate: true })
      : Promise.resolve<Collection[]>([]),
  ]);

  // A member's own public collections are already listed under "Your
  // collections", so the community list is everybody else's.
  const community = viewer
    ? shared.filter((collection) => collection.owner.id !== viewer.id)
    : shared;

  return (
    <div className="site-container py-14 md:py-20">
      <header className="max-w-[46rem]">
        <Eyebrow>{t('index.eyebrow')}</Eyebrow>

        <h1 className="mt-5 text-display-fluid">
          {t.rich('index.heading', {
            accent: (chunks) => <em className={accentClass(locale)}>{chunks}</em>,
          })}
        </h1>

        <p className="mt-6 max-w-[44ch] text-lead leading-relaxed text-muted">
          {t('index.intro')}
        </p>

        <div className="mt-8">
          {isDemoMode() ? (
            <CapabilityNotice
              capability="database"
              action={t('index.capabilityAction')}
              className="max-w-xl"
            />
          ) : viewer ? (
            // The dialog names its own trigger, so the label is translated
            // where the rest of that form's copy lives.
            <CollectionFormDialog />
          ) : (
            <Button asChild variant="secondary">
              <Link href={LOGIN_HREF}>{t('index.signedOutCta')}</Link>
            </Button>
          )}
        </div>
      </header>

      {viewer ? (
        <section aria-label={t('index.yours.title')} className="mt-16 md:mt-20">
          <SectionHead
            eyebrow={t('index.yours.eyebrow')}
            title={t('index.yours.title')}
            description={
              own.length === 0
                ? undefined
                : // One sentence, one message: English picks a plural form,
                  // Thai has a single form and does not inflect.
                  t('index.yours.description', { count: own.length })
            }
          />

          {own.length > 0 ? (
            // Badge every card here, public ones included: in your own list the
            // question is which of these anyone else can open.
            <CollectionGrid collections={own} showVisibility />
          ) : (
            <EmptyState
              title={t('index.yours.emptyTitle')}
              description={t('index.yours.emptyDescription')}
            />
          )}
        </section>
      ) : null}

      <section aria-label={t('index.community.sectionLabel')} className="mt-16 md:mt-20">
        <SectionHead
          eyebrow={t('index.community.eyebrow')}
          title={t('index.community.title')}
          description={t('index.community.description')}
        />

        {community.length > 0 ? (
          <CollectionGrid collections={community} />
        ) : (
          <EmptyState
            title={t('index.community.emptyTitle')}
            description={t('index.community.emptyDescription')}
          />
        )}
      </section>
    </div>
  );
}
