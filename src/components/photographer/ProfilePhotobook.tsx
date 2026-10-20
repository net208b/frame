import { ArrowUpRight, BookOpen } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { coverPreset, gearText } from '@/components/photobook/covers';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { cn, formatCount } from '@/lib/utils';
import type { Photobook } from '@/types/domain';

/**
 * The book on a profile: the cover's colours, the title, the first few pages,
 * and one button that opens it. The 3D book itself lives on its own page —
 * loading WebGL into a profile because a tab was visible would be the wrong
 * trade for everyone who came to see the frames.
 */
export async function ProfilePhotobook({
  book,
  isSelf,
  className,
}: {
  book: Photobook;
  isSelf: boolean;
  className?: string;
}) {
  const locale = await getLocale();
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

  return (
    <section className={cn(className)}>
      <SectionHead
        eyebrow={t('profile.eyebrow')}
        title={book.title}
        description={
          book.visibility === 'unlisted' && isSelf ? t('profile.unlistedNote') : undefined
        }
        action={
          <p className="text-meta text-muted tabular-nums">
            {t('pageCount', { count: book.pages.length })}
            {book.opens > 0 ? ` · ${t('opens', { count: formatCount(book.opens, locale) })}` : ''}
          </p>
        }
      />

      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
        {/* The cover, as the colours and type the real one is drawn with. */}
        <Link
          href={`/books/${book.slug}`}
          className="group block aspect-[5/7] overflow-hidden rounded-[6px] shadow-popover"
          style={{ background: preset.chip, color: preset.ink }}
        >
          <div className="flex h-full flex-col justify-end p-5">
            <p className="text-title font-bold leading-tight text-balance">{book.title}</p>
            <p className="mt-2 text-meta opacity-80">{book.owner.displayName}</p>
            {gear ? <p className="mt-1 text-[11px] opacity-60">{t('shotOn', { gear })}</p> : null}
          </div>
        </Link>

        <div className="min-w-0 space-y-5">
          {book.dedication ? (
            <p className="max-w-[48ch] font-serif text-lead italic leading-relaxed text-ink-soft">{book.dedication}</p>
          ) : null}

          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {book.pages.slice(0, 6).map((page) => (
              <li key={page.photograph.id} className="relative aspect-square overflow-hidden rounded-[4px] bg-surface-sunken">
                <Image src={page.photograph.image.thumbUrl} alt="" fill sizes="96px" className="object-cover" />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={`/books/${book.slug}`}>
                <BookOpen aria-hidden className="size-4" />
                {t('profile.open')}
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </Button>
            {isSelf ? (
              <Button asChild variant="secondary">
                <Link href="/settings">{t('profile.edit')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
