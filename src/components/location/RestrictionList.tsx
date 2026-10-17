import { getTranslations } from 'next-intl/server';

import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { cn, formatDate } from '@/lib/utils';
import type { LocationRestriction } from '@/types/domain';

/**
 * Access and photography restrictions, each with the source behind it.
 *
 * A restriction is a claim about what somebody is allowed to do, so it is only
 * ever shown with where the claim came from and when it was recorded. The type
 * makes `source` required for exactly that reason: an unsourced restriction is
 * a rumour the platform would be putting its name to, so it is not stored and
 * cannot be rendered.
 *
 * `note` and `source` are member- and moderator-written records, so they are
 * rendered as stored in both languages. Translating a restriction at render
 * time would mean the platform paraphrasing a rule it did not write, and a
 * paraphrase of "no tripods after 18:00" that drifts is worse than one a reader
 * has to read in the language it was recorded in. Only the framing, the kind
 * names and the labels around them are translated.
 */

/** The message key for each stored kind. Hyphenated kinds get camelCase keys. */
const KIND_KEYS = {
  permit: 'restrictions.kind.permit',
  'private-property': 'restrictions.kind.privateProperty',
  'no-tripod': 'restrictions.kind.noTripod',
  hours: 'restrictions.kind.hours',
  fee: 'restrictions.kind.fee',
  other: 'restrictions.kind.other',
} as const satisfies Record<LocationRestriction['kind'], string>;

export async function RestrictionList({
  restrictions,
  locale,
  className,
}: {
  restrictions: readonly LocationRestriction[];
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'location' });

  return (
    <section aria-labelledby="restrictions" className={cn('min-w-0', className)}>
      {/* The size token carries the tracking so `:root[lang='th']` can reset it
          for Thai; an arbitrary `tracking-[…]` would not be reset. */}
      <h2 id="restrictions" className="text-title font-bold">
        {t('restrictions.title')}
      </h2>

      {restrictions.length === 0 ? (
        <>
          <p className="mt-2 max-w-[52ch] text-caption leading-relaxed text-muted">
            {t('restrictions.sourceRule')}
          </p>
          <p className="mt-6 rounded-card border border-dashed border-line px-5 py-6 text-body leading-relaxed text-ink-soft">
            {t('restrictions.noneTitle')}{' '}
            {/* An absent note is not permission, and that sentence has to carry
                the same weight in Thai as it does in English. */}
            <span className="text-muted">{t('restrictions.noneWarning')}</span>
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-[52ch] text-caption leading-relaxed text-muted">
            {t('restrictions.sourceNote')}
          </p>

          <ul className="mt-6 space-y-3">
            {restrictions.map((restriction, index) => {
              const recorded = formatDate(restriction.recordedAt, INTL_LOCALES[locale]);

              return (
                <li key={index} className="rounded-card border border-line bg-surface p-5">
                  <h3 className="text-eyebrow text-ink uppercase">
                    {t(KIND_KEYS[restriction.kind])}
                  </h3>
                  <p className="mt-2.5 text-body leading-relaxed text-ink-soft">
                    {restriction.note}
                  </p>
                  <p className="mt-3 border-t border-line pt-3 text-meta leading-relaxed text-muted">
                    <span className="font-semibold text-ink-soft">
                      {t('restrictions.source')}{' '}
                    </span>
                    {restriction.source}
                  </p>
                  <p className="mt-1 text-meta text-muted-soft">
                    {recorded
                      ? t('restrictions.recorded', { date: recorded })
                      : t('restrictions.recordedUnknown')}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
