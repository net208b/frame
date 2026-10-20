import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { gearBrandIndex, GearList } from '@/components/photographer/GearList';
import { ProfileCollections } from '@/components/photographer/ProfileCollections';
import { ProfileFootprints } from '@/components/photographer/ProfileFootprints';
import { ProfileHeader } from '@/components/photographer/ProfileHeader';
import { ProfileStats } from '@/components/photographer/ProfileStats';
import {
  ProfileTabs,
  readProfileView,
  type ProfileView,
} from '@/components/photographer/ProfileTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { getViewer } from '@/lib/auth';
import {
  getCollections,
  getPhotographer,
  getPhotographerMapPins,
  getPortfolio,
} from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { cn, formatCount, truncate } from '@/lib/utils';

interface ProfilePageProps {
  params: LocaleParams<{ username: string }>;
  /**
   * `?view=` picks which part of the profile is shown. Only the page reads it:
   * `generateMetadata` deliberately does not, so every view declares the same
   * canonical address and the three of them are one page to a search engine.
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `generateMetadata` and the page itself both need the profile, the portfolio
 * and the public collections. `cache` makes that one set of queries per
 * request instead of two.
 */
const loadProfile = cache(async (username: string) => {
  const photographer = await getPhotographer(username);
  if (!photographer) return null;

  const [portfolio, collections, footprints] = await Promise.all([
    getPortfolio(photographer.id),
    // No `includePrivate`, so a private collection is never even read here.
    getCollections({ ownerId: photographer.id }),
    // The places they have published from, with their own count at each. Read
    // here rather than in the section so the metadata and the page share it,
    // and so all four reads overlap instead of queueing.
    getPhotographerMapPins(photographer.id),
  ]);

  return { photographer, portfolio, collections, footprints };
});

/**
 * Rendered on demand, never prerendered.
 *
 * Every read in this route goes through the cookie-bound Supabase client, so
 * row-level security answers as whoever is reading rather than as the public.
 * That makes `cookies()` part of loading the page, whether or not anything on
 * it differs between two viewers.
 *
 * A dynamic segment with `generateStaticParams` serves an address that was not
 * in that list by rendering it once and caching the result, and a cached
 * render may not read cookies — Next.js raises DYNAMIC_SERVER_USAGE and the
 * request becomes a 500. Which is to say: with a database behind it, this page
 * returned 500 for anything published since the last deployment, and a
 * missing member returned 500 instead of its not-found page.
 *
 * So the route says plainly that it is dynamic, and `generateStaticParams` is
 * gone rather than left to look like it still prerenders something. Putting it
 * back without first moving the per-viewer parts behind their own boundary
 * brings the 500 back with it.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { locale, username } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'profile' });
  const loaded = await loadProfile(username);

  if (!loaded) {
    return buildMetadata({
      title: t('notFound.metaTitle'),
      description: t('notFound.metaDescription'),
      path: `/photographers/${username}`,
      locale,
      noIndex: true,
    });
  }

  const { photographer, portfolio } = loaded;
  const lead = portfolio.at(0);

  /*
   * The biography is the member's own words, so it is used as written. The
   * fallback is ours, and the based-in variant is a second whole sentence
   * rather than the same sentence with a clause bolted on: Thai puts the city
   * before the verb ("ช่างภาพจาก …"), which no amount of concatenation reaches.
   */
  const description = photographer.biography
    ? truncate(photographer.biography, 155)
    : photographer.basedIn
      ? t('metaDescriptionBasedIn', {
          name: photographer.displayName,
          city: photographer.basedIn,
        })
      : t('metaDescription', { name: photographer.displayName });

  return buildMetadata({
    title: t('metaTitle', {
      name: photographer.displayName,
      username: photographer.username,
    }),
    description,
    path: `/photographers/${photographer.username}`,
    locale,
    // The newest published frame, so the share card shows the member's work
    // rather than their avatar.
    image: lead ? { url: lead.image.displayUrl, alt: lead.altText } : null,
  });
}

export default async function PhotographerProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const { locale, username } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'profile' });

  const loaded = await loadProfile(username);
  if (!loaded) notFound();

  const { photographer, portfolio, collections, footprints } = loaded;

  // Reading the member looking at the page costs nothing here: this route is
  // `force-dynamic` and every read already goes through the cookie-bound
  // client, and the session is read once per request and cached.
  const viewer = await getViewer();
  const isSelf = viewer !== null && viewer.id === photographer.id;

  // The portfolio read is capped, so the count under the heading says what is
  // on the page rather than repeating the profile total as if it were shown.
  const shown = portfolio.length;
  const capped = shown < photographer.photographCount;
  const portfolioCount = capped
    ? t('portfolio.countOfTotal', {
        shown: formatCount(shown, locale),
        total: formatCount(photographer.photographCount, locale),
      })
    : t('portfolio.countPublished', { shown: formatCount(shown, locale) });

  // GearList renders nothing when the member left the field blank, so the band
  // drops to one column rather than keeping an empty second one open.
  const hasGear = photographer.usualGear.some((entry) => entry.trim().length > 0);

  /*
   * Which views this profile actually has, and which one was asked for.
   *
   * Frames is always there — it is what a profile is for, and it says so
   * itself when there is nothing published yet. The other two appear only when
   * there is something in them, with one exception: the member looking at
   * their own page sees Footprints regardless, because its empty state tells
   * them how a place gets there, which is something they can act on.
   *
   * The collections filter is repeated from `ProfileCollections`, which filters
   * again on its own. That duplication is deliberate there and the reason holds
   * here too: a private collection appearing on a public profile is a mistake
   * that cannot be taken back.
   */
  const publicCollections = collections.filter(
    (collection) => collection.visibility === 'public',
  ).length;

  const views: ProfileView[] = [
    'frames',
    ...(footprints.length > 0 || isSelf ? (['footprints'] as const) : []),
    ...(publicCollections > 0 ? (['collections'] as const) : []),
  ];
  const view = readProfileView((await searchParams)?.view, views);

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <ProfileHeader photographer={photographer} isSelf={isSelf} />

      <div
        className={cn(
          'mt-10 grid gap-9 lg:gap-14',
          hasGear && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]',
        )}
      >
        <ProfileStats photographer={photographer} />
        {hasGear ? (
          <GearList gear={photographer.usualGear} brands={gearBrandIndex(portfolio)} />
        ) : null}
      </div>

      <ProfileTabs username={photographer.username} active={view} views={views} className="mt-14" />

      {view === 'frames' ? (
        <section className="mt-10">
          <SectionHead
            eyebrow={t('portfolio.eyebrow')}
            title={t('portfolio.title')}
            action={
              shown > 0 ? (
                <p className="text-meta text-muted tabular-nums">{portfolioCount}</p>
              ) : null
            }
          />

          {shown > 0 ? (
            <MasonryGallery photos={portfolio} showPhotographer={false} priorityCount={4} />
          ) : (
            <EmptyState
              title={t('portfolio.emptyTitle')}
              description={t('portfolio.emptyDescription', { name: photographer.displayName })}
            />
          )}
        </section>
      ) : null}

      {view === 'footprints' ? (
        <ProfileFootprints
          pins={footprints}
          photographerName={photographer.displayName}
          isSelf={isSelf}
          className="mt-10"
        />
      ) : null}

      {view === 'collections' ? (
        <ProfileCollections
          collections={collections}
          photographerName={photographer.displayName}
          className="mt-10"
        />
      ) : null}
    </div>
  );
}
