import { getLocale, getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/photographer/Avatar';
import { Link } from '@/i18n/navigation';
import { cn, formatCount, formatMonthYear, truncate } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

/** Shown only for a moderator or an admin, because it changes what they can do. */
const ROLE_PILL =
  'mt-2 inline-flex items-center rounded-pill border border-line px-2 py-1 text-eyebrow uppercase text-muted';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-eyebrow uppercase text-muted-soft">{label}</dt>
      <dd className="mt-1 text-body font-bold tabular-nums">{value}</dd>
    </div>
  );
}

export async function PhotographerCard({
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
   * The card has less room than the profile masthead, so it uses the short
   * forms of the role names. In Thai the short form is the one people say
   * ("ผู้ดูแล", "แอดมิน"); the written-out English pair would not fit here.
   */
  const role =
    photographer.role === 'moderator'
      ? t('roleShort.moderator')
      : photographer.role === 'admin'
        ? t('roleShort.admin')
        : null;

  const memberSince = formatMonthYear(photographer.memberSince, locale);

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-card border border-line bg-surface p-5',
        'transition-colors duration-150 hover:border-line-strong',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar src={photographer.avatarUrl} name={photographer.displayName} size={48} decorative />

        <div className="min-w-0">
          {/*
            `tracking-tight` rather than a literal -0.035em: the Thai block in
            globals.css neutralises the tracking tokens, and an arbitrary value
            would have survived it and collided the vowel marks of a Thai
            display name.
          */}
          <h3 className="text-body font-bold tracking-tight">
            <Link
              href={`/photographers/${photographer.username}`}
              className="before:absolute before:inset-0 before:content-['']"
            >
              {photographer.displayName}
            </Link>
          </h3>

          <p className="mt-1 truncate text-meta text-muted">
            @{photographer.username}
            {photographer.basedIn ? ` · ${photographer.basedIn}` : ''}
          </p>

          {role ? (
            <span className={ROLE_PILL}>{role}</span>
          ) : null}
        </div>
      </div>

      {photographer.biography ? (
        <p className="mt-4 text-caption text-muted">{truncate(photographer.biography, 150)}</p>
      ) : null}

      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
        <Stat
          label={common('photographs')}
          value={formatCount(photographer.photographCount, locale)}
        />
        <Stat
          label={t('stats.appreciations')}
          value={formatCount(photographer.appreciationsReceived, locale)}
        />
        <Stat
          label={t('stats.locations')}
          value={formatCount(photographer.locationsContributed, locale)}
        />
      </dl>

      {memberSince ? (
        <p className="mt-4 text-meta text-muted-soft">{t('memberSince', { month: memberSince })}</p>
      ) : null}
    </article>
  );
}
