'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useRouter } from '@/i18n/navigation';
import { deleteOwnPhotograph } from '@/server/actions/upload';

/**
 * The owner's way to take one of their photographs off FRAME for good.
 *
 * Shown only to the owner; the action checks ownership again on the server.
 * The confirmation says plainly what goes with it, because there is no undo.
 */
export function DeletePhotograph({
  photographId,
  title,
  ownerUsername,
}: {
  photographId: string;
  title: string;
  ownerUsername: string;
}) {
  const t = useTranslations('photo.delete');
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const result = await deleteOwnPhotograph({ photographId });
      if (result.ok) {
        setOpen(false);
        toast.show(t('done'), 'success');
        // replace alone: a refresh() straight after re-renders the page being
        // left and wins the race, so the owner stayed on a deleted photograph.
        // The profile is rendered on demand, so it arrives without the photograph.
        router.replace(`/photographers/${ownerUsername}`);
        return;
      }
      setOpen(false);
      setError(result.error);
      toast.show(result.error, 'danger');
    } catch {
      setOpen(false);
      setError(t('transportFailure'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <p className="text-meta leading-relaxed text-muted">{t('intro')}</p>
      <Button variant="danger" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        {t('trigger')}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('confirmTitle', { title })}
        body={t('confirmBody')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onConfirm={confirm}
        pending={pending}
      />
    </div>
  );
}
