import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/SectionHead';
import { Notice } from '@/components/ui/states';
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo';
import { formatDate } from '@/lib/utils';

/**
 * The shared shell for the four policy documents.
 *
 * They are drafted here, next to the software, on purpose: a policy that says
 * something the product does not do is worse than no policy, and the only way
 * to keep the two in step is to write them in the same repository and quote the
 * same constants. Where a document states a limit, it reads it from
 * `lib/config.ts` rather than restating the number by hand — and now passes
 * that number into an ICU message, so the sentence around it can be written in
 * each language rather than assembled from fragments.
 *
 * None of this is a substitute for review by a lawyer, which is said plainly at
 * the top of every one of them.
 *
 * THE ENGLISH IS AUTHORITATIVE. The owner's decision is that all four are
 * translated and that the English text governs, so every page in a language
 * other than `DEFAULT_LOCALE` opens with a notice saying so and linking to the
 * English page. That notice is rendered here, once, rather than being left to
 * each document to remember.
 */

/** The date these drafts were last read through end to end. */
export const LEGAL_LAST_REVIEWED = '2026-10-17';

/**
 * The four documents, in the order they are listed.
 *
 * Only the slug lives here now. The nav label, the title, the description and
 * the summary are messages under `legal.documents.<slug>`, because all four are
 * reader-facing prose and a translated page cannot take them from a constant.
 * `app/sitemap.ts` reads this array for the paths.
 */
export const LEGAL_DOCUMENTS = [
  { slug: 'terms' },
  { slug: 'privacy' },
  { slug: 'copyright' },
  { slug: 'guidelines' },
] as const;

export type LegalSlug = (typeof LEGAL_DOCUMENTS)[number]['slug'];

/** One metadata shape for all four, so none of them can forget a canonical. */
export async function policyMetadata(slug: LegalSlug, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'legal' });

  return buildMetadata({
    title: t(`documents.${slug}.title`),
    description: t(`documents.${slug}.description`),
    path: `/legal/${slug}`,
    locale,
    type: 'article',
  });
}

/** Shared prose furniture, so the four documents read as one voice. */
export const POLICY_LIST = 'list-disc space-y-2 pl-5 marker:text-muted-soft';
export const POLICY_LINK =
  'font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink';

/**
 * The inline emphasis the four documents share, as next-intl rich-text tags.
 *
 * A clause that needs a bold lead-in or an italicised quotation of a UI label
 * keeps the whole clause in one message and marks the emphasis inside it with
 * `<strong>` or `<em>`. Splitting the clause into a bold key and a plain key
 * would need a space between them, which Thai does not use.
 */
export const POLICY_TAGS = {
  strong: (chunks: ReactNode) => <strong className="font-semibold text-ink">{chunks}</strong>,
  em: (chunks: ReactNode) => <em>{chunks}</em>,
};

/**
 * A cross-reference to another policy, as a rich-text tag.
 *
 * The link text is part of the sentence, so it lives in the message. This only
 * supplies the anchor around whichever words the translator chose.
 */
export function policyLinkTag(slug: LegalSlug) {
  // Named rather than an arrow: it returns JSX, so `react/display-name` treats
  // it as a component factory, and a tag callback has no display name to give.
  return function PolicyCrossLink(chunks: ReactNode) {
    return (
      <Link href={`/legal/${slug}`} className={POLICY_LINK}>
        {chunks}
      </Link>
    );
  };
}

/**
 * The ground resolution of a coordinate precision, as a number and a unit.
 *
 * `lib/geo.ts`'s `precisionLabel` does the same arithmetic but returns a
 * finished English string ("about 11 m"), which cannot be spliced into a Thai
 * sentence. Splitting the value from its unit lets the privacy notice carry the
 * whole sentence as one ICU message in each language, with the number formatted
 * by `Intl` for the active locale.
 *
 * The constant — 111,320 metres per degree of latitude — is duplicated from
 * `lib/geo.ts` deliberately; see the note in the handover.
 */
export function precisionAmount(decimals: number): { value: number; unit: 'm' | 'km' } {
  const metres = 111_320 / 10 ** decimals;
  if (metres >= 1000) return { value: Math.round(metres / 100) / 10, unit: 'km' };
  return { value: Math.round(metres), unit: 'm' };
}

export interface PolicySection {
  /** Anchor target, also used by the table of contents. Never translated: the
      same `#takedown` has to resolve in both languages. */
  id: string;
  heading: string;
  body: ReactNode;
}

export async function PolicyDocument({
  slug,
  sections,
  locale,
}: {
  slug: LegalSlug;
  sections: readonly PolicySection[];
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: 'legal' });

  // The review date is the one piece of data in these documents, so it is read
  // in the reader's language while the prose around it is translated per page.
  const reviewed = formatDate(LEGAL_LAST_REVIEWED, INTL_LOCALES[locale]);

  // English is the authoritative text, so every other language says so.
  const isTranslation = locale !== DEFAULT_LOCALE;

  return (
    <article className="max-w-[68ch]">
      <Eyebrow>{t('shell.eyebrow')}</Eyebrow>
      <h1 className="mt-3 text-section-fluid font-bold">{t(`documents.${slug}.title`)}</h1>

      {isTranslation ? (
        <Notice tone="info" title={t('shell.translation.title')} className="mt-6">
          <p>
            {t.rich('shell.translation.body', {
              english: (chunks: ReactNode) => (
                <Link
                  href={`/legal/${slug}`}
                  locale={DEFAULT_LOCALE}
                  hrefLang={DEFAULT_LOCALE}
                  className={POLICY_LINK}
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </Notice>
      ) : null}

      <Notice tone="warning" title={t('shell.draft.title')} className="mt-6">
        <p>{t('shell.draft.body')}</p>
      </Notice>

      <p className="mt-6 text-lead leading-relaxed text-muted">
        {t(`documents.${slug}.summary`)}
      </p>

      {reviewed ? (
        <p className="mt-5 text-meta text-muted-soft">
          {t.rich('shell.lastReviewed', {
            date: reviewed,
            time: (chunks: ReactNode) => <time dateTime={LEGAL_LAST_REVIEWED}>{chunks}</time>,
          })}
        </p>
      ) : null}

      <nav aria-label={t('shell.tableOfContents')} className="mt-8 border-y border-line py-5">
        <h2 className="text-eyebrow text-muted uppercase">{t('shell.tableOfContents')}</h2>
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
        {t('shell.defect')}
      </p>

      {/* The authoritative text is named again at the foot, where somebody who
          has just read a clause and wants to check it does not have to scroll
          back to the top for the link. */}
      {isTranslation ? (
        <p className="mt-4 text-meta leading-relaxed text-muted-soft">
          {t.rich('shell.translation.footer', {
            english: (chunks: ReactNode) => (
              <Link
                href={`/legal/${slug}`}
                locale={DEFAULT_LOCALE}
                hrefLang={DEFAULT_LOCALE}
                className={POLICY_LINK}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
    </article>
  );
}
