import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { isDemoMode } from '@/lib/config';
import { cn } from '@/lib/utils';

/**
 * The notice that says, on every page, that the content is a bundled sample.
 *
 * It is not an alarm: an unconfigured deployment is a normal state for this
 * project, and the right response is a plain sentence, not a red banner. It says
 * the same thing in both languages, as a single ICU sentence with its variable
 * inside it — Thai puts no space between a variable and the word after it, which
 * only the message file can know and which string concatenation here would get
 * wrong.
 *
 * Its sibling, `CapabilityNotice`, lives in its own file because it has to be a
 * client component; the comment there explains why.
 */

export async function DemoNotice({
  className,
  context,
}: {
  className?: string;
  context?: string;
}): Promise<ReactElement | null> {
  if (!isDemoMode()) return null;

  const t = await getTranslations('common');

  return (
    <aside
      aria-label={t('demoMode.eyebrow')}
      className={cn('border-b border-line bg-surface-sunken', className)}
    >
      <div className="site-container flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
        <span className="text-eyebrow text-muted uppercase">{t('demoMode.eyebrow')}</span>
        <p className="text-caption text-ink-soft">
          {t('demoMode.body', { context: context ?? t('demoMode.thisPage') })}
        </p>
      </div>
    </aside>
  );
}
