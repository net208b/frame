import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/SectionHead';
import { Notice } from '@/components/ui/states';
import { buildMetadata } from '@/lib/seo';
import { formatDate } from '@/lib/utils';

/**
 * The shared shell for the four policy documents.
 *
 * They are drafted here, next to the software, on purpose: a policy that says
 * something the product does not do is worse than no policy, and the only way
 * to keep the two in step is to write them in the same repository and quote the
 * same constants. Where a document states a limit, it reads it from
 * `lib/config.ts` rather than restating the number by hand.
 *
 * None of this is a substitute for review by a lawyer, which is said plainly at
 * the top of every one of them.
 */

/** The date these drafts were last read through end to end. */
export const LEGAL_LAST_REVIEWED = '2026-10-17';

export const LEGAL_DOCUMENTS = [
  {
    slug: 'terms',
    nav: 'Terms of use',
    title: 'Terms of use',
    description: 'Who may use FRAME, what members may publish, and what happens when they do not.',
  },
  {
    slug: 'privacy',
    nav: 'Privacy',
    title: 'Privacy notice',
    description:
      'What FRAME records, what it publishes, what it refuses to publish, and who else handles it.',
  },
  {
    slug: 'copyright',
    nav: 'Copyright and takedown',
    title: 'Copyright and takedown',
    description:
      'The photographer keeps the copyright. What licence uploading grants, and how an infringement claim is handled.',
  },
  {
    slug: 'guidelines',
    nav: 'Community guidelines',
    title: 'Community guidelines',
    description:
      'What belongs on FRAME, how to photograph people in public, which places not to pin, and how appreciation is kept honest.',
  },
] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/**
 * Named handles for the four, destructured from the tuple above so a page gets
 * its own entry without a lookup that could come back undefined.
 */
const [termsDocument, privacyDocument, copyrightDocument, guidelinesDocument] = LEGAL_DOCUMENTS;

export const POLICIES = {
  terms: termsDocument,
  privacy: privacyDocument,
  copyright: copyrightDocument,
  guidelines: guidelinesDocument,
} as const;

/** One metadata shape for all four, so none of them can forget a canonical. */
export function policyMetadata(policy: LegalDocument): Metadata {
  return buildMetadata({
    title: policy.title,
    description: policy.description,
    path: `/legal/${policy.slug}`,
    type: 'article',
  });
}

/** Shared prose furniture, so the four documents read as one voice. */
export const POLICY_LIST = 'list-disc space-y-2 pl-5 marker:text-muted-soft';
export const POLICY_LINK =
  'font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink';

export interface PolicySection {
  /** Anchor target, also used by the table of contents. */
  id: string;
  heading: string;
  body: ReactNode;
}

export function PolicyDocument({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: readonly PolicySection[];
}) {
  const reviewed = formatDate(LEGAL_LAST_REVIEWED);

  return (
    <article className="max-w-[68ch]">
      <Eyebrow>Policy draft</Eyebrow>
      <h1 className="mt-3 text-section-fluid font-bold">{title}</h1>

      <Notice tone="warning" title="A starting draft, and not legal advice" className="mt-6">
        <p>
          FRAME is a project in development. This document was drafted alongside the software so
          that what it says matches what the software does, but it is not legal advice, no lawyer
          has reviewed it, and it needs that review before FRAME is opened to the public.
        </p>
      </Notice>

      <p className="mt-6 text-lead leading-relaxed text-muted">{summary}</p>

      {reviewed ? (
        <p className="mt-5 text-meta text-muted-soft">
          Last reviewed <time dateTime={LEGAL_LAST_REVIEWED}>{reviewed}</time>
        </p>
      ) : null}

      <nav aria-label="On this page" className="mt-8 border-y border-line py-5">
        <h2 className="text-eyebrow text-muted uppercase">On this page</h2>
        <ol className="mt-3.5 space-y-2">
          {sections.map((section, index) => (
            <li key={section.id} className="flex gap-3 text-caption">
              <span aria-hidden className="tabular-nums text-muted-soft">
                {String(index + 1).padStart(2, '0')}
              </span>
              <a
                href={`#${section.id}`}
                className="font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-11">
        {sections.map((section) => (
          // scroll-mt clears the sticky header when an anchor is followed.
          <section key={section.id} id={section.id} className="scroll-mt-28">
            <h2 className="text-title font-bold">{section.heading}</h2>
            <div className="mt-3.5 space-y-4 text-body leading-relaxed text-ink-soft">
              {section.body}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-line pt-5 text-meta leading-relaxed text-muted-soft">
        Something in this document that does not match how FRAME behaves is a defect in the
        document. Report it the same way you would report anything else, and it will be corrected
        here rather than explained away.
      </p>
    </article>
  );
}
