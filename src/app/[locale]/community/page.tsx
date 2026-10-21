import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import {
  CommunityTabs,
  readCommunityView,
  type CommunityView,
} from '@/components/community/CommunityTabs';
import { ChallengesOverview } from '@/components/challenges/ChallengesOverview';
import { FeaturesOverview } from '@/components/features/FeaturesOverview';
import { PhotobookShowcase, SHELF_LIMIT } from '@/components/community/PhotobookShowcase';
import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Button } from '@/components/ui/Button';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { LOCATION_POLICY } from '@/lib/config';
import {
  getChallenges,
  getFeaturedPhotographers,
  getFeatures,
  getPlatformStats,
  getPublicPhotobooks,
} from '@/lib/data/repository';
import { buildMetadata } from '@/lib/seo';
import { formatCount } from '@/lib/utils';
import type { PlatformStats } from '@/types/domain';

interface CommunityPageProps {
  params: LocaleParams;
  searchParams: Promise<{ view?: string | string[] }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: CommunityPageProps): Promise<Metadata> {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  const view = readCommunityView(resolved.view);
  const t = await getTranslations({ locale, namespace: 'community' });
  const books = view === 'photobooks';
  const challenges = view === 'challenges';
  const features = view === 'features';

  // Each view gets its own title and its own canonical address, because each
  // one is a different page to anybody arriving from a search or a share.
  return buildMetadata({
    title: books
      ? t('views.photobooksMetaTitle')
      : challenges
        ? t('views.challengesMetaTitle')
        : features
          ? t('views.featuresMetaTitle')
          : t('metaTitle'),
    description: books
      ? t('views.photobooksMetaDescription')
      : challenges
        ? t('views.challengesMetaDescription')
        : features
          ? t('views.featuresMetaDescription')
          : t('metaDescription'),
    path: books
      ? '/community?view=photobooks'
      : challenges
        ? '/community?view=challenges'
        : features
          ? '/community?view=features'
          : '/community',
    locale,
  });
}

/** A larger set than the home page shows, because this is the page about people. */
const FEATURED_LIMIT = 12;

/**
 * Metres in one degree of latitude, the figure `precisionLabel` in
 * `lib/geo.ts` divides down to describe a coordinate's precision.
 *
 * It is repeated here because that function returns a finished English phrase
 * ("about 11 m"), which cannot be shown to a Thai reader. The arithmetic is the
 * same; only the sentence around it is translated. If `precisionLabel` is ever
 * made locale-aware, this constant and {@link precisionPhrase} go with it.
 */
const METRES_PER_DEGREE = 111_320;

async function StatsBand({ stats, locale }: { stats: PlatformStats; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'community' });

  const figures = [
    { id: 'photographs', label: t('stats.photographs'), value: stats.photographs },
    { id: 'locations', label: t('stats.locations'), value: stats.locations },
    { id: 'countries', label: t('stats.countries'), value: stats.countries },
    { id: 'photographers', label: t('stats.photographers'), value: stats.photographers },
  ];

  return (
    <section className="mt-14">
      <h2>
        <Eyebrow>{t('stats.eyebrow')}</Eyebrow>
      </h2>

      <dl className="mt-4 grid grid-cols-2 border-t border-line sm:grid-cols-4 sm:divide-x sm:divide-line">
        {figures.map((figure) => (
          <div key={figure.id} className="border-b border-line py-5 sm:px-6 sm:first:pl-0">
            <dt className="text-eyebrow text-muted-soft uppercase">{figure.label}</dt>
            <dd className="mt-2 text-section font-bold tabular-nums">
              {formatCount(figure.value, locale)}
              {/* The figure and the fact that it is a sample travel together,
                  so a number can never be read as a real community total. */}
              {stats.isDemoData ? (
                <span className="mt-1 block text-meta font-normal tracking-normal text-muted">
                  {t('stats.sampleFigure')}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {stats.isDemoData ? (
        <p className="mt-3 max-w-[62ch] text-meta text-muted">{t('stats.sampleNote')}</p>
      ) : null}
    </section>
  );
}

export default async function CommunityPage({ params, searchParams }: CommunityPageProps) {
  const [{ locale }, resolved] = await Promise.all([readLocaleParams(params), searchParams]);
  setRequestLocale(locale);
  const view: CommunityView = readCommunityView(resolved.view);

  const t = await getTranslations({ locale, namespace: 'community' });

  // The shelf is only read for the view that shows it; the photographers view
  // pays nothing for a feature it does not display.
  const [featured, stats, books, challenges, editorial] = await Promise.all([
    getFeaturedPhotographers(FEATURED_LIMIT),
    getPlatformStats(),
    view === 'photobooks' ? getPublicPhotobooks(SHELF_LIMIT) : Promise.resolve([]),
    view === 'challenges' ? getChallenges() : Promise.resolve([]),
    view === 'features' ? getFeatures() : Promise.resolve([]),
  ]);

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <header className="max-w-[46ch]">
        <Eyebrow>{t('eyebrow')}</Eyebrow>

        {/*
          One message, line break and accent word included, so each language
          decides where its own heading turns. The serif italic accent is a
          Latin typographic device — Instrument Serif has no Thai glyphs and
          synthesised italic Thai is unreadable — so the Thai message simply
          does not use the `accent` tag, and the handler goes unused there.
        */}
        <h1 className="mt-4 text-display-fluid">
          {t.rich('heading', {
            break: () => <br />,
            accent: (chunks) => (
              <span className="font-serif font-normal italic">{chunks}</span>
            ),
          })}
        </h1>

        <p className="mt-7 max-w-[58ch] text-lead leading-relaxed text-ink-soft">{t('lead')}</p>
      </header>

      <StatsBand stats={stats} locale={locale} />

      <CommunityTabs active={view} className="mt-14" />

      {view === 'photobooks' ? (
        <PhotobookShowcase books={books} />
      ) : view === 'challenges' ? (
        <ChallengesOverview challenges={challenges} locale={locale} />
      ) : view === 'features' ? (
        <FeaturesOverview features={editorial} locale={locale} />
      ) : (
        <PhotographersView featured={featured} locale={locale} />
      )}
    </div>
  );
}

/**
 * The photographers view: who is here, what an appreciation means, and how a
 * place gets reviewed. This is what `/community` has always been, lifted into
 * its own component when the page gained a second view.
 */
async function PhotographersView({
  featured,
  locale,
}: {
  featured: Awaited<ReturnType<typeof getFeaturedPhotographers>>;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: 'community' });

  /**
   * "about 11 m" / "ประมาณ 11 เมตร" — the unit is chosen here because it
   * changes with the policy constant, and the number goes through `Intl` with
   * the active locale rather than being written into the sentence.
   */
  function precisionPhrase(decimals: number): string {
    const metres = METRES_PER_DEGREE / 10 ** decimals;
    return metres >= 1000
      ? t('review.precisionKilometres', { value: Math.round(metres / 100) / 10 })
      : t('review.precisionMetres', { value: Math.round(metres) });
  }

  const publicPrecision = precisionPhrase(LOCATION_POLICY.publicCoordinateDecimals);
  const reducedPrecision = precisionPhrase(LOCATION_POLICY.reducedCoordinateDecimals);

  return (
    <>
      <section className="mt-16">
        <SectionHead
          eyebrow={t('featured.eyebrow')}
          title={t('featured.title')}
          description={t('featured.description')}
        />

        {featured.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((photographer) => (
              <li key={photographer.id}>
                <PhotographerCard photographer={photographer} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t('featured.emptyTitle')}
            description={t('featured.emptyDescription')}
          />
        )}
      </section>

      <div className="mt-20 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <section>
          <h2 className="text-section font-bold">{t('appreciation.title')}</h2>

          {/*
            The promise the product makes about appreciations: one per member,
            reversible, not for sale, and no amount of it changes moderation.
            Each paragraph is one message in both languages — the Thai says all
            four things outright rather than summarising them, because a reader
            who cannot check the English is the reader this page is for.
          */}
          <div className="mt-5 max-w-[58ch] space-y-4 text-body leading-relaxed text-ink-soft">
            <p>{t('appreciation.once')}</p>
            <p>{t('appreciation.notForSale')}</p>
            <p>
              {t.rich('appreciation.trending', {
                discover: (chunks) => (
                  <Link
                    href="/discover"
                    className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-ink"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-section font-bold">{t('review.title')}</h2>

          <ol className="mt-5 max-w-[58ch] space-y-5 text-body leading-relaxed text-ink-soft">
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">{t('review.proposeTitle')}</strong>{' '}
              {t('review.proposeBody', { maxPerDay: LOCATION_POLICY.maxSubmissionsPerDay })}
            </li>
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">{t('review.checksTitle')}</strong>{' '}
              {t('review.checksBody')}
            </li>
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">{t('review.decideTitle')}</strong>{' '}
              {t('review.decideBody')}
            </li>
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">{t('review.publishTitle')}</strong>{' '}
              {t('review.publishBody', { publicPrecision, reducedPrecision })}
            </li>
          </ol>

          <p className="mt-6 max-w-[58ch] text-caption text-muted">
            {t.rich('review.guidelines', {
              guidelines: (chunks) => (
                <Link
                  href="/legal/guidelines"
                  className="font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>
      </div>

      <section className="on-ink mt-20 rounded-panel bg-ink-surface px-7 py-12 md:px-14 md:py-16">
        <div className="max-w-[46ch]">
          <Eyebrow onInk>{t('join.eyebrow')}</Eyebrow>

          <h2 className="mt-4 text-section-fluid font-bold text-on-ink">{t('join.title')}</h2>

          <p className="mt-5 text-body leading-relaxed text-on-ink-muted">{t('join.body')}</p>

          <div className="mt-8">
            <Button asChild variant="accent" size="lg">
              <Link href="/join">{t('join.cta')}</Link>
            </Button>
          </div>

          <p className="mt-5 text-caption text-on-ink-muted">
            {t.rich('join.signIn', {
              signin: (chunks) => (
                <Link
                  href="/login"
                  className="font-semibold text-on-ink underline decoration-line-inverse underline-offset-4 transition-colors duration-150 hover:decoration-accent"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>

        {/* Says plainly that sign-up cannot work here, rather than letting the
            button above look like a working one. Renders nothing when auth is
            configured. The action is translated because the notice reads
            "{action} is unavailable…" / "{action}ไม่พร้อมใช้งาน…". */}
        <CapabilityNotice
          capability="auth"
          action={t('join.capabilityAction')}
          className="mt-8 max-w-[62ch]"
        />
      </section>
    </>
  );
}
