'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { Notice } from '@/components/ui/states';
import { capabilities } from '@/lib/config';

/**
 * The notice that names the environment variable a missing capability needs.
 *
 * A CLIENT component, which is not an arbitrary choice. `MapCanvas` and
 * `StaticLocationMap` carry the `use client` directive — they drive an imperative
 * map library — and both render this notice when no map style URL is configured,
 * which is the default state of the project. An async Server Component cannot be
 * rendered from inside a client component: `getTranslations` throws
 * "not supported in Client Components" at that boundary. The server render
 * succeeds and the build passes, so the failure only appears when the page is
 * actually opened, as a page stuck on its loading skeleton.
 *
 * Being a client component costs almost nothing here. `NextIntlClientProvider`
 * in the locale layout already ships the whole catalogue to the browser for the
 * forms, the toast and the appreciate control, so the `common` namespace this
 * reads is present either way.
 *
 * `DemoNotice` stays a Server Component in `DemoNotice.tsx`: the root layout
 * renders it directly and nothing in the client graph reaches it.
 */

type Capability = 'database' | 'auth' | 'uploads' | 'maps';

const CODE_CLASS = 'font-mono text-[0.95em] font-semibold';

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

export function CapabilityNotice({
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
}): ReactElement | null {
  const t = useTranslations('common');
  const format = useFormatter();

  // Read after the hooks, which must not sit behind a condition. `capabilities()`
  // is safe in the browser: every variable it tests is a NEXT_PUBLIC_ one, which
  // the build inlines, and the one that is not — STORAGE_PROVIDER — is read with
  // a default that keeps `uploads` equal to `database` on either side.
  if (capabilities()[capability]) return null;

  const copy = CAPABILITY_COPY[capability];

  // Through Intl, so the separators are the ones the active language uses:
  // "A, B and C" in English, the Thai equivalent in Thai. Joining with a
  // hard-coded " and " was the previous behaviour and is wrong in Thai.
  const variables = format.list(copy.variables);
  const docs = format.list(
    copy.extraDoc ? ['docs/ENVIRONMENT.md', copy.extraDoc] : ['docs/ENVIRONMENT.md'],
  );

  return (
    <Notice tone="warning" title={t('capabilityMissing.title', { action })} className={className}>
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
