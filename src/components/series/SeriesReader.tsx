import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import { aspectRatio } from '@/lib/images/variants';
import { cn } from '@/lib/utils';
import type { PhotoSeries, PhotoSeriesItem } from '@/types/domain';

/**
 * A series, read on the page: the cover, then paragraphs and frames taking
 * turns in the order the member set.
 *
 * THE RHYTHM. The body is split into paragraphs on blank lines. Frame one
 * follows paragraph one, frame two follows paragraph two, and so on; frames
 * left over when the words run out come at the end, words left over when the
 * frames run out come at the end too. A series with no words is a sequence of
 * frames with captions, which is also a fine thing to publish.
 *
 * THE TEXT IS PLAIN. Paragraphs are rendered as paragraphs and nothing else —
 * no markup is read from the body, so nothing a member types can become a
 * script or a link. Measure stays near 65 characters, which is where running
 * text reads best.
 *
 * Pictures are the 800px grid derivative inside the column and the 2560px
 * display derivative when a frame runs full width — never the original.
 */
export async function SeriesReader({ series, className }: { series: PhotoSeries; className?: string }) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'series' });

  const paragraphs = series.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  // Interleave: paragraph i, then frame i.
  const blocks: Array<{ kind: 'text'; text: string } | { kind: 'frame'; item: PhotoSeriesItem }> = [];
  const length = Math.max(paragraphs.length, series.items.length);
  for (let i = 0; i < length; i += 1) {
    const paragraph = paragraphs[i];
    if (paragraph) blocks.push({ kind: 'text', text: paragraph });
    const item = series.items[i];
    if (item) blocks.push({ kind: 'frame', item });
  }

  return (
    <article className={cn('mx-auto max-w-[72rem]', className)}>
      <div className="mx-auto max-w-[68ch] space-y-10">
        {blocks.map((block, index) =>
          block.kind === 'text' ? (
            <p key={`p-${index}`} className="text-lead leading-relaxed text-ink-soft">
              {block.text}
            </p>
          ) : (
            <Frame key={`f-${block.item.position}`} item={block.item} priority={index < 2} />
          ),
        )}
      </div>

      <footer className="mx-auto mt-16 max-w-[68ch] border-t border-line pt-6">
        <p className="text-meta leading-relaxed text-muted">{t('colophon', { name: series.owner.displayName })}</p>
        <p className="mt-2 text-meta">
          <Link href={`/photographers/${series.owner.username}`} className="font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink">
            {t('byline', { name: series.owner.displayName })}
          </Link>
        </p>
      </footer>
    </article>
  );
}

/**
 * One frame in the run of text. A wide frame breaks out of the measure to the
 * article's full width; a tall one stays inside it, so neither is tiny and
 * neither is a wall.
 */
function Frame({ item, priority }: { item: PhotoSeriesItem; priority: boolean }) {
  const { photograph, caption } = item;
  const ratio = aspectRatio(photograph.image);
  const wide = ratio >= 1.25;

  return (
    <figure className={cn(wide && 'lg:-mx-[14rem]')}>
      <Link
        href={`/photographs/${photograph.slug}`}
        className="relative block overflow-hidden rounded-[6px] bg-surface-sunken"
        style={{ aspectRatio: `${photograph.image.width} / ${photograph.image.height}` }}
      >
        <Image
          src={wide ? photograph.image.displayUrl : photograph.image.gridUrl}
          alt={photograph.altText}
          fill
          sizes={wide ? '(max-width: 1024px) 100vw, 1150px' : '(max-width: 768px) 100vw, 680px'}
          className="object-cover"
          priority={priority}
        />
      </Link>
      {caption ? (
        <figcaption className="mx-auto mt-3 max-w-[68ch] text-meta leading-relaxed text-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
