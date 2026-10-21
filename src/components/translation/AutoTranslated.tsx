'use client';

import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useId, useState, type ReactNode } from 'react';

import {
  sourceLanguageFor,
  translationApplies,
} from '@/lib/translation/applies';
import { cn } from '@/lib/utils';
import type { ContentTranslation } from '@/types/domain';

/**
 * Showing member-written text in the reader's language (migration 0035).
 *
 * THE ORIGINAL IS NEVER REPLACED, only covered. A machine translation is a
 * reading aid, not a correction, and a photographer's own title is the thing
 * they actually chose. So every translated block says that it was translated
 * and offers the words as written, one click away, in both directions.
 *
 * WHY A BLOCK AND NOT A FIELD. A photograph's title and description were
 * written by one person at one moment in one language, and reading half of
 * that pair in Thai and half in English would be worse than either. So the
 * toggle belongs to the block: `TranslationBlock` holds the state, every
 * `Translated` inside it follows, and the one note sits at the bottom.
 *
 * NOTHING IS SHOWN WHEN NOTHING WAS TRANSLATED. A block whose text is already
 * in the reader's language — which is every block for the author's own
 * readers — renders exactly what it rendered before this existed: the text,
 * with no badge, no control and no hint that a machine was ever involved.
 */

interface BlockState {
  /** True while the reader has asked to see the words as written. */
  showOriginal: boolean;
  /** The reader's language, so a child can tell whether its text needs covering. */
  locale: string;
}

const Block = createContext<BlockState>({ showOriginal: true, locale: 'en' });

export function TranslationBlock({
  locale,
  /** True when at least one child has a translation to show — `anyTranslation`. */
  available,
  children,
  className,
  noteClassName,
}: {
  locale: string;
  available: boolean;
  children: ReactNode;
  className?: string;
  noteClassName?: string;
}) {
  const t = useTranslations('translation');
  const [showOriginal, setShowOriginal] = useState(false);
  const id = useId();

  if (!available) return <>{children}</>;

  return (
    <div className={className}>
      <Block.Provider value={{ showOriginal, locale }}>
        <div id={id}>{children}</div>
      </Block.Provider>

      <p
        className={cn(
          'mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted',
          noteClassName,
        )}
      >
        <Languages aria-hidden className="size-3.5 shrink-0" />
        <span>
          {showOriginal
            ? t('writtenIn', { language: t(`language.${sourceLanguageFor(locale)}`) })
            : t('auto')}
        </span>
        <span aria-hidden>·</span>
        <button
          type="button"
          aria-controls={id}
          onClick={() => setShowOriginal((showing) => !showing)}
          className="rounded-sm underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {showOriginal ? t('showTranslation') : t('showOriginal')}
        </button>
      </p>
    </div>
  );
}

/**
 * One field inside a `TranslationBlock`. Outside one it simply renders the
 * original, which is what makes it safe to drop into a component that is not
 * always in a translated context.
 */
/** Blank-line-separated blocks, the way a biography is written. */
function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function Translated({
  original,
  translation,
  as: Tag = 'span',
  className,
  /**
   * Render the text as blank-line-separated paragraphs rather than one run.
   * A biography is written in blocks and a translation of it comes back in
   * blocks, so both have to be rendered the same way or the toggle would
   * reflow the page.
   */
  paragraphs = false,
  paragraphClassName,
}: {
  original: string;
  translation: ContentTranslation | undefined;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'div';
  className?: string;
  paragraphs?: boolean;
  paragraphClassName?: string;
}) {
  const { showOriginal, locale } = useContext(Block);
  const show = !showOriginal && translationApplies(translation, locale) ? translation.value : original;

  // `lang` so a screen reader pronounces a translated sentence in the language
  // it is actually in, and so the browser offers the right hyphenation.
  const lang = !showOriginal && translationApplies(translation, locale) ? translation.language : undefined;

  if (paragraphs) {
    return (
      <div className={className} lang={lang}>
        {paragraphsOf(show).map((block) => (
          <p key={block} className={paragraphClassName}>
            {block}
          </p>
        ))}
      </div>
    );
  }

  return (
    <Tag className={className} lang={lang}>
      {show}
    </Tag>
  );
}
