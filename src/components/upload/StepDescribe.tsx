'use client';

import { useTranslations } from 'next-intl';

import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { PHOTO_CATEGORIES, type PhotoCategory } from '@/types/domain';

import type { UploadDraft } from './use-upload-draft';

/**
 * Step 2 — what the photograph is.
 *
 * Alt text is required and the wizard will not move past it. The gallery is
 * almost nothing but images, so an image with no alt text is an image a
 * screen-reader user simply cannot see. It is also why nothing here is
 * generated: a description written by whoever made the frame is the only one
 * worth hearing. The hint says both of those things, and says them in full in
 * both languages — it is the obligation the step exists for, not decoration.
 *
 * The category names come from the shared `taxonomy` namespace rather than from
 * `CATEGORY_LABELS`: a category is the same word on Discover, on a photograph
 * and in this dropdown, so it is translated once for the whole app.
 */

const TITLE_MAX = 120;
const ALT_MIN = 10;
const ALT_MAX = 280;
const DESCRIPTION_MAX = 2_000;

export function StepDescribe({ draft }: { draft: UploadDraft }) {
  const t = useTranslations('upload');
  const taxonomy = useTranslations('taxonomy');
  const { state, errors } = draft;
  const altLength = state.altText.trim().length;

  return (
    <div>
      <h2 className="text-section font-bold">{t('describe.heading')}</h2>
      <p className="mt-2 max-w-prose text-body text-muted">{t('describe.lead')}</p>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <TextField
          label={t('describe.titleLabel')}
          required
          value={state.title}
          maxLength={TITLE_MAX}
          onChange={(event) => draft.update({ title: event.target.value })}
          error={errors.title}
          hint={t('describe.titleHint', { max: TITLE_MAX })}
          placeholder={t('describe.titlePlaceholder')}
          autoComplete="off"
        />

        <SelectField
          label={t('describe.categoryLabel')}
          required
          value={state.category}
          onChange={(event) =>
            draft.update({ category: event.target.value as PhotoCategory | '' })
          }
          error={errors.category}
          hint={t('describe.categoryHint')}
        >
          <option value="">{t('describe.categoryEmpty')}</option>
          {PHOTO_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {taxonomy(`category.${category}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <TextAreaField
        label={t('describe.altTextLabel')}
        required
        wrapperClassName="mt-6"
        value={state.altText}
        maxLength={ALT_MAX}
        rows={3}
        onChange={(event) => draft.update({ altText: event.target.value })}
        error={errors.altText}
        hint={t('describe.altTextHint', { min: ALT_MIN, max: ALT_MAX, count: altLength })}
        placeholder={t('describe.altTextPlaceholder')}
      />

      <TextAreaField
        label={t('describe.descriptionLabel')}
        wrapperClassName="mt-6"
        value={state.description}
        maxLength={DESCRIPTION_MAX}
        rows={5}
        onChange={(event) => draft.update({ description: event.target.value })}
        error={errors.description}
        hint={t('describe.descriptionHint')}
        placeholder={t('describe.descriptionPlaceholder')}
      />
    </div>
  );
}
