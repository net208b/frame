import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo';

/**
 * The 404.
 *
 * Useful rather than apologetic: on a platform where members remove their own
 * work and moderators remove other people's, a missing page usually has a
 * reason, and naming the likely ones saves somebody wondering whether the site
 * is broken. The routes out are the three that always have something on them.
 *
 * Next renders this file without route params, so the language of the page the
 * reader asked for is not knowable here — `DEFAULT_LOCALE` only satisfies the
 * metadata builder, and nothing it produces is published, because the
 * canonical and the alternates are both dropped below. The body is unaffected:
 * it renders inside the locale layout, which has already declared the active
 * locale, so the copy and the links are both in the reader's language. The
 * metadata stays English for the same reason the canonical is dropped — it
 * describes an address that does not exist and is never indexed.
 */
export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Page not found',
    description: 'There is nothing at this address on FRAME.',
    path: '/',
    locale: DEFAULT_LOCALE,
    noIndex: true,
  }),
  // The requested address is not knowable here, and the layout would otherwise
  // have this page advertise the homepage as its canonical URL — in one
  // language, with an hreflang set, for an address that does not exist.
  // Replacing the whole `alternates` object drops the languages with it.
  alternates: { canonical: null },
};

const REASON_KEYS = ['mistyped', 'removed', 'pending', 'private'] as const;

export default async function NotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="site-container py-16 lg:py-24">
      <div className="max-w-2xl">
        <Eyebrow>{t('notFound.eyebrow')}</Eyebrow>

        <h1 className="mt-4 text-display-fluid">
          {/*
            The serif accent word is a Latin typographic device: Instrument
            Serif has no Thai glyphs, and a synthesised italic on stacked Thai
            vowel marks is worse than no emphasis at all. The English message
            therefore carries the `<em>` and the Thai message does not — an
            unused tag handler is simply not called, so the same code renders
            both.
          */}
          {t.rich('notFound.title', {
            em: (chunks) => <em className="font-serif font-normal italic">{chunks}</em>,
          })}
        </h1>

        <p className="mt-6 text-lead leading-relaxed text-muted">{t('notFound.lead')}</p>

        <ul className="mt-5 space-y-2.5 border-t border-line pt-5">
          {REASON_KEYS.map((key) => (
            <li key={key} className="flex gap-3 text-caption leading-relaxed text-ink-soft">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-pill bg-muted-soft" />
              {t(`notFound.reasons.${key}`)}
            </li>
          ))}
        </ul>

        <div className="mt-9 flex flex-wrap items-center gap-2.5">
          <Button asChild size="lg">
            <Link href="/discover">{t('notFound.browse')}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/map">{t('notFound.openMap')}</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">{t('notFound.home')}</Link>
          </Button>
        </div>

        <p className="mt-8 text-caption text-muted">
          {t.rich('notFound.searchHint', {
            link: (chunks) => (
              <Link
                href="/search"
                className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
