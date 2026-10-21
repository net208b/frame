import { ArrowUpRight, BookOpen, Link2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { BookViewer } from '@/components/photobook/BookViewer';
import { coverPreset, gearText, PHOTOBOOK_COVER_PRESETS } from '@/components/photobook/covers';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { Link } from '@/i18n/navigation';
import { cn, formatCount } from '@/lib/utils';
import { PHOTOBOOK_MAX_PAGES, PHOTOBOOK_MIN_PAGES, type Photobook } from '@/types/domain';

/**
 * The public case for photobooks: what one is, what they look like, and one
 * real book open on the page.
 *
 * THIS PAGE HAS TO SURVIVE HAVING NOTHING TO SHOW. On the day it ships there
 * may be no public book at all, and a showcase that assumes otherwise is an
 * empty room with the lights on — which tells a visitor the place is deserted.
 * So it is built in three states, and which one a reader gets is decided by the
 * shelf, not by a flag:
 *
 *   no books      the covers, how it works, and an invitation to bind the first
 *   one book      that book, open, as the lead
 *   several       the same, with the rest of the shelf under it
 *
 * NOTHING HERE STANDS IN FOR A MEMBER'S WORK. When there is no book, the page
 * says so and shows the covers — which are FRAME's own drawings and need no
 * photographs — rather than dressing a sample up as somebody's portfolio.
 *
 * WebGL is loaded only by `BookViewer`, only in the states that have a real
 * book, and only on this view: a reader who came for the photographers list
 * pays nothing for it.
 */

/** Enough to fill a shelf without turning the page into a catalogue. */
export const SHELF_LIMIT = 12;

export async function PhotobookShowcase({ books }: { books: readonly Photobook[] }) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'photobook' });
  const lead = books[0] ?? null;
  const rest = books.slice(1);

  return (
    <div className="mt-10 space-y-20">
      {/* ----------------------------------------------------------- lead */}
      <section>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
          <div>
            <p className="text-eyebrow text-muted uppercase">{t('showcase.eyebrow')}</p>
            <h2 className="mt-4 text-display-fluid">
              {t.rich('showcase.heading', {
                break: () => <br />,
                accent: (chunks) => <span className="font-serif font-normal italic">{chunks}</span>,
              })}
            </h2>
            <p className="mt-6 max-w-[52ch] text-lead leading-relaxed text-ink-soft">
              {t('showcase.lead', { min: PHOTOBOOK_MIN_PAGES, max: PHOTOBOOK_MAX_PAGES })}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href="/settings">{t('showcase.makeYours')}</Link>
              </Button>
              {lead ? (
                <Button asChild variant="secondary">
                  <Link href={`/books/${lead.slug}`}>
                    <BookOpen aria-hidden className="size-4" />
                    {t('showcase.openLead')}
                  </Link>
                </Button>
              ) : null}
            </div>

            <p className="mt-5 text-meta text-muted">
              {t('showcase.terms', { min: PHOTOBOOK_MIN_PAGES })}
            </p>
          </div>

          {lead ? (
            /* The real book, open on the page. Its own address is one click
               away; this is the thing the whole feature is for. */
            <div>
              <BookViewer book={lead} tableColor="#15170f" />
              <p className="mt-3 text-meta text-muted">
                {t('showcase.leadCaption', {
                  title: lead.title,
                  name: lead.owner.displayName,
                })}
              </p>
            </div>
          ) : (
            /* No book to open yet, so the covers stand in: they are FRAME's
               own drawings and need no photographs, which makes them the one
               honest thing to show on a page with nothing bound yet. */
            <div>
              <CoverWall />
              <p className="mt-3 text-meta text-muted">
                {t('showcase.coversCaption', { count: PHOTOBOOK_COVER_PRESETS.length })}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- shelf */}
      <section>
        <SectionHead
          eyebrow={t('showcase.shelfEyebrow')}
          title={books.length > 0 ? t('showcase.shelfTitle') : t('showcase.shelfEmptyTitle')}
          description={books.length > 0 ? t('showcase.shelfDescription') : undefined}
        />

        {books.length === 0 ? (
          <EmptyState
            title={t('showcase.emptyTitle')}
            description={t('showcase.emptyDescription', { min: PHOTOBOOK_MIN_PAGES })}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/upload">{t('showcase.emptyUpload')}</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/discover">{t('showcase.emptyDiscover')}</Link>
                </Button>
              </div>
            }
          />
        ) : rest.length > 0 ? (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {rest.map((book) => (
              <li key={book.id}>
                <ShelfBook book={book} locale={locale} />
              </li>
            ))}
          </ul>
        ) : (
          /* One public book: the lead above IS the shelf, so saying so beats
             repeating it in a grid of one. */
          <p className="max-w-[56ch] text-body leading-relaxed text-ink-soft">
            {t('showcase.shelfOnlyOne')}
          </p>
        )}
      </section>

      {/* --------------------------------------------------------- covers */}
      {lead ? (
        <section>
          <SectionHead
            eyebrow={t('showcase.coversEyebrow')}
            title={t('showcase.coversTitle', { count: PHOTOBOOK_COVER_PRESETS.length })}
            description={t('showcase.coversDescription')}
          />
          <CoverWall />
        </section>
      ) : null}

      {/* ---------------------------------------------------------- steps */}
      <section>
        <SectionHead eyebrow={t('showcase.howEyebrow')} title={t('showcase.howTitle')} />
        <ol className="grid gap-8 md:grid-cols-3 md:gap-10">
          {(['upload', 'choose', 'share'] as const).map((step, index) => (
            <li key={step} className="border-t-2 border-ink pt-4">
              <p className="font-serif text-section leading-none text-muted-soft">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 text-body font-bold">{t(`showcase.steps.${step}.title`)}</h3>
              <p className="mt-2 text-body leading-relaxed text-muted">
                {t(`showcase.steps.${step}.body`, {
                  min: PHOTOBOOK_MIN_PAGES,
                  max: PHOTOBOOK_MAX_PAGES,
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------- the link */}
      <section className="rounded-panel bg-ink-surface px-6 py-12 text-on-ink sm:px-10 lg:px-14">
        <div className="mx-auto max-w-[62ch] text-center">
          <p className="text-eyebrow uppercase opacity-70">{t('showcase.linkEyebrow')}</p>
          <h2 className="mt-4 font-serif text-display font-normal leading-tight">
            {t('showcase.linkTitle')}
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-lead leading-relaxed opacity-80">
            {t('showcase.linkBody')}
          </p>

          <ul className="mx-auto mt-8 grid max-w-[46ch] gap-2 text-left text-body opacity-85">
            {(['noAccount', 'counts', 'everywhere', 'rights'] as const).map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <Link2 aria-hidden className="mt-1 size-4 shrink-0 opacity-70" />
                <span>{t(`showcase.linkPoints.${point}`)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent">
              <Link href="/settings">
                {t('showcase.makeYours')}
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The fifteen covers as the colours and type they are actually drawn with.
 *
 * Facsimiles, not the real canvases: `drawCoverFace` needs a DOM, and fifteen
 * canvases would be fifteen reasons for this page to need JavaScript. The chip
 * and ink of each preset are plain data, so the swatch is honest about the
 * palette without pretending to be the finished cover.
 */
async function CoverWall() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {PHOTOBOOK_COVER_PRESETS.map((preset) => (
        <li key={preset.id}>
          <div
            className="flex aspect-[5/7] flex-col justify-end rounded-[4px] p-2.5 shadow-popover"
            style={{ background: preset.chip, color: preset.ink }}
          >
            <p className="text-[10px] leading-tight font-bold">
              {t(`photobookCovers.${preset.id}`)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One book on the shelf: its cover, who bound it, and how it has been read. */
async function ShelfBook({ book, locale }: { book: Photobook; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'photobook' });
  const preset = coverPreset(book.cover);
  const gear = gearText({
    title: book.title,
    author: book.owner.displayName,
    handle: book.owner.username,
    slug: book.slug,
    gearMode: book.gearMode,
    gearBrand: book.gearBrand,
    gearModel: book.gearModel,
  });
  const first = book.pages[0];

  return (
    <article>
      <Link
        href={`/books/${book.slug}`}
        className={cn(
          'group relative block aspect-[5/7] overflow-hidden rounded-[3px_7px_7px_3px]',
          'shadow-popover transition-transform duration-150 hover:-translate-y-1',
        )}
        style={{ background: preset.chip, color: preset.ink }}
      >
        {/* The book's first frame, bled under its cover colour — a cover with a
            picture reads as a book rather than as a swatch. */}
        {first ? (
          <Image
            src={first.photograph.image.gridUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 260px"
            className="object-cover opacity-90 transition-opacity duration-150 group-hover:opacity-100"
          />
        ) : null}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.05), ${preset.chip} 86%)` }}
        />
        {/* The spine's shadow, so the cover sits like a bound board. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-2"
          style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.28), rgba(0,0,0,0))' }}
        />
        <div className="relative flex h-full flex-col justify-end p-3.5">
          <p className="text-caption leading-tight font-bold text-balance">{book.title}</p>
          <p className="mt-1.5 text-meta opacity-80">{book.owner.displayName}</p>
          {gear ? <p className="mt-1 text-[10px] opacity-60">{t('shotOn', { gear })}</p> : null}
        </div>
      </Link>

      <p className="mt-2.5 flex flex-wrap justify-between gap-x-3 text-meta text-muted tabular-nums">
        <span>{t('pageCount', { count: book.pages.length })}</span>
        {book.opens > 0 ? <span>{t('opens', { count: formatCount(book.opens, locale) })}</span> : null}
      </p>
    </article>
  );
}
