import { BadgeCheck } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/photographer/Avatar';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { cn, formatMonthYear } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

/**
 * The photographer FRAME's editors chose, and why (0046).
 *
 * The note is the band. A card with a badge and no sentence would be
 * indistinguishable from the appreciation ranking two sections down, and the
 * whole difference is that a person decided and said so — which is also why
 * the label reads "chosen by FRAME's editors" rather than just "featured", and
 * why it sits beside the words instead of floating over the avatar.
 *
 * Two things are deliberately NOT here. There is no appreciation count, no
 * follower count and no "number one" ordinal: a count beside an editorial
 * choice invites the reading that the count caused it (§7.4). And the note is
 * never machine-translated — it is attributed writing, and a translation under
 * an editor's name would be somebody else's sentence.
 *
 * Renders nothing when nobody is featured, so a quiet month is a quiet page
 * rather than an empty frame with an apology in it.
 */
export async function FeaturedPhotographerBand({
  photographer,
  className,
}: {
  photographer: PhotographerProfile | null;
  className?: string;
}) {
  if (!photographer?.editorialFeature || !photographer.featureNote) return null;

  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'community.featuredPhotographer' });
  const since = photographer.featuredAt ? formatMonthYear(photographer.featuredAt, locale) : null;

  return (
    <section aria-label={t('label')} className={cn('border-y border-line py-10', className)}>
      <Eyebrow>{t('eyebrow')}</Eyebrow>

      <div className="mt-6 flex flex-col gap-7 sm:flex-row sm:items-start sm:gap-9">
        <Link
          href={`/photographers/${photographer.username}`}
          className="shrink-0 rounded-pill transition-opacity duration-150 hover:opacity-90"
        >
          <Avatar
            src={photographer.avatarUrl}
            name={photographer.displayName}
            size={96}
            decorative
          />
        </Link>

        <div className="min-w-0">
          {/* The label is text, not only a colour or an icon: the claim it
              makes is the point, and an icon alone says nothing to a reader
              who cannot see it. */}
          <p className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-meta font-semibold text-ink-soft">
            <BadgeCheck className="size-3.5" aria-hidden />
            {t('label')}
          </p>

          <h2 className="mt-3 text-section font-bold break-words">
            <Link
              href={`/photographers/${photographer.username}`}
              className="underline decoration-line underline-offset-4 transition-colors duration-150 hover:decoration-line-strong"
            >
              {photographer.displayName}
            </Link>
          </h2>

          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-muted">
            <span className="font-semibold">@{photographer.username}</span>
            {photographer.basedIn ? (
              <>
                <span aria-hidden>·</span>
                <span>{photographer.basedIn}</span>
              </>
            ) : null}
            {since ? (
              <>
                <span aria-hidden>·</span>
                <span>{t('since', { month: since })}</span>
              </>
            ) : null}
          </p>

          {/* A quotation, and marked up as one: these are the editors' words
              about somebody, not the member's own. */}
          <blockquote className="mt-5 max-w-[58ch] border-l-2 border-line pl-4 text-lead leading-relaxed text-ink-soft">
            {photographer.featureNote}
          </blockquote>

          <p className="mt-5 text-meta text-muted">{t('promise')}</p>
        </div>
      </div>
    </section>
  );
}
