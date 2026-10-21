'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { setEditorsPick } from '@/server/actions/editorial';

/**
 * The editors' lever on a photograph page. Shown only to staff and only on a
 * published photograph — the same two things set_editors_pick() checks.
 */
export function EditorsPickControl({
  photographId,
  slug,
  picked,
}: {
  photographId: string;
  slug: string;
  picked: boolean;
}) {
  const t = useTranslations('features.pick');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(picked);

  function toggle() {
    const next = !current;
    startTransition(async () => {
      const result = await setEditorsPick({ photographId, slug, pick: next });
      if (result.ok) {
        setCurrent(next);
        toast.show(result.message ?? (next ? t('picked') : t('unpicked')), 'success');
        router.refresh();
      } else {
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <div>
      <p className="text-meta leading-relaxed text-muted">{t('intro')}</p>
      <Button
        variant={current ? 'secondary' : 'primary'}
        size="sm"
        className="mt-3"
        loading={pending}
        iconLeft={<Star className="size-3.5" aria-hidden />}
        onClick={toggle}
      >
        {current ? t('remove') : t('add')}
      </Button>
    </div>
  );
}
