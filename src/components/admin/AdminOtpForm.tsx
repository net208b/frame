'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useToast } from '@/components/system/Toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useRouter } from '@/i18n/navigation';
import { requestAdminCode, verifyAdminCode } from '@/server/actions/admin-auth';

/**
 * Two steps: an address, then the six-digit code the email carries. The
 * server decides whether the address is an admin's and says nothing either
 * way; the page simply moves to the code step.
 */
export function AdminOtpForm() {
  const t = useTranslations('admin.login');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);

  function send() {
    startTransition(async () => {
      const result = await requestAdminCode({ email });
      if (result.ok) {
        setError(null);
        setStep('code');
      } else {
        setError(result.error);
      }
    });
  }

  function verify() {
    startTransition(async () => {
      const result = await verifyAdminCode({ email, code });
      if (result.ok) {
        toast.show(t('signedIn'), 'success');
        router.push('/adminnet208b');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (step === 'email') {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="space-y-5"
      >
        <TextField
          label={t('emailLabel')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          error={error}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button type="submit" loading={pending} className="w-full">
          {t('send')}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        verify();
      }}
      className="space-y-5"
    >
      <p className="text-body leading-relaxed text-ink-soft">{t('sent', { email })}</p>
      <TextField
        label={t('codeLabel')}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        error={error}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        className="text-center text-title tracking-[0.4em]"
        required
      />
      <Button type="submit" loading={pending} className="w-full">
        {t('verify')}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep('email');
          setCode('');
          setError(null);
        }}
        className="block w-full text-center text-caption font-semibold text-muted hover:text-ink"
      >
        {t('startOver')}
      </button>
    </form>
  );
}
