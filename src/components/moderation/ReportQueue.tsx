import { Copyright } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import type { LocationSlugLookup } from '@/components/moderation/SubmissionQueue';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState, Notice } from '@/components/ui/states';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import type { Report, ReportSubjectType } from '@/types/domain';

/**
 * Reported content.
 *
 * Two things shape this queue. A copyright report is not an ordinary report —
 * it starts a takedown process with its own published policy — so it is marked
 * out and the policy is linked from the row rather than assumed to be known.
 * And the reporter is an internal detail: who filed a report tells a moderator
 * how to weigh it, and telling anyone else turns reporting into a risk.
 *
 * Each subject type is named twice in the catalogue: `reports.subject.*` for the
 * badge that starts a line, `reports.subjectNoun.*` for the same word inside a
 * sentence. English needed `toLowerCase()` for the second; Thai has no case, so
 * lowercasing a translated word is at best a no-op and at worst damage. Two
 * keys cost nothing and are honest in both languages.
 */

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function dismiss(t: Translator): DecisionOption {
  return {
    value: 'dismiss',
    label: t('reports.options.dismiss.label'),
    effect: t('reports.options.dismiss.effect'),
    reasonRequired: false,
    reasonAudience: 'internal',
  };
}

/**
 * Closing a report without touching the content.
 *
 * There is no column on a photograph or a place that holds a moderator's note,
 * and FRAME has no member-facing message channel, so this records the note in
 * the moderation trail and nothing else. Saying it "tells the owner" would be
 * the comfortable description and the wrong one.
 */
function closeWithoutRemoving(t: Translator): DecisionOption {
  return {
    value: 'request_changes',
    label: t('reports.options.close.label'),
    effect: t('reports.options.close.effect'),
    reasonRequired: true,
    reasonAudience: 'internal',
  };
}

/** A removed photograph carries `removed_reason`, which its owner can read. */
function removePhotograph(t: Translator): DecisionOption {
  return {
    value: 'remove_content',
    label: t('reports.options.removePhotograph.label'),
    effect: t('reports.options.removePhotograph.effect'),
    reasonRequired: true,
    reasonAudience: 'member',
    destructive: true,
  };
}

/**
 * A place has no reason column, and an unapproved place is invisible to the
 * member who proposed it, so the reason cannot reach them from here.
 */
function removeLocation(t: Translator): DecisionOption {
  return {
    value: 'remove_content',
    label: t('reports.options.removeLocation.label'),
    effect: t('reports.options.removeLocation.effect'),
    reasonRequired: true,
    reasonAudience: 'internal',
    destructive: true,
  };
}

function suspendOptions(t: Translator): readonly DecisionOption[] {
  return [
    {
      value: 'suspend_account',
      label: t('reports.options.suspend.label'),
      effect: t('reports.options.suspend.effect'),
      reasonRequired: true,
      // Written to the profile row, which its owner keeps read access to.
      reasonAudience: 'member',
      destructive: true,
    },
  ];
}

/**
 * Row-level security gives moderators an update policy on photographs and
 * places and none on collections, so "remove the content" is genuinely
 * unavailable for a collection or a profile. The action refuses it too; this
 * only keeps a moderator from reaching for a control that cannot work.
 */
function optionsFor(subjectType: ReportSubjectType, t: Translator): readonly DecisionOption[] {
  if (subjectType === 'photograph') {
    return [dismiss(t), closeWithoutRemoving(t), removePhotograph(t)];
  }
  if (subjectType === 'location') {
    return [dismiss(t), closeWithoutRemoving(t), removeLocation(t)];
  }
  return [dismiss(t), closeWithoutRemoving(t)];
}

/**
 * Where a reported subject can be linked, and where it cannot.
 *
 * A report stores its subject's id plus a readable snapshot of its label — not
 * a slug, because the label has to survive the subject being removed, which is
 * often the outcome. Locations can still be resolved, because the page hands
 * down an id-to-slug lookup. A photograph, profile or collection cannot: the
 * read API offers no lookup by id for them, so those fall back to a search for
 * the label, which is at least a link that works.
 */
function subjectLink(
  report: Report,
  locationSlugById: LocationSlugLookup | undefined,
): { href: string; isDirect: boolean } {
  const slug = report.subjectType === 'location' ? locationSlugById?.[report.subjectId] : undefined;
  if (slug) return { href: `/locations/${slug}`, isDirect: true };
  return { href: `/search?q=${encodeURIComponent(report.subjectLabel)}`, isDirect: false };
}

export async function ReportQueue({
  locale,
  reports,
  locationSlugById,
}: {
  locale: Locale;
  reports: readonly Report[];
  locationSlugById?: LocationSlugLookup;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return (
    <section aria-labelledby="queue-reports">
      <SectionHead
        eyebrow={t('reports.eyebrow')}
        title={<span id="queue-reports">{t('reports.title')}</span>}
        description={t('reports.description')}
      />

      <QueueCapNote locale={locale} shown={reports.length} />

      {reports.length === 0 ? (
        <EmptyState
          title={t('reports.emptyTitle')}
          description={t('reports.emptyDescription')}
        />
      ) : (
        <ul className="border-t border-line">
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              locale={locale}
              report={report}
              locationSlugById={locationSlugById}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

async function ReportRow({
  locale,
  report,
  locationSlugById,
}: {
  locale: Locale;
  report: Report;
  locationSlugById?: LocationSlugLookup;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation' });
  const intlLocale = INTL_LOCALES[locale];

  const isCopyright = report.reason === 'copyright';
  const filedOn = formatDate(report.createdAt, intlLocale);
  const subjectNoun = t(`reports.subjectNoun.${report.subjectType}`);
  const link = subjectLink(report, locationSlugById);

  return (
    <li
      className={cn(
        'border-b border-line py-7 last:border-b-0',
        isCopyright && 'border-l-2 border-l-danger pl-5',
      )}
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-surface-sunken px-2.5 py-1 text-eyebrow text-muted uppercase">
              {t(`reports.subject.${report.subjectType}`)}
            </span>
            {isCopyright ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-bg px-2.5 py-1 text-eyebrow text-danger uppercase">
                <Copyright className="size-3 shrink-0" aria-hidden />
                {t('reports.copyrightBadge')}
              </span>
            ) : null}
            {report.status === 'reviewing' ? (
              <span className="rounded-pill bg-info-bg px-2.5 py-1 text-eyebrow text-info uppercase">
                {t('reports.reviewingBadge')}
              </span>
            ) : null}
          </p>

          <h3 className="mt-2.5 text-title font-bold">
            <Link
              href={link.href}
              aria-label={
                link.isDirect
                  ? t('reports.openSubject', { label: report.subjectLabel, noun: subjectNoun })
                  : t('reports.searchSubject', { label: report.subjectLabel, noun: subjectNoun })
              }
              className="underline decoration-line-strong underline-offset-[3px] hover:decoration-ink"
            >
              {report.subjectLabel}
            </Link>
            {link.isDirect ? null : (
              <span className="ml-2 align-middle text-meta font-medium text-muted">
                {t('reports.noDirectLink', { noun: subjectNoun })}
              </span>
            )}
          </h3>

          <p className="mt-2 text-caption font-semibold text-ink-soft">
            {t(`reportReason.${report.reason}`)}
          </p>

          {report.details ? (
            <p className="mt-2.5 border-l-2 border-line-strong pl-3.5 text-caption leading-relaxed text-ink-soft">
              {report.details}
            </p>
          ) : (
            <p className="mt-2.5 text-meta text-muted">{t('reports.noDetails')}</p>
          )}

          <p className="mt-3 text-meta text-muted">
            {t.rich('reports.filed', {
              when: formatRelative(report.createdAt, new Date(), intlLocale),
              time: (chunks) => (
                <time dateTime={report.createdAt} title={filedOn ?? undefined}>
                  {chunks}
                </time>
              ),
            })}
          </p>

          {/* Internal, and labelled as internal, so it is never mistaken for
              something the reported member is shown. */}
          <p className="mt-3 text-meta text-muted-soft">
            <span className="font-bold uppercase">{t('reports.internalLabel')}</span>{' '}
            {report.reportedBy
              ? t('reports.reportedBy', { username: report.reportedBy.username })
              : t('reports.reporterGone')}
            {' · '}
            <span className="font-mono">{report.id.slice(0, 8)}</span>
          </p>

          {isCopyright ? (
            <Notice tone="danger" title={t('reports.takedownTitle')} className="mt-4">
              <p>
                {t.rich('reports.takedownBody', {
                  policy: (chunks) => (
                    <Link
                      href="/legal/copyright"
                      className="font-semibold underline decoration-current underline-offset-2"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </Notice>
          ) : null}

          {report.subjectType === 'collection' || report.subjectType === 'profile' ? (
            <p className="mt-4 text-meta leading-relaxed text-muted">
              {t('reports.noWritePath', { noun: subjectNoun })}{' '}
              {report.subjectType === 'profile'
                ? t('reports.noWritePathProfile')
                : t('reports.noWritePathCollection')}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'report', reportId: report.id }}
            subjectLabel={t('reports.subjectWithLabel', {
              noun: subjectNoun,
              label: report.subjectLabel,
            })}
            options={optionsFor(report.subjectType, t)}
          />

          {report.subjectType === 'profile' ? null : (
            /* A report names what was reported, not who owns it, so there is no
               account id here to suspend. Offering the control anyway would be
               a button with nothing to act on. */
            <p className="text-meta leading-relaxed text-muted">
              {t('reports.suspendElsewhere', { noun: subjectNoun })}
            </p>
          )}

          {report.subjectType === 'profile' ? (
            <div className="border-t border-line pt-5">
              <p className="mb-3 text-meta leading-relaxed text-muted">
                {t('reports.suspensionSeparate')}
              </p>
              <DecisionForm
                target={{ kind: 'account', accountId: report.subjectId }}
                subjectLabel={t('reports.accountBehind', { label: report.subjectLabel })}
                options={suspendOptions(t)}
                reasonHint={t('reports.suspendReasonHint')}
              />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
