import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { LocationCard } from '@/components/location/LocationCard';
import { MasonryGallery } from '@/components/photo/MasonryGallery';
import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { formatCount, truncate } from '@/lib/utils';
import type { LocationDetail, PhotographCard, PhotographerProfile } from '@/types/domain';

/**
 * The three result groups, always presented as three groups.
 *
 * Every search looks in all three places, so all three report back even when
 * one found nothing: a silent group would read as "we did not look there". The
 * counts are only ever as exact as the repository can be — a group whose total
 * cannot be computed cheaply says "or more" rather than passing off the page
 * length as a total.
 *
 * The locale arrives as a prop rather than being read from the request, for the
 * same reason `formatCount` takes one: this component is rendered from a page
 * that already has it, and the count has to be formatted in the language the
 * sentence around it is written in.
 */

export interface SearchGroup<T> {
  items: readonly T[];
  /** Null when an exact total would cost more than it is worth. */
  totalCount: number | null;
  hasMore: boolean;
}

/** The three groups, which are also the three sub-keys under `search.results`. */
type GroupKind = 'photographs' | 'places' | 'people';

const MORE_LINK =
  'text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink';

function ResultSection({
  label,
  heading,
  action,
  children,
}: {
  label: string;
  heading: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <SectionHead eyebrow={label} title={heading} action={action} />
      {children}
    </section>
  );
}

function NothingHere({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted">{children}</p>;
}

export async function SearchResults({
  query,
  locale,
  photographs,
  places,
  people,
}: {
  query: string;
  locale: Locale;
  photographs: SearchGroup<PhotographCard>;
  places: SearchGroup<LocationDetail>;
  people: SearchGroup<PhotographerProfile>;
}) {
  const t = await getTranslations({ locale, namespace: 'search' });
  // "Photographs" and "Places" are the shared vocabulary and already translated
  // there; only the plural of "photographer" is missing from it.
  const common = await getTranslations({ locale, namespace: 'common' });

  const found = photographs.items.length + places.items.length + people.items.length;
  // React escapes this on the way out, so a query full of angle brackets is
  // rendered as the text somebody typed rather than parsed as markup.
  const echoed = truncate(query, 60);

  if (found === 0) {
    return (
      <EmptyState
        className="mt-12"
        title={t('empty.title', { query: echoed })}
        description={t('empty.body')}
        action={
          <Button asChild variant="secondary">
            <Link href="/discover">{t('empty.action')}</Link>
          </Button>
        }
      />
    );
  }

  /**
   * How many this group holds, as one whole sentence.
   *
   * The number is passed twice: as a number, which chooses the English plural
   * form, and as the compact string `formatCount` built for the active locale,
   * which is what is actually shown. ICU would otherwise print 1200 where the
   * design asks for 1.2k. Thai has no plural inflection, so its messages use
   * the formatted value alone and ignore the count — which is why the plural is
   * in the message rather than in a ternary here.
   *
   * A group with no exact total that still has more to give reports a floor
   * rather than a total, because the search stopped looking before the end.
   */
  const heading = (group: SearchGroup<unknown>, kind: GroupKind): string => {
    const value = group.totalCount ?? group.items.length;
    const formatted = formatCount(value, locale);

    if (group.totalCount === null && group.hasMore) {
      return t(`results.${kind}.countOrMore`, { formatted });
    }

    return t(`results.${kind}.count`, { count: value, formatted });
  };

  const placeSearch = `/locations?search=${encodeURIComponent(query)}`;

  return (
    <div className="mt-12 space-y-16 animate-fade-in">
      <ResultSection
        label={common('photographs')}
        heading={heading(photographs, 'photographs')}
        action={
          photographs.items.length > 0 ? (
            <Link href={`/discover?place=${encodeURIComponent(query)}`} className={MORE_LINK}>
              {t('results.photographs.more')}
            </Link>
          ) : null
        }
      >
        {photographs.items.length > 0 ? (
          <MasonryGallery photos={photographs.items} priorityCount={3} />
        ) : (
          <NothingHere>{t('results.photographs.empty', { query: echoed })}</NothingHere>
        )}
      </ResultSection>

      <ResultSection
        label={common('places')}
        heading={heading(places, 'places')}
        action={
          places.hasMore ? (
            <Link href={placeSearch} className={MORE_LINK}>
              {t('results.places.more')}
            </Link>
          ) : null
        }
      >
        {places.items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {places.items.map((place) => (
              <li key={place.id}>
                <LocationCard location={place} categories={place.categories} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <NothingHere>{t('results.places.empty')}</NothingHere>
        )}
      </ResultSection>

      <ResultSection label={t('results.people.label')} heading={heading(people, 'people')}>
        {people.items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {people.items.map((person) => (
              <li key={person.id}>
                <PhotographerCard photographer={person} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <NothingHere>{t('results.people.empty')}</NothingHere>
        )}
      </ResultSection>
    </div>
  );
}
