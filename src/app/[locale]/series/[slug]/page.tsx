import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { Link } from '@/i18n/navigation';
import { CopyLink } from '@/components/photobook/CopyLink';
import { Avatar } from '@/components/photographer/Avatar';
import { SeriesReader } from '@/components/series/SeriesReader';
import { Eyebrow } from '@/components/ui/SectionHead';
import { countSeriesOpen, getSeries } from '@/lib/data/repository';
import { siteUrl } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';
import { formatCount, truncate } from '@/lib/utils';

interface SeriesPageProps {
  params: LocaleParams<{ slug: string }>;
}

/** Rendered on demand, never prerendered — see the book page for why. */
export const dynamic = 'force-dynamic';

const load = cache(async (slug: string) => getSeries(slug));

export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'series' });
  const series = await load(slug);

  if (!series) {
    return buildMetadata({
      title: t('notFound.metaTitle'),
      description: t('notFound.metaDescription'),
      path: `/series/${slug}`,
      locale,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: t('metaTitle', { title: series.title, name: series.owner.displayName }),
    description: series.standfirst
      ? truncate(series.standfirst, 155)
      : t('metaDescription', { name: series.owner.displayName, count: series.items.length }),
    path: `/series/${series.slug}`,
    locale,
    noIndex: series.visibility !== 'public',
    image: { url: `/${locale}/series/${series.slug}/opengraph-image`, alt: series.title },
  });
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'series' });

  const series = await load(slug);
  if (!series) notFound();

  // One count per serve; never awaited, never allowed to break the page.
  void countSeriesOpen(series.slug);

  const shortUrl = `${siteUrl()}/s/${series.slug}`;

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <header className="mx-auto max-w-[68ch]">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-3 text-display-fluid text-balance">{series.title}</h1>
        {series.standfirst ? (
          <p className="mt-5 font-serif text-lead italic leading-relaxed text-ink-soft">{series.standfirst}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <Link href={`/photographers/${series.owner.username}`} className="inline-flex items-center gap-2 font-semibold text-ink hover:underline">
              <Avatar src={series.owner.avatarUrl} name={series.owner.displayName} size={24} decorative />
              {series.owner.displayName}
            </Link>
            <span aria-hidden>·</span>
            <span>{t('itemCount', { count: series.items.length })}</span>
            {series.opens > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{t('opens', { count: formatCount(series.opens, locale) })}</span>
              </>
            ) : null}
          </p>
          <CopyLink url={shortUrl} />
        </div>
      </header>

      {series.cover ? (
        <div className="mx-auto mt-10 max-w-[72rem]">
          <div
            className="relative overflow-hidden rounded-[8px] bg-surface-sunken"
            style={{ aspectRatio: `${series.cover.image.width} / ${series.cover.image.height}` }}
          >
            <Image
              src={series.cover.image.displayUrl}
              alt={series.cover.altText}
              fill
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover"
              priority
            />
          </div>
        </div>
      ) : null}

      <SeriesReader series={series} className="mt-12" />
    </div>
  );
}
