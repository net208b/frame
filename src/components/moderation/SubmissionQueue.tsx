import { getTranslations } from 'next-intl/server';

import {
  DecisionForm,
  type DecisionOption,
} from '@/components/moderation/DecisionForm';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import {
  SignalBadge,
  SUBMISSION_SIGNAL_MESSAGE_KEYS,
} from '@/components/moderation/SignalBadge';
import { Avatar } from '@/components/photographer/Avatar';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { LOCATION_POLICY } from '@/lib/config';
import { formatCoordinates, formatDate, formatRelative } from '@/lib/utils';
import type { LocationSubmission } from '@/types/domain';

/**
 * Proposed places waiting for a human.
 *
 * Nothing in FRAME approves a place automatically. The checks on each row can
 * say a point sits outside its country's bounding box or within a hundred
 * metres of a place already on the map; none of them can say the place exists,
 * is reachable, or is safe to publish the exact position of. That last question
 * is answered on this screen, which is why the coordinate-privacy controls sit
 * inside the decision rather than somewhere a moderator might not look.
 */

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * The three decisions, written where the prose is.
 *
 * Built per render from the translator rather than held as a module constant,
 * because what each decision does is a sentence and sentences have a language.
 * `DecisionForm` receives them already translated and never has to know which
 * queue it is standing in.
 */
function optionsFor(t: Translator): readonly DecisionOption[] {
  return [
    {
      value: 'approve',
      label: t('submissions.options.approve.label'),
      effect: t('submissions.options.approve.effect'),
      reasonRequired: false,
      // approve_location_submission() writes its own audit row with a null
      // reason, so a sentence typed here would go nowhere at all.
      reasonAudience: 'none',
    },
    {
      value: 'request_changes',
      label: t('submissions.options.requestChanges.label'),
      effect: t('submissions.options.requestChanges.effect'),
      reasonRequired: true,
      // Stored on the submission row, which its submitter can read.
      reasonAudience: 'member',
    },
    {
      value: 'reject',
      label: t('submissions.options.reject.label'),
      effect: t('submissions.options.reject.effect'),
      reasonRequired: true,
      reasonAudience: 'member',
      destructive: true,
    },
  ];
}

/**
 * Approved places keyed by id.
 *
 * A duplicate signal carries the id of the place it matched, and a location
 * page is addressed by slug, so without this lookup the only link available is
 * a search for the label. Built once by the page from the map pins.
 */
export type LocationSlugLookup = Readonly<Record<string, string>>;

export async function SubmissionQueue({
  locale,
  submissions,
  locationSlugById,
}: {
  locale: Locale;
  submissions: readonly LocationSubmission[];
  locationSlugById?: LocationSlugLookup;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <section aria-labelledby="queue-submissions">
      <SectionHead
        eyebrow={t('submissions.eyebrow')}
        title={<span id="queue-submissions">{t('submissions.title')}</span>}
        description={t('submissions.description')}
      />

      <QueueCapNote locale={locale} shown={submissions.length} />

      {submissions.length === 0 ? (
        <EmptyState
          title={t('submissions.emptyTitle')}
          description={t('submissions.emptyDescription')}
        />
      ) : (
        <ul className="border-t border-line">
          {submissions.map((submission) => (
            <SubmissionRow
              key={submission.id}
              locale={locale}
              submission={submission}
              locationSlugById={locationSlugById}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Metres per degree of latitude, the figure `precisionLabel` in `lib/geo.ts`
 * uses. It is repeated here because that helper returns a finished English
 * phrase ("about 11 m") and this row needs the number so the words can come
 * from the catalogue. The duplication disappears when `lib/geo.ts` takes a
 * locale; until then it is one constant, stated on both sides.
 */
const METRES_PER_DEGREE = 111_320;

async function SubmissionRow({
  locale,
  submission,
  locationSlugById,
}: {
  locale: Locale;
  submission: LocationSubmission;
  locationSlugById?: LocationSlugLookup;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });
  const intlLocale = INTL_LOCALES[locale];

  const submittedOn = formatDate(submission.createdAt, intlLocale);
  const place = [submission.city, submission.country].filter(Boolean).join(', ');

  const precisionMetres = METRES_PER_DEGREE / 10 ** LOCATION_POLICY.publicCoordinateDecimals;
  const precision =
    precisionMetres >= 1000
      ? t('submissions.precisionKilometres', {
          kilometres: new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(
            precisionMetres / 1000,
          ),
        })
      : t('submissions.precisionMetres', { metres: Math.round(precisionMetres) });

  return (
    <li className="border-b border-line py-7 last:border-b-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="min-w-0">
          <h3 className="text-title font-bold">{submission.proposedName}</h3>

          <dl className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-meta text-muted">
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">{t('submissions.placeLabel')}</dt>
              <dd className="text-ink-soft">
                {place || t('submissions.noPlaceGiven')}
                {submission.countryCode ? ` (${submission.countryCode})` : ''}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">{t('submissions.coordinatesLabel')}</dt>
              <dd className="font-mono tabular-nums text-ink-soft">
                {formatCoordinates(
                  submission.latitude,
                  submission.longitude,
                  LOCATION_POLICY.publicCoordinateDecimals,
                )}
                <span className="ml-1.5 font-sans text-muted">({precision})</span>
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">{t('submissions.waitingLabel')}</dt>
              <dd>
                <time dateTime={submission.createdAt} title={submittedOn ?? undefined}>
                  {formatRelative(submission.createdAt, new Date(), intlLocale)}
                </time>
              </dd>
            </div>
          </dl>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-muted">
            <Avatar
              src={submission.submittedBy.avatarUrl}
              name={submission.submittedBy.displayName}
              size={24}
              decorative
            />
            <span>
              {t.rich('submissions.proposedBy', {
                name: submission.submittedBy.displayName,
                link: (chunks) => (
                  <Link
                    href={`/photographers/${submission.submittedBy.username}`}
                    className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </p>

          {submission.note ? (
            <p className="mt-3 border-l-2 border-line-strong pl-3.5 text-caption leading-relaxed text-ink-soft">
              {submission.note}
            </p>
          ) : null}

          {submission.signals.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {submission.signals.map((signal, index) => (
                <SignalBadge
                  // Signals are a derived list with no ids of their own, so the
                  // kind plus its position is the only stable key available.
                  key={`${signal.kind}-${index}`}
                  locale={locale}
                  severity={signal.severity}
                  label={t(SUBMISSION_SIGNAL_MESSAGE_KEYS[signal.kind])}
                  message={signal.message}
                >
                  {signal.kind === 'possible-duplicate' && signal.relatedLabel ? (
                    <DuplicateSignalLink
                      locale={locale}
                      label={signal.relatedLabel}
                      slug={
                        signal.relatedId === undefined
                          ? undefined
                          : locationSlugById?.[signal.relatedId]
                      }
                      distanceMetres={signal.distanceMetres}
                    />
                  ) : null}
                </SignalBadge>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-meta text-muted">{t('submissions.noSignals')}</p>
          )}
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'submission', submissionId: submission.id }}
            subjectLabel={
              place
                ? t('submissions.subjectWithPlace', { name: submission.proposedName, place })
                : submission.proposedName
            }
            options={optionsFor(t)}
          />
        </div>
      </div>
    </li>
  );
}

const LINK_CLASSES =
  'font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

/**
 * The place a submission may duplicate.
 *
 * It links straight to the location page when the slug could be resolved. When
 * it could not — a place that withholds its coordinates has no map pin and so
 * is not in the lookup — it falls back to a search for the label and says so,
 * rather than guessing a URL that would 404.
 */
async function DuplicateSignalLink({
  locale,
  label,
  slug,
  distanceMetres,
}: {
  locale: Locale;
  label: string;
  slug: string | undefined;
  distanceMetres: number | undefined;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <span className="text-meta text-muted">
      <Link
        href={slug ? `/locations/${slug}` : `/search?q=${encodeURIComponent(label)}`}
        className={LINK_CLASSES}
      >
        {label}
      </Link>
      {slug ? null : <span> {t('submissions.duplicateBySearch')}</span>}
      {distanceMetres === undefined
        ? null
        : ` · ${t('submissions.duplicateDistance', { metres: distanceMetres })}`}
    </span>
  );
}
