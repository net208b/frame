import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/i18n/locales';
import { cn } from '@/lib/utils';

/**
 * What members have worked out about photographing a place.
 *
 * The provenance line is not decoration. These notes are opinions from people
 * who have stood there, checked by a moderator before they appear — they are
 * not a statement from whoever runs the place, and a reader deciding whether
 * to carry a tripod across a city needs to know which of the two they are
 * reading.
 *
 * The notes themselves are member-written content in whatever language their
 * author used, so they are rendered exactly as stored. Only the heading and the
 * provenance line are translated: machine-translating somebody's account of a
 * place at render time would put words in their mouth.
 */
export async function ShootingNotes({
  notes,
  locale,
  className,
}: {
  notes: readonly string[];
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'location' });

  return (
    <section aria-labelledby="shooting-notes" className={cn('min-w-0', className)}>
      {/* The size token carries the tracking, which `:root[lang='th']` resets
          for Thai; an arbitrary `tracking-[…]` would survive that reset and
          collide the marks stacked above and below each Thai glyph. */}
      <h2 id="shooting-notes" className="text-title font-bold">
        {t('notes.title')}
      </h2>

      <p className="mt-2 max-w-[52ch] text-caption leading-relaxed text-muted">
        {t('notes.provenance')}
      </p>

      {notes.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-line px-5 py-6 text-caption leading-relaxed text-muted">
          {t('notes.empty')}
        </p>
      ) : (
        <ol className="mt-6 space-y-5">
          {notes.map((note, index) => (
            <li key={index} className="flex gap-4">
              <span
                aria-hidden
                className="mt-0.5 w-5 shrink-0 text-meta font-bold text-muted-soft tabular-nums"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="max-w-[58ch] text-body leading-relaxed text-ink-soft">{note}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
