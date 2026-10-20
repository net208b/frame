import { getTranslations } from 'next-intl/server';

import { RoleForm } from '@/components/moderation/RoleForm';
import { Avatar } from '@/components/photographer/Avatar';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { StaffMember } from '@/types/domain';

/**
 * The team: who can review, and who can appoint.
 *
 * Rendered for administrators only. The list is read from profiles.role and
 * the form writes through set_member_role(), which refuses anyone else — so
 * this panel being hidden from moderators is a tidiness, not the protection.
 */

const PERMISSIONS = ['upload', 'review', 'places', 'suspendMembers', 'suspendStaff', 'appoint'] as const;
const GRANTED: Record<'member' | 'moderator' | 'admin', ReadonlySet<(typeof PERMISSIONS)[number]>> = {
  member: new Set(['upload']),
  moderator: new Set(['upload', 'review', 'places', 'suspendMembers']),
  admin: new Set(PERMISSIONS),
};
const ROLE_COLUMNS = ['member', 'moderator', 'admin'] as const;

export async function TeamPanel({
  locale,
  staff,
  viewerId,
}: {
  locale: Locale;
  staff: readonly StaffMember[];
  viewerId: string | null;
}) {
  const t = await getTranslations({ locale, namespace: 'moderation.team' });

  return (
    <section aria-labelledby="queue-team" className="flex flex-col gap-12">
      <div>
        <SectionHead
          eyebrow={t('eyebrow')}
          title={<span id="queue-team">{t('title')}</span>}
          description={t('description')}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <caption className="sr-only">{t('matrixCaption')}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-3 pr-4 text-meta font-bold text-muted">
                  {t('matrix.can')}
                </th>
                {ROLE_COLUMNS.map((role) => (
                  <th key={role} scope="col" className="py-3 pr-4 text-center text-meta font-bold text-ink">
                    {t(`roles.${role}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-3 pr-4 text-caption font-medium text-ink-soft">
                    {t(`matrix.${permission}`)}
                  </th>
                  {ROLE_COLUMNS.map((role) => {
                    const granted = GRANTED[role].has(permission);
                    return (
                      <td key={role} className="py-3 pr-4 text-center text-caption">
                        <span aria-hidden className={granted ? 'font-bold text-success' : 'text-muted-soft'}>
                          {granted ? '✓' : '—'}
                        </span>
                        <span className="sr-only">{granted ? t('matrix.yes') : t('matrix.no')}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-title font-bold">{t('staffTitle')}</h3>
        {staff.length === 0 ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} className="mt-4" />
        ) : (
          <ul className="mt-4 border-t border-line">
            {staff.map(({ member, role }) => (
              <li key={member.id} className="flex items-center gap-3 border-b border-line py-3.5">
                <Avatar src={member.avatarUrl} name={member.displayName} size={32} decorative />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/photographers/${member.username}`}
                    className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                  >
                    {member.displayName}
                  </Link>
                  <span className="ml-2 text-meta text-muted">@{member.username}</span>
                  {member.id === viewerId ? (
                    <span className="ml-2 text-meta text-muted">{t('you')}</span>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'rounded-pill px-2.5 py-1 text-meta font-bold',
                    role === 'admin' ? 'bg-ink text-on-ink' : 'bg-surface-sunken text-ink-soft',
                  )}
                >
                  {t(`roles.${role}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="max-w-[40rem]">
        <h3 className="text-title font-bold">{t('changeTitle')}</h3>
        <p className="mt-2 mb-5 text-caption leading-relaxed text-muted">{t('changeDescription')}</p>
        <RoleForm />
      </div>
    </section>
  );
}
