import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { formatInstant, localised } from '@/components/challenges/format';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { getFeature } from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { truncate } from '@/lib/utils';

/**
 * A feature, read as a piece: the editors' introduction, then each photograph
 * large, in order, with its caption and its photographer's name. Nothing
 * competes with the photographs — no appreciation buttons, no related strip;
 * each frame links to its own page, where all of that lives.
 *
 * A draft reaches this page only for staff (row-level security), and says so.
 */

interface PageProps {
  params: LocaleParams<{ slug: string }>;
}

const loadFeature = cache(getFeature);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await readLocaleParams(params);
  const feature = await loadFeature(slug);
  if (!feature || feature.status !== 'published') return {};
  return buildMetadata({
    title: localised(feature.title, locale),
    description: truncate(localised(feature.intro, locale), 160),
    path: `/features/${feature.slug}`,
    locale,
  });
}

export default async function FeaturePage({ params }: PageProps) {
  const { locale, slug } = await readLocaleParams(params);
  setRequestLocale(locale);
  const [feature, t] = await Promise.all([
    loadFeature(slug),
    getTranslations({ locale, namespace: 'features' }),
  ]);
  if (!feature) notFound();

  const thai = locale.startsWith('th');

  return (
    <article className="site-container py-9 lg:py-14">
      <nav aria-label={t('breadcrumb.label')} className="mb-7 text-meta text-muted">
        <Link href="/community?view=features" className="hover:text-ink">
          {t('breadcrumb.features')}
        </Link>
      </nav>

      <header className="mx-auto max-w-[62ch]">
        <Eyebrow>
          {feature.status === 'published' && feature.publishedAt
            ? t('reader.eyebrow', { date: formatInstant(feature.publishedAt, locale) })
            : t('draft')}
        </Eyebrow>
        <h1 className="mt-4 text-display-fluid">{localised(feature.title, locale)}</h1>
        <div className="mt-7 space-y-4 text-lead leading-relaxed text-ink-soft">
          {localised(feature.intro, locale)
            .split(/\n{2,}/)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      </header>

      <ol className="mx-auto mt-16 max-w-5xl space-y-20">
        {feature.items.map((item) => {
          const caption = (thai ? item.caption.th : item.caption.en) ?? item.caption.en ?? item.caption.th;
          const photo = item.photograph;
          return (
            <li key={photo.id}>
              <figure>
                <Link href={`/photographs/${photo.slug}`} className="block">
                  <Image
                    src={photo.image.displayUrl}
                    alt={photo.altText}
                    width={photo.image.width}
                    height={photo.image.height}
                    sizes="(min-width: 1024px) 64rem, 100vw"
                    placeholder={photo.image.blurDataUrl ? 'blur' : 'empty'}
                    blurDataURL={photo.image.blurDataUrl}
                    className="mx-auto h-auto max-h-[85vh] w-auto max-w-full rounded-media"
                  />
                </Link>
                <figcaption className="mx-auto mt-4 max-w-[62ch]">
                  <p className="text-body font-semibold">
                    <Link href={`/photographs/${photo.slug}`} className="hover:text-accent-strong">
                      {photo.title}
                    </Link>
                    <span className="font-normal text-muted">
                      {' · '}
                      <Link href={`/photographers/${photo.photographer.username}`} className="hover:text-ink">
                        {photo.photographer.displayName}
                      </Link>
                    </span>
                  </p>
                  {caption ? <p className="mt-2 text-body leading-relaxed text-ink-soft">{caption}</p> : null}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
