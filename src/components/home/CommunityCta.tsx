import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CapabilityNotice } from '@/components/system/CapabilityNotice';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import type { Locale } from '@/i18n/locales';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The closing invitation.
 *
 * The call to action points at a real route either way, and the capability
 * notice says plainly when this deployment cannot yet accept an account or an
 * upload — a button that looks real and quietly fails is worse than a sentence
 * explaining what is missing.
 *
 * `uploadCapability` and `joinCapability` are the subject the notice puts in
 * front of "is unavailable in this deployment". They are translated here
 * because they are this section's copy, and the Thai forms are noun phrases
 * (การอัปโหลด…, การสร้าง…) so they read correctly in the Thai sentence pattern
 * `common.capabilityMissing.title` already carries. CapabilityNotice itself
 * still renders its frame in English — it is shared across the app and belongs
 * to another part of this work — so in Thai that notice currently reads as a
 * Thai subject inside an English sentence. That is visible and recorded, and it
 * resolves the moment the notice reads its own messages.
 */
export async function CommunityCta({
  signedIn,
  locale,
  className,
}: {
  signedIn: boolean;
  locale: Locale;
  className?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <section className={cn('mt-14 border-t border-line pt-10', className)}>
      <SectionHead
        eyebrow={t('cta.eyebrow')}
        title={t('cta.title')}
        action={
          <Button asChild>
            <Link href={signedIn ? '/upload' : '/join'}>
              {signedIn ? t('cta.uploadAction') : t('cta.joinAction')}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </Button>
        }
      />

      <p className="max-w-[610px] text-body text-muted">{t('cta.body')}</p>

      <CapabilityNotice
        capability={signedIn ? 'uploads' : 'auth'}
        action={signedIn ? t('cta.uploadCapability') : t('cta.joinCapability')}
        className="mt-6 max-w-[610px]"
      />
    </section>
  );
}
