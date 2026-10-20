'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { keepTypedValues } from '@/components/account/keep-typed-values';
import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Link } from '@/i18n/navigation';
import { PROFILE_LIMITS } from '@/lib/validation/account';
import { updateProfile } from '@/server/actions/account';

/**
 * The fields of the public profile a member writes themselves.
 *
 * Not the avatar: there is no way to upload one yet, and taking a URL instead
 * would put an image from any server on the internet onto FRAME's pages — and a
 * request to that server into every visitor's browser. The page says so rather
 * than offering a field that would do that.
 *
 * Fields are uncontrolled with their saved values as defaults, so the form
 * works before hydration. A failed save keeps what was typed because the
 * submission goes through `keepTypedValues`: left to itself React 19 resets
 * every field once the action returns, refused or not.
 */

type FormState = Awaited<ReturnType<typeof updateProfile>> | null;

export interface ProfileFormValues {
  displayName: string;
  biography: string;
  basedIn: string;
  website: string;
  gear: string;
}

export function ProfileForm({
  username,
  initial,
  disabled = false,
}: {
  username: string;
  initial: ProfileFormValues;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateProfile, null);
  const t = useTranslations('account');
  const errorFor = useFieldErrors(state);

  return (
    <form action={formAction} onSubmit={keepTypedValues(formAction)} className="space-y-6">
      <FormStatus state={state}>
        {state?.ok ? (
          <FormSuccess title={state.message ?? ''}>
            <Link
              href={`/photographers/${username}`}
              className="font-semibold text-ink underline underline-offset-2"
            >
              {t('profile.viewProfile')}
            </Link>
          </FormSuccess>
        ) : null}
      </FormStatus>

      <fieldset disabled={disabled} className="space-y-6">
        <TextField
          label={t('profile.displayName')}
          name="displayName"
          autoComplete="name"
          maxLength={60}
          required
          defaultValue={initial.displayName}
          hint={t('profile.displayNameHint')}
          error={errorFor('displayName')}
        />

        <TextAreaField
          label={t('profile.biography')}
          name="biography"
          rows={5}
          maxLength={PROFILE_LIMITS.biography}
          defaultValue={initial.biography}
          hint={t('profile.biographyHint', { max: PROFILE_LIMITS.biography })}
          error={errorFor('biography')}
        />

        <TextField
          label={t('profile.basedIn')}
          name="basedIn"
          autoComplete="off"
          maxLength={PROFILE_LIMITS.basedIn}
          defaultValue={initial.basedIn}
          hint={t('profile.basedInHint')}
          error={errorFor('basedIn')}
        />

        <TextField
          label={t('profile.website')}
          name="website"
          // text, not url: type="url" refuses "example.com", which the action
          // accepts and reads as https://example.com.
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={initial.website}
          hint={t('profile.websiteHint')}
          error={errorFor('website')}
        />

        <TextAreaField
          label={t('profile.gear')}
          name="gear"
          rows={4}
          defaultValue={initial.gear}
          hint={t('profile.gearHint', {
            count: PROFILE_LIMITS.gearItems,
            length: PROFILE_LIMITS.gearItemLength,
          })}
          error={errorFor('gear')}
        />

        <p className="text-caption text-muted">{t('profile.avatarNote')}</p>

        <Button type="submit" size="lg" loading={pending}>
          {pending ? t('profile.submitPending') : t('profile.submit')}
        </Button>
      </fieldset>
    </form>
  );
}
