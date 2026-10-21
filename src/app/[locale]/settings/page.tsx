import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

import { AvatarForm } from '@/components/account/AvatarForm';
import { DeleteAccountForm } from '@/components/account/DeleteAccountForm';
import { PhotobookForm } from '@/components/account/PhotobookForm';
import { SeriesForm } from '@/components/account/SeriesForm';
import { ProfileForm } from '@/components/account/ProfileForm';
import { UsernameSection } from '@/components/account/UsernameSection';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Notice } from '@/components/ui/states';
import { withLocalePrefix } from '@/i18n/locales';
import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { getOwnSettings } from '@/lib/account';
import { requireViewer } from '@/lib/auth';
import { BookCover } from '@/components/photobook/BookCover';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import { getGearFacets, getPhotobooksByOwner, getPortfolio, getSeriesByOwner } from '@/lib/data/repository';
import { SERIES_MAX_PER_MEMBER } from '@/types/domain';
import { PHOTOBOOK_LIMITS } from '@/lib/validation/photobook';
import { countryOptions } from '@/lib/geo/countries';
import { isDemoMode } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';
import { SIGN_IN_PROVIDER_NAMES, isSignInProvider } from '@/lib/sign-in-providers';

/**
 * Settings: the profile, the username, and deleting the account.
 *
 * Everything the privacy notice says a member can do for themselves is on this
 * page, and the notice says nothing this page cannot do. The two are meant to
 * be read together, and changed together.
 *
 * Every write here is also refused by the database when it should be — see
 * migration 0011 — so what this page shows or hides is a courtesy, not the
 * rule.
 */

/**
 * Rendered per request, always. This page is one member's own data, and a
 * build without database credentials would otherwise prerender its demo branch
 * as a static file — harmless today, but a static settings page is one cache
 * mistake away from serving one member's profile to another.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'account' });

  return buildMetadata({
    title: t('metaTitle'),
    description: t('metaDescription'),
    path: '/settings',
    locale,
    noIndex: true,
  });
}

const SECTION = 'border-t border-line pt-10';

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  /** `?book=<id>` opens that book in the editor; `?book=new` opens an empty one. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'account' });
  const format = await getFormatter({ locale });

  if (isDemoMode()) {
    return (
      <div className="site-container py-14 md:py-20">
        <header className="max-w-[46rem]">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-5 text-display-fluid">{t('title')}</h1>
        </header>
        <CapabilityNotice capability="auth" action={t('capabilityAction')} className="mt-8 max-w-xl" />
      </div>
    );
  }

  const viewer = await requireViewer(withLocalePrefix('/settings', locale));
  const settings = await getOwnSettings();

  if (!settings) {
    // Signed in, but the profile row is not there: mid-signup or mid-deletion.
    return (
      <div className="site-container py-14 md:py-20">
        <Notice tone="warning" title={t('missingTitle')} className="max-w-xl">
          {t('missingBody')}
        </Notice>
      </div>
    );
  }

  // The frames a cover may be: this member's own published photographs, newest
  // first, which is the same read the profile page makes.
  const [portfolio, photobooks, gear, allSeries] = await Promise.all([
    getPortfolio(viewer.id),
    getPhotobooksByOwner(viewer.id),
    getGearFacets(),
    getSeriesByOwner(viewer.id),
  ]);

  /*
   * Which book the editor is open on. `?book=<id>` names one of the shelf's
   * own; `?book=new` asks for an empty one; nothing at all shows the shelf and,
   * when it is empty, the editor for a first book — so a member with no book
   * yet lands straight in it, as they always did.
   */
  const bookParam = (await searchParams)?.book;
  const bookQuery = typeof bookParam === 'string' ? bookParam : null;
  const shelfFull = photobooks.length >= PHOTOBOOK_LIMITS.maxBooks;
  const photobook = bookQuery ? (photobooks.find((book) => book.id === bookQuery) ?? null) : null;
  const creating = (bookQuery === 'new' && !shelfFull) || (photobooks.length === 0 && !bookQuery);
  const editorOpen = photobook !== null || creating;

  // The same shape for series: `?series=<id>` edits one, `?series=new` starts
  // one, and an empty list opens the editor for the first.
  const seriesParamRaw = (await searchParams)?.series;
  const seriesQuery = typeof seriesParamRaw === 'string' ? seriesParamRaw : null;
  const seriesFull = allSeries.length >= SERIES_MAX_PER_MEMBER;
  const currentSeries = seriesQuery ? (allSeries.find((entry) => entry.id === seriesQuery) ?? null) : null;
  const creatingSeries = (seriesQuery === 'new' && !seriesFull) || (allSeries.length === 0 && !seriesQuery);
  const seriesEditorOpen = currentSeries !== null || creatingSeries;
  const coverCandidates = portfolio.map((photograph) => ({ id: photograph.id, title: photograph.title }));
  // The book is made from the same published frames, with a thumbnail to pick by.
  const bookCandidates = portfolio.map((photograph) => ({
    id: photograph.id,
    title: photograph.title,
    thumbUrl: photograph.image.thumbUrl,
  }));

  const provider = isSignInProvider(settings.createdWith)
    ? SIGN_IN_PROVIDER_NAMES[settings.createdWith]
    : null;

  return (
    <div className="site-container py-14 md:py-20">
      <header className="max-w-[46rem]">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-5 text-display-fluid">{t('title')}</h1>
        <p className="mt-6 max-w-[44ch] text-lead leading-relaxed text-muted">
          {t('description')}
        </p>
      </header>

      <div className="mt-12 max-w-2xl space-y-14">
        {settings.isSuspended ? (
          <Notice tone="warning" title={t('suspendedTitle')}>
            {t('suspendedBody')}
          </Notice>
        ) : null}

        <section aria-labelledby="settings-profile" className={SECTION}>
          <h2 id="settings-profile" className="text-title">
            {t('profile.heading')}
          </h2>
          <p className="mt-2 text-body text-muted">{t('profile.intro')}</p>

          <div className="mt-8 border-b border-line pb-8">
            <h3 className="text-caption font-bold">{t('profile.avatar')}</h3>
            <div className="mt-4">
              <AvatarForm
                name={settings.displayName}
                currentUrl={settings.avatarUrl}
                disabled={settings.isSuspended}
              />
            </div>
          </div>

          <div className="mt-8">
            <ProfileForm
              username={settings.username}
              disabled={settings.isSuspended}
              countries={countryOptions(locale)}
              coverCandidates={coverCandidates}
              initial={{
                displayName: settings.displayName,
                biography: settings.biography ?? '',
                basedIn: settings.basedIn ?? '',
                countryCode: settings.countryCode ?? '',
                website: settings.website ?? '',
                socialLinks: settings.socialLinks.join('\n'),
                styles: settings.styles,
                collaboration: settings.collaboration ?? '',
                critique: settings.critique ?? '',
                coverPhotographId: settings.coverPhotographId ?? '',
                gear: settings.usualGear.join('\n'),
              }}
            />
          </div>
        </section>

        <section aria-labelledby="settings-photobook" className={SECTION}>
          <h2 id="settings-photobook" className="text-title">
            {t('photobook.heading')}
          </h2>
          <p className="mt-2 text-body text-muted">{t('photobook.intro')}</p>

          {/* The shelf: every book, with the one the editor is open on marked. */}
          {photobooks.length > 0 ? (
            <div className="mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-body font-bold">{t('photobook.shelfHeading')}</h3>
                <p className="text-meta text-muted tabular-nums">
                  {t('photobook.shelfCount', { count: photobooks.length, max: PHOTOBOOK_LIMITS.maxBooks })}
                </p>
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
                {photobooks.map((book) => {
                  const current = photobook?.id === book.id;
                  return (
                    <li key={book.id} className={current ? 'rounded-[8px] ring-2 ring-ink ring-offset-4 ring-offset-paper' : undefined}>
                      <BookCover
                        cover={book.cover}
                        subject={{
                          title: book.title,
                          author: viewer.displayName,
                          handle: viewer.username,
                          slug: book.slug,
                          gearMode: book.gearMode,
                          gearBrand: book.gearBrand,
                          gearModel: book.gearModel,
                        }}
                        className="rounded-[3px_6px_6px_3px] shadow-popover"
                      />
                      <p className="mt-2 truncate text-caption font-bold">{book.title}</p>
                      <p className="text-meta text-muted">
                        {book.visibility === 'public' ? t('photobook.public') : t('photobook.unlisted')}
                        {' · '}
                        {book.pages.length}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button asChild size="sm" variant={current ? 'primary' : 'secondary'}>
                          <Link href={`/settings?book=${book.id}#settings-photobook`} scroll={false}>
                            {t('photobook.shelfEdit')}
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/books/${book.slug}`}>{t('photobook.open')}</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5">
                {shelfFull ? (
                  <p className="text-caption text-muted">{t('photobook.shelfFull', { max: PHOTOBOOK_LIMITS.maxBooks })}</p>
                ) : (
                  <Button asChild variant={creating ? 'primary' : 'secondary'}>
                    <Link href="/settings?book=new#settings-photobook" scroll={false}>
                      {t('photobook.shelfNew')}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {editorOpen ? (
          <div className="mt-8 border-t border-line pt-8">
            <h3 className="text-body font-bold">
              {photobook ? t('photobook.editing', { title: photobook.title }) : t('photobook.creating')}
            </h3>
            <PhotobookForm
              key={photobook?.id ?? 'new'}
              candidates={bookCandidates}
              bookId={photobook?.id ?? null}
              existingSlug={photobook?.slug ?? null}
              brands={gear.cameraBrands.map((brand) => brand.label)}
              disabled={settings.isSuspended}
              initial={{
                title: photobook?.title ?? '',
                dedication: photobook?.dedication ?? '',
                cover: photobook?.cover ?? 'linen',
                paper: photobook?.paper ?? 'lustre',
                gearMode: photobook?.gearMode ?? 'none',
                gearBrand: photobook?.gearBrand ?? settings.usualGear[0]?.split(' ')[0] ?? '',
                gearModel: photobook?.gearModel ?? '',
                visibility: photobook?.visibility ?? 'unlisted',
                pages: photobook?.pages.map((page) => page.photograph.id) ?? [],
              }}
            />
          </div>
          ) : null}
        </section>

        <section aria-labelledby="settings-series" className={SECTION}>
          <h2 id="settings-series" className="text-title">
            {t('series.heading')}
          </h2>
          <p className="mt-2 text-body text-muted">{t('series.intro')}</p>

          {allSeries.length > 0 ? (
            <div className="mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-body font-bold">{t('series.listHeading')}</h3>
                <p className="text-meta text-muted tabular-nums">
                  {t('series.listCount', { count: allSeries.length, max: SERIES_MAX_PER_MEMBER })}
                </p>
              </div>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {allSeries.map((entry) => {
                  const current = currentSeries?.id === entry.id;
                  return (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-caption font-bold">{entry.title}</p>
                        <p className="text-meta text-muted">
                          {entry.visibility === 'public' ? t('series.public') : t('series.unlisted')}
                          {' · '}
                          {entry.items.length}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Button asChild size="sm" variant={current ? 'primary' : 'secondary'}>
                          <Link href={`/settings?series=${entry.id}#settings-series`} scroll={false}>
                            {t('series.listEdit')}
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/series/${entry.slug}`}>{t('series.open')}</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5">
                {seriesFull ? (
                  <p className="text-caption text-muted">{t('series.listFull', { max: SERIES_MAX_PER_MEMBER })}</p>
                ) : (
                  <Button asChild variant={creatingSeries ? 'primary' : 'secondary'}>
                    <Link href="/settings?series=new#settings-series" scroll={false}>
                      {t('series.listNew')}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {seriesEditorOpen ? (
            <div className="mt-8 border-t border-line pt-8">
              <h3 className="text-body font-bold">
                {currentSeries ? t('series.editing', { title: currentSeries.title }) : t('series.creating')}
              </h3>
              <SeriesForm
                key={currentSeries?.id ?? 'new'}
                candidates={bookCandidates}
                seriesId={currentSeries?.id ?? null}
                existingSlug={currentSeries?.slug ?? null}
                disabled={settings.isSuspended}
                initial={{
                  title: currentSeries?.title ?? '',
                  standfirst: currentSeries?.standfirst ?? '',
                  body: currentSeries?.body ?? '',
                  cover: currentSeries?.cover?.id ?? null,
                  visibility: currentSeries?.visibility ?? 'unlisted',
                  items: currentSeries?.items.map((item) => ({ id: item.photograph.id, caption: item.caption ?? '' })) ?? [],
                }}
              />
            </div>
          ) : null}
        </section>

        <section aria-labelledby="settings-username" className={SECTION}>
          <h2 id="settings-username" className="text-title">
            {t('username.heading')}
          </h2>
          <div className="mt-4">
            <UsernameSection
              username={settings.username}
              canChange={settings.canChangeUsername}
              changedOn={
                settings.usernameChangedAt
                  ? format.dateTime(new Date(settings.usernameChangedAt), { dateStyle: 'long' })
                  : null
              }
              provider={provider}
            />
          </div>
        </section>

        <section aria-labelledby="settings-delete" className={SECTION}>
          <h2 id="settings-delete" className="text-title">
            {t('delete.heading')}
          </h2>
          <div className="mt-4">
            <DeleteAccountForm
              username={settings.username}
              retainsAccount={settings.deletionRetainsAccount}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
