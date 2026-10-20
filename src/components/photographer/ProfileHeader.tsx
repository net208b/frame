import { ArrowUpRight, Handshake, MessageSquareQuote } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { Avatar } from '@/components/photographer/Avatar';
import { ReportDialog } from '@/components/system/ReportDialog';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
import { countryFlag, countryName } from '@/lib/geo/countries';
import { cn, formatMonthYear } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

/**
 * The masthead of a photographer's page.
 *
 * It renders exactly what {@link PhotographerProfile} carries and nothing more.
 * There is no email address, no last-seen time, no signup day, no follower
 * count and no location beyond the `basedIn` line the member wrote themselves —
 * none of which this type holds, which is the point: the shape of the data is
 * the privacy decision, so the component cannot leak what it never receives.
 *
 * Three strings on this page are member-written and stay in whatever language
 * the member chose: the display name, the `basedIn` line and the biography.
 * Translating a person's own words would be a lie about who wrote them.
 *
 * The country, the styles and the two statuses are the other kind: FRAME's own
 * vocabulary, chosen from a list, so those *are* translated — a Thai reader sees
 * "ขาวดำ" where an English reader sees "Black and white", and both are reading
 * the same stored value. The statuses say what the member said and no more:
 * nothing is shown for a status they left unset, because silence about
 * collaboration is not a refusal of it, and the critique line is a sentence to
 * other members rather than a rule the application enforces — FRAME has no
 * comments for it to enforce anything about.
 */

/**
 * A member-supplied URL ends up in an `href`, so the scheme is checked first:
 * `javascript:` and `data:` values are script injection dressed as a website.
 * Anything that is not plain http(s) is dropped rather than linked.
 */
function externalWebsite(value: string): { href: string; label: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return { href: url.toString(), label: `${url.host}${path}` };
}

/** Members write prose, so a blank line is honoured as a paragraph break. */
function paragraphs(biography: string): string[] {
  return biography
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export async function ProfileHeader({
  photographer,
  isSelf = false,
  className,
}: {
  photographer: PhotographerProfile;
  /**
   * Whether the member reading this is the one it is about. Decided by the
   * page, which is the thing that reads the session — the same arrangement the
   * photograph and collection pages already use for their own report buttons.
   */
  isSelf?: boolean;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });
  // `common` holds the three vocabularies — styles, collaboration, critique —
  // because the Settings form sets them from the same words.
  const common = await getTranslations({ locale, namespace: 'common' });

  /*
   * Only roles that change what a member can do are worth announcing, and the
   * three cases are written out rather than looked up by key so the compiler
   * can still tell that `member` has no label.
   */
  const role =
    photographer.role === 'moderator'
      ? t('role.moderator')
      : photographer.role === 'admin'
        ? t('role.admin')
        : null;

  // Month precision, in the reader's language: "March 2024" / "มีนาคม 2024".
  const memberSince = formatMonthYear(photographer.memberSince, locale);
  const website = photographer.website ? externalWebsite(photographer.website) : null;
  const biography = photographer.biography ? paragraphs(photographer.biography) : [];

  /*
   * The flag goes in front of the member's own "based in" line rather than
   * beside a second copy of the country name: most people write "Tokyo, Japan"
   * there, and "Tokyo, Japan · Japan" is the sort of thing a page does when
   * nobody read it aloud. With no line of their own, the country's name is the
   * line. The glyph is decorative in both cases — a platform with no flag
   * glyphs draws the two letters, and a screen reader should read the place,
   * not "regional indicator symbol J".
   */
  const country = photographer.countryCode;
  const place = photographer.basedIn ?? (country ? countryName(country, locale) : null);
  const flag = country ? countryFlag(country) : '';

  // Other links the member listed. Filtered the same way the website is: a
  // stored value that is not http(s) is dropped rather than linked.
  const links = photographer.socialLinks
    .map((link) => externalWebsite(link))
    .filter((link): link is { href: string; label: string } => link !== null);

  const cover = photographer.cover;

  return (
    <header className={cn('border-b border-line pb-10', className)}>
      {/*
        The cover: one of the member's own published photographs, chosen in
        Settings, and a link to that photograph because that is what it is. It
        is described with the alt text the member wrote for it rather than left
        decorative — it is somebody's work, not a texture, and on the page about
        them it is the one image that says what their work looks like before any
        of the words do.

        `priority`, because when a profile has a cover it is the largest thing
        above the fold and therefore what the page is waiting on.
      */}
      {cover ? (
        <Link
          href={`/photographs/${cover.slug}`}
          className="group relative block h-[clamp(9rem,26vw,19rem)] overflow-hidden rounded-panel bg-surface-sunken"
        >
          <Image
            src={cover.imageUrl}
            alt={cover.altText}
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            priority
            className="object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.02]"
          />
        </Link>
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-7 md:flex-row md:items-start md:gap-10',
          cover && 'mt-7',
        )}
      >
        {/*
          Tucked up over the cover's bottom edge, with a ring of the page colour
          around it so it reads as sitting on top rather than cut into it. Only
          the avatar moves: the name and the lines under it stay where the row
          puts them, which is what keeps the heading clear of the image.
        */}
        <div className={cn(cover && '-mt-16 md:-mt-20')}>
          <div className={cn(cover && 'rounded-pill ring-4 ring-paper')}>
            <Avatar
              src={photographer.avatarUrl}
              name={photographer.displayName}
              size={128}
              decorative
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <Eyebrow>{common('photographer')}</Eyebrow>

          <h1 className="mt-3 text-section-fluid font-bold break-words">
            {photographer.displayName}
          </h1>

          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-muted">
            <span className="font-semibold">@{photographer.username}</span>
            {place ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {flag ? <span aria-hidden>{flag} </span> : null}
                  {/* Member-written where they wrote one, otherwise the
                      country's name in the reader's language. */}
                  {place}
                </span>
              </>
            ) : null}
            {memberSince ? (
              <>
                <span aria-hidden>·</span>
                {/* Month precision only — the exact signup day is not public. */}
                <span>{t('memberSince', { month: memberSince })}</span>
              </>
            ) : null}
            {role ? (
              <>
                <span aria-hidden>·</span>
                <span>{role}</span>
              </>
            ) : null}
          </p>

          {biography.length > 0 ? (
            <div className="mt-6 max-w-[58ch] space-y-3 text-lead leading-relaxed text-ink-soft">
              {biography.map((block) => (
                <p key={block}>{block}</p>
              ))}
            </div>
          ) : null}

          {photographer.styles.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {photographer.styles.map((style) => (
                <li
                  key={style}
                  className="rounded-pill border border-line bg-surface px-2.5 py-1 text-meta text-ink-soft"
                >
                  {common(`photographyStyles.${style}`)}
                </li>
              ))}
            </ul>
          ) : null}

          {photographer.collaboration || photographer.critique ? (
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              {photographer.collaboration ? (
                <div className="flex items-baseline gap-2">
                  <Handshake aria-hidden className="size-3.5 shrink-0 translate-y-0.5 text-muted" />
                  <dt className="text-meta text-muted">{t('collaboration.label')}</dt>
                  <dd className="text-meta font-semibold text-ink">
                    {common(`collaboration.${photographer.collaboration}`)}
                  </dd>
                </div>
              ) : null}

              {photographer.critique ? (
                <div className="flex items-baseline gap-2">
                  <MessageSquareQuote
                    aria-hidden
                    className="size-3.5 shrink-0 translate-y-0.5 text-muted"
                  />
                  <dt className="text-meta text-muted">{t('critique.label')}</dt>
                  <dd className="text-meta font-semibold text-ink">
                    {common(`critique.${photographer.critique}`)}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {/* Aligned to the top, not centred: the website carries a note under
              it, and centring put the other links halfway down that note
              instead of on the same line as the address beside them. */}
          <div className="mt-7 flex flex-wrap items-start gap-x-6 gap-y-3">
            {website ? (
              <div className="min-w-0">
                <a
                  href={website.href}
                  rel="me nofollow noopener"
                  className="inline-flex max-w-full items-center gap-1.5 text-caption font-semibold text-ink transition-colors duration-150 hover:text-muted"
                >
                  <span className="truncate">{website.label}</span>
                  <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
                </a>
                <p className="mt-1 text-meta text-muted-soft">{t('websiteNote')}</p>
              </div>
            ) : null}

            {links.length > 0 ? (
              <ul className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                {links.map((link) => (
                  <li key={link.href} className="min-w-0">
                    <a
                      href={link.href}
                      rel="me nofollow noopener"
                      className="inline-flex max-w-full items-center gap-1.5 text-caption text-ink-soft transition-colors duration-150 hover:text-ink"
                    >
                      <span className="truncate">{link.label}</span>
                      <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Reporting is for everyone else. Offering a member a button to
                report themselves was never a security hole — the dialog would
                have been accepted and a moderator would have read it — but it
                is a nonsense the other two report buttons already avoid, and
                the one on a profile was the only one left asking. */}
            {isSelf ? null : (
              <ReportDialog
                subjectType="profile"
                subjectId={photographer.id}
                subjectLabel={`@${photographer.username}`}
                triggerLabel={t('reportAccount')}
                triggerVariant="ghost"
                className="md:ml-auto"
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
