'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { keepTypedValues } from '@/components/account/keep-typed-values';
import { FormStatus, FormSuccess, useFieldErrors } from '@/components/auth/AuthStatus';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Link } from '@/i18n/navigation';
import type { CountryOption } from '@/lib/geo/countries';
import { PROFILE_LIMITS } from '@/lib/validation/account';
import { updateProfile } from '@/server/actions/account';
import {
  COLLABORATION_STATUSES,
  CRITIQUE_PREFERENCES,
  PHOTOGRAPHY_STYLES,
} from '@/types/domain';

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
  /** ISO 3166-1 alpha-2, or '' for "not set". */
  countryCode: string;
  website: string;
  /** One link per line, as the field shows them. */
  socialLinks: string;
  /** The styles already ticked. */
  styles: string[];
  /** The photograph already chosen as the cover, by id, or ''. */
  coverPhotographId: string;
  collaboration: string;
  critique: string;
  gear: string;
}

export function ProfileForm({
  username,
  initial,
  countries,
  coverCandidates,
  disabled = false,
}: {
  username: string;
  initial: ProfileFormValues;
  /**
   * Every country, named in the reader's language and sorted for them. Built on
   * the server (see `countryOptions`) so the options are in the HTML and the
   * field works before hydration, like every other field here.
   */
  countries: readonly CountryOption[];
  /**
   * The member's own published photographs, newest first — the only frames a
   * cover may be. An empty list means there is nothing to choose from yet, and
   * the field says so instead of offering an empty select.
   */
  coverCandidates: readonly { id: string; title: string }[];
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateProfile, null);
  const t = useTranslations('account');
  // The three vocabularies are FRAME's own words and appear on the public
  // profile as well, so one copy of them lives in `common`.
  const vocabulary = useTranslations('common');
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
        {coverCandidates.length > 0 ? (
          <SelectField
            label={t('profile.cover')}
            name="coverPhotographId"
            defaultValue={initial.coverPhotographId}
            hint={t('profile.coverHint')}
            error={errorFor('coverPhotographId')}
          >
            <option value="">{t('profile.coverUnset')}</option>
            {coverCandidates.map((photograph) => (
              <option key={photograph.id} value={photograph.id}>
                {photograph.title}
              </option>
            ))}
          </SelectField>
        ) : (
          <>
            {/*
              Nothing published yet, so there is nothing a cover could be. The
              hidden field keeps the saved value — there should not be one, but
              a form that silently clears a column it did not show would be the
              kind of bug nobody notices until the frame comes back.
            */}
            <input type="hidden" name="coverPhotographId" value={initial.coverPhotographId} />
            <p className="text-caption text-muted">{t('profile.coverNone')}</p>
          </>
        )}

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

        <SelectField
          label={t('profile.country')}
          name="countryCode"
          defaultValue={initial.countryCode}
          hint={t('profile.countryHint')}
          error={errorFor('countryCode')}
        >
          {/* First and selected by default: a member who has not said which
              country they work from has not said it, and the field must be able
              to go back to that. */}
          <option value="">{t('profile.countryUnset')}</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </SelectField>

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
          label={t('profile.socialLinks')}
          name="socialLinks"
          rows={4}
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={initial.socialLinks}
          hint={t('profile.socialLinksHint', { count: PROFILE_LIMITS.socialLinks })}
          error={errorFor('socialLinks')}
        />

        {/*
          A group of checkboxes, not a multiple select: a member picking how they
          shoot is reading a short list of words and ticking the ones that are
          true, and a multiple select hides most of the list and needs a modifier
          key to use. The name carries `[]` so one tick arrives as an array,
          which is the convention `parseForm` documents.
        */}
        <fieldset>
          <legend className="mb-1.5 block text-meta font-bold text-ink">
            {t('profile.styles')}
          </legend>
          <p className="mb-3 text-meta leading-relaxed text-muted">
            {t('profile.stylesHint', { count: PROFILE_LIMITS.styles })}
          </p>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {PHOTOGRAPHY_STYLES.map((style) => (
              <CheckboxField
                key={style}
                name="styles[]"
                value={style}
                defaultChecked={initial.styles.includes(style)}
                label={vocabulary(`photographyStyles.${style}`)}
              />
            ))}
          </div>

          {errorFor('styles') ? (
            <p className="mt-2 text-meta font-semibold text-danger">{errorFor('styles')}</p>
          ) : null}
        </fieldset>

        <SelectField
          label={t('profile.collaboration')}
          name="collaboration"
          defaultValue={initial.collaboration}
          hint={t('profile.collaborationHint')}
          error={errorFor('collaboration')}
        >
          <option value="">{t('profile.collaborationUnset')}</option>
          {COLLABORATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {vocabulary(`collaboration.${status}`)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={t('profile.critique')}
          name="critique"
          defaultValue={initial.critique}
          // Says plainly that FRAME has nothing to enforce this with. The
          // database comment on the column says the same thing: it is a sentence
          // to other members, and a field that implied otherwise would be a
          // promise this project does not make.
          hint={t('profile.critiqueHint')}
          error={errorFor('critique')}
        >
          <option value="">{t('profile.critiqueUnset')}</option>
          {CRITIQUE_PREFERENCES.map((preference) => (
            <option key={preference} value={preference}>
              {vocabulary(`critique.${preference}`)}
            </option>
          ))}
        </SelectField>

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
