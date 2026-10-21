import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { Link } from '@/i18n/navigation';
import { BookViewer } from '@/components/photobook/BookViewer';
import { CopyLink } from '@/components/photobook/CopyLink';
import { Avatar } from '@/components/photographer/Avatar';
import { Eyebrow } from '@/components/ui/SectionHead';
import { countPhotobookOpen, getPhotobook } from '@/lib/data/repository';
import { gearText } from '@/components/photobook/covers';
import { siteUrl } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';
import { formatCount, truncate } from '@/lib/utils';

interface BookPageProps {
  params: LocaleParams<{ slug: string }>;
}

/**
 * Rendered on demand, never prerendered — the same reasoning as every other
 * route that reads through the cookie-bound client; see the collection page.
 */
export const dynamic = 'force-dynamic';

const load = cache(async (slug: string) => getPhotobook(slug));

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'photobook' });
  const book = await load(slug);

  if (!book) {
    return buildMetadata({
      title: t('notFound.metaTitle'),
      description: t('notFound.metaDescription'),
      path: `/books/${slug}`,
      locale,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: t('metaTitle', { title: book.title, name: book.owner.displayName }),
    description: book.dedication
      ? truncate(book.dedication, 155)
      : t('metaDescription', { name: book.owner.displayName, count: book.pages.length }),
    path: `/books/${book.slug}`,
    locale,
    // Unlisted means "anyone with the link": it opens, it shares, it is simply
    // not offered to a search engine.
    noIndex: book.visibility !== 'public',
    // The cover itself, drawn by the route's own opengraph-image.
    image: { url: `/${locale}/books/${book.slug}/opengraph-image`, alt: book.title },
  });
}

export default async function BookPage({ params }: BookPageProps) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'photobook' });

  const book = await load(slug);
  if (!book) notFound();

  // One count per serve. Not awaited: a slow or failed count must never hold
  // up or break the book.
  void countPhotobookOpen(book.slug);

  const shortUrl = `${siteUrl()}/b/${book.slug}`;
  const gear = gearText({
    title: book.title,
    author: book.owner.displayName,
    handle: book.owner.username,
    slug: book.slug,
    gearMode: book.gearMode,
    gearBrand: book.gearBrand,
    gearModel: book.gearModel,
  });

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-3 text-section-fluid font-bold text-balance">{book.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <Link href={`/photographers/${book.owner.username}`} className="inline-flex items-center gap-2 font-semibold text-ink hover:underline">
              <Avatar src={book.owner.avatarUrl} name={book.owner.displayName} size={24} decorative />
              {book.owner.displayName}
            </Link>
            <span aria-hidden>·</span>
            <span>{t('pageCount', { count: book.pages.length })}</span>
            {gear ? (
              <>
                <span aria-hidden>·</span>
                <span>{t('shotOn', { gear })}</span>
              </>
            ) : null}
            {book.opens > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{t('opens', { count: formatCount(book.opens, locale) })}</span>
              </>
            ) : null}
          </p>
          {book.dedication ? (
            <p className="mt-4 max-w-[48ch] font-serif text-lead italic leading-relaxed text-ink-soft">{book.dedication}</p>
          ) : null}
        </div>

        <CopyLink url={shortUrl} />
      </header>

      <div className="mt-8">
        <BookViewer book={book} tableColor="#262319" />
      </div>

      <p className="mt-6 max-w-[62ch] text-meta leading-relaxed text-muted">{t('colophon', { name: book.owner.displayName })}</p>
    </div>
  );
}
