import { ArrowUpRight, BookOpen, Pencil } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { BookCover } from '@/components/photobook/BookCover';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { cn, formatCount } from '@/lib/utils';
import type { Photobook } from '@/types/domain';

/**
 * The member's shelf: every book they bound, standing in the order they put
 * them, each drawn with its real cover. One click opens it; the 3D book itself
 * lives on its own page, so WebGL never loads here.
 *
 * WHO SEES WHAT is decided by the page, not here: a visitor is handed the
 * public books only, the owner is handed all of them and sees "link only" on
 * the ones a visitor would not — the same split the single-book tab made.
 */
export async function ProfileShelf({
  books,
  isSelf,
  className,
}: {
  books: readonly Photobook[];
  isSelf: boolean;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'photobook' });
  const hasUnlisted = isSelf && books.some((book) => book.visibility === 'unlisted');

  return (
    <section className={cn(className)}>
      <SectionHead
        eyebrow={t('shelf.eyebrow')}
        title={t('shelf.title')}
        description={hasUnlisted ? t('shelf.unlistedNote') : undefined}
        action={
          <p className="text-meta text-muted tabular-nums">
            {t('shelf.count', { count: formatCount(books.length, locale) })}
          </p>
        }
      />

      {/* The ledge: one rule the whole row of books stands on. */}
      <ul className="grid grid-cols-2 gap-x-5 gap-y-9 border-b-[6px] border-line-strong pb-6 sm:grid-cols-3 lg:grid-cols-4">
        {books.map((book) => (
          <li key={book.id} className="flex flex-col">
            <Link
              href={`/books/${book.slug}`}
              className="group relative block overflow-hidden rounded-[3px_7px_7px_3px] shadow-popover transition-transform duration-150 hover:-translate-y-1.5"
              aria-label={book.title}
            >
              <BookCover
                cover={book.cover}
                subject={{
                  title: book.title,
                  author: book.owner.displayName,
                  handle: book.owner.username,
                  slug: book.slug,
                  gearMode: book.gearMode,
                  gearBrand: book.gearBrand,
                  gearModel: book.gearModel,
                }}
              />
              {/* The spine's shadow, so a cover reads as a bound board. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-2"
                style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.28), rgba(0,0,0,0))' }}
              />
            </Link>

            <div className="mt-3 min-w-0">
              <p className="truncate text-caption font-bold text-ink">{book.title}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-meta text-muted tabular-nums">
                <span>{t('pageCount', { count: book.pages.length })}</span>
                {book.opens > 0 ? <span>· {t('opens', { count: formatCount(book.opens, locale) })}</span> : null}
                {isSelf && book.visibility === 'unlisted' ? (
                  <span className="rounded-pill border border-line px-1.5 text-[10px] font-semibold uppercase tracking-wide">
                    {t('shelf.unlisted')}
                  </span>
                ) : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/books/${book.slug}`}>
                    <BookOpen aria-hidden className="size-3.5" />
                    {t('shelf.open')}
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </Link>
                </Button>
                {isSelf ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/settings?book=${book.id}#settings-photobook`}>
                      <Pencil aria-hidden className="size-3.5" />
                      {t('shelf.edit')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
