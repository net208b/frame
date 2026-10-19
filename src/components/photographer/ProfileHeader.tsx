import { ArrowUpRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/photographer/Avatar';
import { ReportDialog } from '@/components/system/ReportDialog';
import { Eyebrow } from '@/components/ui/SectionHead';
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
  className,
}: {
  photographer: PhotographerProfile;
  className?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'profile' });
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

  return (
    <header className={cn('border-b border-line pb-10', className)}>
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-10">
        <Avatar
          src={photographer.avatarUrl}
          name={photographer.displayName}
          size={128}
          decorative
        />

        <div className="min-w-0 flex-1">
          <Eyebrow>{common('photographer')}</Eyebrow>

          <h1 className="mt-3 text-section-fluid font-bold break-words">
            {photographer.displayName}
          </h1>

          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-muted">
            <span className="font-semibold">@{photographer.username}</span>
            {photographer.basedIn ? (
              <>
                <span aria-hidden>·</span>
                {/* Member-written, so it is shown as they wrote it. */}
                <span>{photographer.basedIn}</span>
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

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
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

            <ReportDialog
              subjectType="profile"
              subjectId={photographer.id}
              subjectLabel={`@${photographer.username}`}
              triggerLabel={t('reportAccount')}
              triggerVariant="ghost"
              className="md:ml-auto"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
