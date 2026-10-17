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
 */

type Capability = 'database' | 'auth' | 'uploads' | 'maps';

export function DemoNotice({
  className,
  context,
}: {
  className?: string;
  context?: string;
}): ReactElement | null {
  if (!isDemoMode()) return null;

  return (
    <aside
      aria-label="Demo content"
      className={cn('border-b border-line bg-surface-sunken', className)}
    >
      <div className="site-container flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
        <span className="text-eyebrow text-muted uppercase">Demo content</span>
        <p className="text-caption text-ink-soft">
          No database is configured, so {context ?? 'this page'} is showing the bundled sample
          dataset. Every count, photograph and photographer here describes that sample rather
          than a real community.
        </p>
      </div>
    </aside>
  );
}

const CAPABILITY_COPY: Record<
  Capability,
  { subject: string; variables: string[]; extraDoc?: string }
> = {
  database: {
    subject: 'a database',
    variables: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
  auth: {
    subject: 'accounts and sign-in',
    variables: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
  uploads: {
    subject: 'image storage',
    variables: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'STORAGE_BUCKET',
    ],
  },
  maps: {
    subject: 'a map style from a provider whose terms allow this traffic',
    variables: ['NEXT_PUBLIC_MAP_STYLE_URL'],
    extraDoc: 'docs/EXTERNAL-SERVICES.md',
  },
};

export function CapabilityNotice({
  capability,
  action,
  className,
}: {
  capability: Capability;
  action: string;
  className?: string;
}): ReactElement | null {
  if (capabilities()[capability]) return null;

  const copy = CAPABILITY_COPY[capability];

  return (
    <Notice tone="warning" title={`${action} is unavailable in this deployment`} className={className}>
      <p>
        {action} needs {copy.subject}, which this deployment has not been given. Set{' '}
        {copy.variables.map((variable, index) => (
          <span key={variable}>
            {index > 0 && (index === copy.variables.length - 1 ? ' and ' : ', ')}
            <code className="font-mono text-[0.95em] font-semibold">{variable}</code>
          </span>
        ))}{' '}
        to turn it on.
      </p>
      <p className="mt-1">
        See <code className="font-mono text-[0.95em] font-semibold">docs/ENVIRONMENT.md</code>
        {copy.extraDoc ? (
          <>
            {' and '}
            <code className="font-mono text-[0.95em] font-semibold">{copy.extraDoc}</code>
          </>
        ) : null}{' '}
        for the full list.
      </p>
    </Notice>
  );
}
