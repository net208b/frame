'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { setMemberRole, type StaffRole } from '@/server/actions/roles';

/**
 * Appoint or remove a member of staff by username.
 *
 * The form only collects the two values; set_member_role() decides. Whatever
 * the database refuses comes back as its own sentence and is shown here,
 * beside the field it concerns when there is one.
 */
export function RoleForm({ initialUsername = '' }: { initialUsername?: string }) {
  const t = useTranslations('moderation.team');
  const toast = useToast();
  const router = useRouter();

  const [username, setUsername] = useState(initialUsername);
  const [role, setRole] = useState<StaffRole>('moderator');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldError(null);

    try {
      const result = await setMemberRole({ username: username.replace(/^@/, ''), role });
      if (result.ok) {
        toast.show(result.message ?? t('saved'), 'success');
        setUsername('');
        router.refresh();
        return;
      }
      setError(result.error);
      setFieldError(result.fieldErrors?.username ?? null);
      toast.show(result.error, 'danger');
    } catch {
      setError(t('transportFailure'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <TextField
          label={t('usernameLabel')}
          hint={t('usernameHint')}
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          error={fieldError}
        />
        <SelectField
          label={t('roleLabel')}
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as StaffRole)}
        >
          <option value="moderator">{t('roles.moderator')}</option>
          <option value="admin">{t('roles.admin')}</option>
          <option value="member">{t('roles.member')}</option>
        </SelectField>
      </div>

      {error && !fieldError ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || username.trim().length === 0}>
          {pending ? t('saving') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
