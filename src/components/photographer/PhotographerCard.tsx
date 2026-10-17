import Link from 'next/link';

import { Avatar } from '@/components/photographer/Avatar';
import { cn, formatCount, formatMonthYear, truncate } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

const ROLE_LABELS: Record<PhotographerProfile['role'], string | null> = {
  member: null,
  moderator: 'Moderator',
  admin: 'Admin',
};

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

export function PhotographerCard({
  photographer,
  className,
}: {
  photographer: PhotographerProfile;
  className?: string;
}) {
  const role = ROLE_LABELS[photographer.role];
  const memberSince = formatMonthYear(photographer.memberSince);

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
          <h3 className="text-body font-bold tracking-[-0.035em]">
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
        <Stat label="Photographs" value={formatCount(photographer.photographCount)} />
        <Stat label="Appreciations" value={formatCount(photographer.appreciationsReceived)} />
        <Stat label="Locations" value={formatCount(photographer.locationsContributed)} />
      </dl>

      {memberSince ? (
        <p className="mt-4 text-meta text-muted-soft">Member since {memberSince}</p>
      ) : null}
    </article>
  );
}
