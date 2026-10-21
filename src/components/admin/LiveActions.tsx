'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import { actOnUpload, setLocationPrecision, takeDownLocation } from '@/server/actions/moderation';
import { PIN_PRECISIONS, type PinPrecision } from '@/types/domain';

/**
 * The buttons on a published item. Each one opens a small box for the reason
 * (which the member reads) and then calls the moderation desk's own action,
 * so the undo of an approval goes through the same checks and audit trail as
 * the approval did.
 */

export function PhotographLiveActions({ photographId, title }: { photographId: string; title: string }) {
  const t = useTranslations('admin.live');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'idle' | 'sendBack' | 'takeDown'>('idle');
  const [reason, setReason] = useState('');

  function run(decision: 'request_changes' | 'remove_content') {
    startTransition(async () => {
      const result = await actOnUpload({ photographId, decision, reason });
      if (result.ok) {
        toast.show(result.message ?? t('done'), 'success');
        setMode('idle');
        setReason('');
        router.refresh();
      } else {
        toast.show(result.error, 'danger');
      }
    });
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMode('sendBack')}>{t('sendBack')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setMode('takeDown')}>{t('takeDown')}</Button>
      </div>
    );
  }

  const sendBack = mode === 'sendBack';
  return (
    <div className="rounded-card border border-line bg-surface-sunken p-3">
      <p className="text-meta leading-relaxed text-ink-soft">{sendBack ? t('sendBackEffect') : t('takeDownEffect')}</p>
      <TextAreaField
        label={t('reasonLabel', { title })}
        hideLabel
        placeholder={t('reasonPlaceholder')}
        value={reason}
        rows={3}
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
        wrapperClassName="mt-2"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant={sendBack ? 'primary' : 'danger'} loading={pending} disabled={reason.trim().length === 0}
          onClick={() => run(sendBack ? 'request_changes' : 'remove_content')}>
          {sendBack ? t('sendBackConfirm') : t('takeDownConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>{t('cancel')}</Button>
      </div>
    </div>
  );
}

export function LocationLiveActions({
  locationId,
  name,
  pinPrecision,
}: {
  locationId: string;
  name: string;
  pinPrecision: PinPrecision;
}) {
  const t = useTranslations('admin.live');
  const tPrecision = useTranslations('moderation.form.coordinatePrivacy.options');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [precision, setPrecision] = useState<PinPrecision>(pinPrecision);
  const [takingDown, setTakingDown] = useState(false);
  const [reason, setReason] = useState('');

  function savePrecision(next: PinPrecision) {
    setPrecision(next);
    startTransition(async () => {
      const result = await setLocationPrecision({ locationId, pinPrecision: next });
      if (result.ok) {
        toast.show(result.message ?? t('done'), 'success');
        router.refresh();
      } else {
        setPrecision(pinPrecision);
        toast.show(result.error, 'danger');
      }
    });
  }

  function takeDown() {
    startTransition(async () => {
      const result = await takeDownLocation({ locationId, reason });
      if (result.ok) {
        toast.show(result.message ?? t('done'), 'success');
        setTakingDown(false);
        router.refresh();
      } else {
        toast.show(result.error, 'danger');
      }
    });
  }

  return (
    <div className="space-y-2">
      <label className="flex flex-wrap items-center gap-2 text-caption">
        <span className="font-semibold text-ink-soft">{t('precision')}</span>
        <select
          value={precision}
          disabled={pending}
          onChange={(event) => savePrecision(event.target.value as PinPrecision)}
          className="h-9 rounded-card border border-line bg-paper px-2 text-caption"
        >
          {PIN_PRECISIONS.map((option) => (
            <option key={option} value={option}>{tPrecision(`${option}.label`)}</option>
          ))}
        </select>
      </label>
      {takingDown ? (
        <div className="rounded-card border border-line bg-surface-sunken p-3">
          <p className="text-meta leading-relaxed text-ink-soft">{t('takeDownPlaceEffect')}</p>
          <TextAreaField label={t('reasonLabel', { title: name })} hideLabel placeholder={t('reasonPlaceholder')}
            value={reason} rows={2} maxLength={1000} onChange={(event) => setReason(event.target.value)} wrapperClassName="mt-2" />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" loading={pending} disabled={reason.trim().length === 0} onClick={takeDown}>
              {t('takeDownConfirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTakingDown(false)}>{t('cancel')}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setTakingDown(true)}>{t('takeDownPin')}</Button>
      )}
    </div>
  );
}
