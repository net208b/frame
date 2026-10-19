import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CoordinateDisclosure } from '@/components/location/CoordinateDisclosure';
import { StaticLocationMap } from '@/components/map/StaticLocationMap';
import { CategoryTag } from '@/components/photo/CategoryTag';
import { Avatar } from '@/components/photographer/Avatar';
import { ReportDialog } from '@/components/system/ReportDialog';
import { INTL_LOCALES, type Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn, formatCount, formatDate } from '@/lib/utils';
import type { LocationDetail } from '@/types/domain';

/**
 * The masthead of a location page: what this place is, where it is, what it is
 * good for, and who vouched for it.
 *
 * The map and the coordinate disclosure sit together on purpose. A pin on its
 * own invites a reader to assume it is exact, so the sentence that says how
 * exact it actually is belongs directly beneath it.
 *
 * `name`, `city`, `country`, `description` and `bestTimeOfDay` are stored
 * records, so they appear in both languages exactly as a moderator approved
 * them.
 */
export async function LocationHeader({
  location,
  locale,
  className,
}: {
  location: LocationDetail;
  locale: Locale;
  className?: string;
}) {
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: 'location' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);

  const approved = formatDate(location.approvedAt, INTL_LOCALES[locale]);
  const submitter = location.submittedBy;

  return (
    <header className={cn('site-container border-b border-line pt-10 pb-12 lg:pt-14', className)}>
      {/* /locations is not in the main navigation, so the way back lives here. */}
      <Link
        href="/locations"
        className="inline-flex items-center gap-1.5 text-meta font-semibold text-muted transition-colors duration-150 hover:text-ink"
      >
        <ChevronLeft aria-hidden className="size-3.5" />
        {t('header.allLocations')}
      </Link>

      <h1 className="text-display-fluid mt-5 max-w-[22ch]">{location.name}</h1>

      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-lead text-muted">
        <span>
          {location.city}, {location.country}
        </span>
        <span className="rounded-pill border border-line px-2 py-1 text-eyebrow text-ink-soft uppercase">
          {/* The code is shown; the sentence that explains what it is belongs to
              assistive technology, and it is one whole sentence so it can be
              worded naturally in either language. */}
          <span aria-hidden>{location.countryCode}</span>
          <span className="sr-only">
            {t('header.isoCountryCode', { code: location.countryCode })}
          </span>
        </span>
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-14">
        <div className="min-w-0">
          {location.description ? (
            <p className="max-w-[56ch] text-lead leading-relaxed text-ink-soft">
              {location.description}
            </p>
          ) : (
            <p className="max-w-[56ch] text-lead leading-relaxed text-muted">
              {t('header.noDescription')}
            </p>
          )}

          <dl className="mt-9 flex flex-wrap gap-x-12 gap-y-6 border-t border-line pt-7">
            <div>
              <dt className="text-eyebrow text-muted uppercase">{tCommon('photographs')}</dt>
              <dd className="mt-2 text-title font-bold tabular-nums">
                {formatCount(location.photographCount, INTL_LOCALES[locale])}
              </dd>
            </div>

            {location.bestTimeOfDay ? (
              <div className="max-w-[26ch]">
                <dt className="text-eyebrow text-muted uppercase">{t('header.bestTimeOfDay')}</dt>
                <dd className="mt-2 text-body font-semibold text-ink">{location.bestTimeOfDay}</dd>
              </div>
            ) : null}
          </dl>

          {location.categories.length > 0 ? (
            <div className="mt-8">
              <p id="location-categories" className="text-eyebrow text-muted uppercase">
                {t('header.goodFor')}
              </p>
              <ul
                aria-labelledby="location-categories"
                className="mt-3 flex flex-wrap gap-1.5"
              >
                {location.categories.map((category) => (
                  <li key={category}>
                    <CategoryTag category={category} tone="surface" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-line pt-6">
            <div className="flex min-w-0 items-center gap-2.5">
              {submitter ? (
                <Avatar src={submitter.avatarUrl} name={submitter.displayName} size={28} decorative />
              ) : null}
              <p className="text-meta leading-relaxed text-muted">
                {submitter
                  ? // One message, with the link as a tag inside it: Thai puts
                    // the credit before the name and has no space to splice.
                    t.rich('header.submittedBy', {
                      name: submitter.displayName,
                      photographer: (chunks) => (
                        <Link
                          href={`/photographers/${submitter.username}`}
                          className="font-semibold text-ink-soft"
                        >
                          {chunks}
                        </Link>
                      ),
                    })
                  : t('header.submitterUnknown')}
                {approved
                  ? ` · ${t('header.approvedOn', { date: approved })}`
                  : ` · ${t('header.approvalDateUnknown')}`}
              </p>
            </div>

            <ReportDialog
              subjectType="location"
              subjectId={location.id}
              subjectLabel={`${location.name}, ${location.city}`}
              triggerLabel={t('header.report')}
              triggerVariant="ghost"
            />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {location.coordinates ? (
            <StaticLocationMap
              latitude={location.coordinates.latitude}
              longitude={location.coordinates.longitude}
              name={location.name}
              isApproximate={location.coordinates.isApproximate}
              precisionDecimals={location.coordinates.precisionDecimals}
              heightClassName="h-[320px]"
              className="overflow-hidden rounded-media border border-line"
            />
          ) : null}

          <CoordinateDisclosure
            coordinates={location.coordinates}
            locationName={location.name}
            locale={locale}
          />
        </div>
      </div>
    </header>
  );
}
