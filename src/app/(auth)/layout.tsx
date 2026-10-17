import Link from 'next/link';
import type { ReactNode } from 'react';

import { BrandMark, BrandWordmark } from '@/components/layout/Brand';
import { Eyebrow } from '@/components/ui/SectionHead';

/**
 * The chrome the five account pages share.
 *
 * One column, one measure, nothing competing with the form. The brand sits at
 * the top as a way back out, and a short typographic panel closes the page.
 *
 * There is deliberately no photograph here. The only images this build can
 * reach are the bundled demo frames, and putting one behind a sign-in form
 * would credit a photographer for a page they had nothing to do with — the
 * same misrepresentation the demo notice exists to prevent. A quiet panel says
 * what FRAME is without borrowing anyone's work to do it.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-container py-12 lg:py-20">
      <div className="mx-auto w-full max-w-[33rem]">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-ink transition-opacity hover:opacity-70"
        >
          <BrandMark className="size-7" />
          <BrandWordmark />
          <span className="sr-only">— back to the home page</span>
        </Link>

        <div className="mt-10">{children}</div>

        <aside className="on-ink mt-14 rounded-panel bg-ink-surface px-7 py-8 text-on-ink">
          <Eyebrow onInk>Why an account</Eyebrow>
          <p className="mt-3 text-title font-bold">
            Every frame here carries the name of the person who{' '}
            <span className="font-serif font-normal italic">made it</span>.
          </p>
          <p className="mt-3 text-caption leading-relaxed text-on-ink-muted">
            Reading FRAME needs no account: the gallery, the places and the profiles are open to
            everybody. An account is what lets you publish work under your own name, appreciate
            somebody else&rsquo;s, and decide for each photograph how precisely its location is
            shown.
          </p>
        </aside>
      </div>
    </div>
  );
}
