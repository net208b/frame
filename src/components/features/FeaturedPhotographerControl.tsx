'use client';

import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { setFeaturedPhotographer } from '@/server/actions/editorial';

/** profiles_feature_note_length (0046). */
const NOTE_MAX = 400;

/**
 * The editors' lever on a photographer's page, shown only to staff.
 *
 * Unlike the editor's pick next to it, this one cannot be a single button: the
 * reason is part of the decision, and set_featured_photographer() refuses a
 * feature without one. So featuring is a short form, and unfeaturing is the
 * button — a removal needs no justification written for the public, and the
 * trail records it either way.
 *
 * The note is the editor's own words and is NOT translated anywhere: it is
 * attributed writing, and putting it through a machine would make it somebody
 * else's sentence under an editor's name.
 */
export function FeaturedPhotographerControl({
  profileId,
  username,
  featured,
  note,
}: {
  profileId: string;
  username: string;
  featured: boolean;
  /** The note in force, so an editor edits what is published rather than retyping it. */
  note: string | null;
}) {
  const t = useTranslations('features.feature');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(featured);
  const [draft, setDraft] = useState(note ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  const remaining = NOTE_MAX - draft.trim().length;

  function save(nextFeatured: boolean) {
    setProblem(null);
    startTransition(async () => {
      const result = await setFeaturedPhotographer({
        profileId,
        username,
        featured: nextFeatured,
        note: nextFeatured ? draft : undefined,
      });
      if (result.ok) {
        setCurrent(nextFeatured);
        if (!nextFeatured) setDraft('');
        toast.show(result.message ?? t('saved'), 'success');
        router.refresh();
      } else {
        // The action reports a bad note against the field; anything else is a
        // refusal to say out loud.
        setProblem(result.fieldErrors?.note ?? null);
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <div>
      <h2 className="text-caption font-semibold text-ink">{t('heading')}</h2>
      <p className="mt-2 max-w-prose text-meta leading-relaxed text-muted">{t('intro')}</p>

      <label className="mt-4 block max-w-prose">
        <span className="text-meta font-semibold text-ink-soft">{t('noteLabel')}</span>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder={t('notePlaceholder')}
          aria-describedby="feature-note-help"
          className="mt-2 w-full rounded-panel border border-line bg-surface px-3 py-2 text-caption leading-relaxed text-ink"
        />
        <span id="feature-note-help" className="mt-1 block text-meta text-muted tabular-nums">
          {problem ?? t('noteRemaining', { count: Math.max(0, remaining) })}
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={pending}
          iconLeft={<BadgeCheck className="size-3.5" aria-hidden />}
          onClick={() => save(true)}
        >
          {current ? t('update') : t('add')}
        </Button>
        {current ? (
          <Button variant="secondary" size="sm" loading={pending} onClick={() => save(false)}>
            {t('remove')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
