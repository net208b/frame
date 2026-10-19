import type { Metadata } from 'next';

import { DEFAULT_LOCALE, LOCALES, type Locale, withLocalePrefix } from '@/i18n/locales';
import { SITE, siteUrl } from '@/lib/config';
import { precisionLabel } from '@/lib/geo';
import { CATEGORY_LABELS, type LocationDetail, type PhotographDetail } from '@/types/domain';

/**
 * Metadata and structured data.
 *
 * Three rules shape this file. Canonical URLs are always built from `siteUrl()`
 * so a preview deployment never advertises itself as the production site. Every
 * page declares a canonical in its own language and an `hreflang` alternate for
 * each of the others, so the two translations of a page are published as one
 * document in two languages rather than as duplicates competing with each
 * other. And structured data only states what FRAME actually knows: a
 * photograph carries its author and, when one is on file, the place it was made
 * — never a licence, because members grant none, and never a coordinate the
 * location policy has withheld.
 *
 * Callers pass `path` without a locale (`/discover`, `/photographs/slug`) and
 * the locale separately. The prefix is added here, in one place, so no caller
 * has to remember it.
 */

function canonicalPath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (withLeadingSlash === '/') return '/';
  return withLeadingSlash.replace(/\/+$/, '');
}

function absoluteUrl(value: string, base: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

/** The absolute address of one locale-free path in one language. */
function localeUrl(base: string, path: string, locale: Locale): string {
  return `${base}${withLocalePrefix(canonicalPath(path), locale)}`;
}

/**
 * The `hreflang` set for a page: one entry per language, plus `x-default`
 * pointing at English, which is what a crawler with no language preference of
 * its own is sent to. It mirrors the routing decision that English is the
 * landing language.
 */
function alternateLanguages(base: string, path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[locale] = localeUrl(base, path, locale);
  languages['x-default'] = localeUrl(base, path, DEFAULT_LOCALE);
  return languages;
}

export function buildMetadata(input: {
  title: string;
  description: string;
  /** Locale-free, as the app writes it: `/discover`, not `/en/discover`. */
  path: string;
  locale: Locale;
  image?: { url: string; alt: string } | null;
  noIndex?: boolean;
  type?: 'website' | 'article';
}): Metadata {
  const base = siteUrl();
  const url = localeUrl(base, input.path, input.locale);

  // Open Graph consumers crop to roughly 1.91:1, so the declared box matches
  // the share card rather than the source image's own dimensions.
  const images = input.image
    ? [
        {
          url: absoluteUrl(input.image.url, base),
          width: 1200,
          height: 630,
          alt: input.image.alt,
        },
      ]
    : undefined;

  const shared = {
    url,
    siteName: SITE.name,
    title: input.title,
    description: input.description,
    images,
  };

  const openGraph: Metadata['openGraph'] =
    input.type === 'article' ? { ...shared, type: 'article' } : { ...shared, type: 'website' };

  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url, languages: alternateLanguages(base, input.path) },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: images?.map((image) => image.url),
    },
    ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

/* ------------------------------------------------------------------------ */
/* Structured data                                                           */
/* ------------------------------------------------------------------------ */

/**
 * The locale is taken, not assumed, because every URL in the graph has to be
 * the address of the page the reader is actually on. An unprefixed `url` here
 * would name a path that only redirects.
 */
export function photographJsonLd(
  photo: PhotographDetail,
  locale: Locale,
): Record<string, unknown> {
  const base = siteUrl();

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Photograph',
    name: photo.title,
    description: photo.description ?? photo.altText,
    url: localeUrl(base, `/photographs/${photo.slug}`, locale),
    genre: CATEGORY_LABELS[photo.category],
    datePublished: photo.publishedAt,
    image: {
      '@type': 'ImageObject',
      url: absoluteUrl(photo.image.displayUrl, base),
      width: photo.image.width,
      height: photo.image.height,
      caption: photo.altText,
    },
    thumbnailUrl: absoluteUrl(photo.image.thumbUrl, base),
    creator: {
      '@type': 'Person',
      name: photo.photographer.displayName,
      alternateName: `@${photo.photographer.username}`,
      url: localeUrl(base, `/photographers/${photo.photographer.username}`, locale),
    },
    copyrightHolder: {
      '@type': 'Person',
      name: photo.photographer.displayName,
    },
  };

  // Only present when EXIF held a date and the owner chose to publish it.
  if (photo.capturedAt) jsonLd.dateCreated = photo.capturedAt;

  if (photo.location) {
    jsonLd.contentLocation = {
      '@type': 'Place',
      name: photo.location.name,
      url: localeUrl(base, `/locations/${photo.location.slug}`, locale),
      address: {
        '@type': 'PostalAddress',
        addressLocality: photo.location.city,
        addressCountry: photo.location.countryCode,
      },
    };
  }

  return jsonLd;
}

export function placeJsonLd(
  location: LocationDetail,
  locale: Locale,
): Record<string, unknown> {
  const base = siteUrl();

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: location.name,
    url: localeUrl(base, `/locations/${location.slug}`, locale),
    address: {
      '@type': 'PostalAddress',
      addressLocality: location.city,
      addressCountry: location.countryCode,
    },
  };

  if (location.description) jsonLd.description = location.description;

  // A withheld place carries no coordinates at all, and a privacy-sensitive one
  // is already stored coarsened. Emitting `location.coordinates` verbatim is
  // therefore the only way this can never widen published precision.
  if (location.coordinates) {
    jsonLd.geo = {
      '@type': 'GeoCoordinates',
      latitude: location.coordinates.latitude,
      longitude: location.coordinates.longitude,
    };

    if (location.coordinates.isApproximate) {
      jsonLd.additionalProperty = {
        '@type': 'PropertyValue',
        name: 'Coordinate precision',
        value: `Deliberately approximate, accurate to ${precisionLabel(
          location.coordinates.precisionDecimals,
        )}`,
      };
    }
  }

  return jsonLd;
}
