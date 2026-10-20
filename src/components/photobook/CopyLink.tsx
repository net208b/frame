'use client';

import { Check, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';

/**
 * The short link, as a thing to copy rather than a thing to read.
 *
 * It is the whole reason the book exists: the address a member pastes into a
 * bio. So it is shown in full, in a box, with one button, and the button says
 * what happened. A browser that refuses the clipboard — some app web views —
 * gets the text selected instead, which is the next best thing.
 */
export function CopyLink({ url }: { url: string }) {
  const t = useTranslations('photobook');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.getElementById('photobook-short-link');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2 md:max-w-[26rem]">
      <code
        id="photobook-short-link"
        className="min-w-0 flex-1 truncate rounded-field border border-line bg-surface px-3 py-2 text-meta text-ink-soft"
      >
        {url.replace(/^https?:\/\//, '')}
      </code>
      <Button type="button" variant="secondary" onClick={() => void copy()} iconLeft={copied ? <Check aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}>
        {copied ? t('copied') : t('copy')}
      </Button>
    </div>
  );
}
