import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

import { Notice } from '@/components/ui/states';
import { capabilities, isDemoMode } from '@/lib/config';
import { cn } from '@/lib/utils';

/**
 * The two notices that keep the product honest about what it can actually do.
 *
 * {@link DemoNotice} says, on every page, that the content is a bundled sample.
 * {@link CapabilityNotice} says which environment variable is missing when a
 * viewer reaches an action this deployment cannot perform. Neither is an alarm:
 * an unconfigured deployment is a normal state for this project, and the right
 * response is a plain sentence, not a red banner.
 *
 * Both say the same thing in both languages, because an honest message that
 * only half the readers can read is not an honest message. Each is a single
 * ICU sentence with its variables inside it — Thai puts no space between a
 * variable and the word after it, which is a thing only the message file can
 * know and a thing string concatenation in this file would get wrong.
 */

type Capability = 'database' | 'auth' | 'uploads' | 'maps';

const CODE_CLASS = 'font-mono text-[0.95em] font-semibold';

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

/**
 * What each capability needs, and which variables turn it on.
 *
 * The variable names and the documentation paths are not translated: they are
 * identifiers, and a reader who has to set `NEXT_PUBLIC_SUPABASE_URL` needs to
 * see exactly that string. The one translated part is the subject — what the
 * capability actually needs in prose — which is read from the message
 * catalogue by the key below.
 */
const CAPABILITY_COPY: Record<Capability, { variables: string[]; extraDoc?: string }> = {
  database: {
    variables: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
  auth: {
    variables: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
  uploads: {
    variables: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'STORAGE_BUCKET',
    ],
  },
  maps: {
    variables: ['NEXT_PUBLIC_MAP_STYLE_URL'],
    extraDoc: 'docs/EXTERNAL-SERVICES.md',
  },
};

export async function CapabilityNotice({
  capability,
  action,
  className,
}: {
  capability: Capability;
  /**
   * What the viewer was trying to do, as a phrase that starts the sentence —
   * "Publishing a photograph", "The map". It comes from the calling page,
   * which is the only thing that knows, and which is responsible for passing
   * it in the active language.
   */
  action: string;
  className?: string;
}): Promise<ReactElement | null> {
  if (capabilities()[capability]) return null;

  const [t, format] = await Promise.all([getTranslations('common'), getFormatter()]);
  const copy = CAPABILITY_COPY[capability];

  // Through Intl, so the separators are the ones the active language uses:
  // "A, B and C" in English, the Thai equivalent in Thai. Joining with a
  // hard-coded " and " was the previous behaviour and is wrong in Thai.
  const variables = format.list(copy.variables);
  const docs = format.list(
    copy.extraDoc ? ['docs/ENVIRONMENT.md', copy.extraDoc] : ['docs/ENVIRONMENT.md'],
  );

  return (
    <Notice
      tone="warning"
      title={t('capabilityMissing.title', { action })}
      className={className}
    >
      <p>
        {t('capabilityMissing.body', {
          action,
          subject: t(`capabilityMissing.subjects.${capability}`),
        })}{' '}
        {/* The variable names are set in the monospace face because they are
            strings to be typed exactly. The whole list sits inside one tag
            rather than one tag per name, because an ICU value can only be
            text — a tag is the only way to get an element into a translated
            sentence, and the list is built before it gets there. */}
        {t.rich('capabilityMissing.setVariables', {
          variables,
          code: (chunks) => <code className={CODE_CLASS}>{chunks}</code>,
        })}
      </p>
      <p className="mt-1">
        {t.rich('capabilityMissing.seeDocs', {
          docs,
          code: (chunks) => <code className={CODE_CLASS}>{chunks}</code>,
        })}
      </p>
    </Notice>
  );
}
