import type { ReactNode } from 'react';

import { NavLink } from '@/components/layout/NavLink';

import { LEGAL_DOCUMENTS } from './policy';

/**
 * The chrome shared by the four policy documents: a measured column for the
 * prose and a list of the other three beside it.
 *
 * The document comes first in the DOM and the list of policies second, so a
 * screen reader and a narrow viewport both reach the page's own heading before
 * the cross-links. The list is placed into the right-hand column by the grid.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-container py-10 lg:py-14">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:gap-16">
        {children}

        <nav aria-label="Policies" className="lg:sticky lg:top-28 lg:self-start">
          {/* Deliberately not a heading: it sits above the page's own h1 visually
              on small screens and would otherwise break the heading order. */}
          <p className="text-eyebrow text-muted uppercase">Policies</p>

          <ul className="mt-4 flex flex-col gap-1">
            {LEGAL_DOCUMENTS.map((policy) => (
              <li key={policy.slug}>
                <NavLink href={`/legal/${policy.slug}`} variant="stacked" exact>
                  {policy.nav}
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="mt-6 border-t border-line pt-4 text-meta leading-relaxed text-muted-soft">
            All four are working drafts kept in step with the product. They are written in the same
            repository as the code so that a policy and the behaviour it describes cannot drift
            apart unnoticed.
          </p>
        </nav>
      </div>
    </div>
  );
}
