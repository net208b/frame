'use client';

import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { CATEGORY_LABELS, PHOTO_CATEGORIES, type PhotoCategory } from '@/types/domain';

import type { UploadDraft } from './use-upload-draft';

/**
 * Step 2 — what the photograph is.
 *
 * Alt text is required and the wizard will not move past it. The gallery is
 * almost nothing but images, so an image with no alt text is an image a
 * screen-reader user simply cannot see. It is also why nothing here is
 * generated: a description written by whoever made the frame is the only one
 * worth hearing.
 */

const TITLE_MAX = 120;
const ALT_MIN = 10;
const ALT_MAX = 280;
const DESCRIPTION_MAX = 2_000;

export function StepDescribe({ draft }: { draft: UploadDraft }) {
  const { state, errors } = draft;
  const altLength = state.altText.trim().length;

  return (
    <div>
      <h2 className="text-section font-bold">Describe the frame</h2>
      <p className="mt-2 max-w-prose text-body text-muted">
        A title, a category, and the alt text a screen reader will read aloud. The description is
        optional and is where the story behind the frame goes.
      </p>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <TextField
          label="Title"
          required
          value={state.title}
          maxLength={TITLE_MAX}
          onChange={(event) => draft.update({ title: event.target.value })}
          error={errors.title}
          hint={`Up to ${TITLE_MAX} characters. This becomes the photograph's web address.`}
          placeholder="After the last train"
          autoComplete="off"
        />

        <SelectField
          label="Category"
          required
          value={state.category}
          onChange={(event) =>
            draft.update({ category: event.target.value as PhotoCategory | '' })
          }
          error={errors.category}
          hint="One category per photograph. It decides which filters this frame appears under."
        >
          <option value="">Choose a category</option>
          {PHOTO_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </SelectField>
      </div>

      <TextAreaField
        label="Alt text"
        required
        wrapperClassName="mt-6"
        value={state.altText}
        maxLength={ALT_MAX}
        rows={3}
        onChange={(event) => draft.update({ altText: event.target.value })}
        error={errors.altText}
        hint={
          <>
            This is what a screen-reader user hears instead of seeing the photograph, so describe
            what is in the frame rather than how it makes you feel. Between {ALT_MIN} and {ALT_MAX}{' '}
            characters — {altLength} so far.
          </>
        }
        placeholder="A woman crosses an empty street under a row of shuttered shopfronts, lit by a single vending machine."
      />

      <TextAreaField
        label="Description"
        wrapperClassName="mt-6"
        value={state.description}
        maxLength={DESCRIPTION_MAX}
        rows={5}
        onChange={(event) => draft.update({ description: event.target.value })}
        error={errors.description}
        hint="Optional. How you found the frame, what you waited for, what you would do differently."
        placeholder="I had walked past this junction four nights running before the shutters and the rain lined up."
      />
    </div>
  );
}
