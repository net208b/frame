import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import { withLocalePrefix } from '@/i18n/locales';
import { requireViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';

/**
 * The gate on the upload wizard, and the measure it is set in.
 *
 * `requireViewer()` sends a visitor to sign in and brings them back here
 * afterwards, in the language they were reading. The check is repeated in the
 * page and again in every function in `@/server/actions/upload`, because a
 * layout is rendered once and may be cached: it is a courtesy to the reader, not
 * the thing that protects anything. The actions are the public endpoints, and each one re-reads the
 * session, re-checks ownership and re-validates before it writes.
 *
 * In demo mode the gate is skipped on purpose. There is no database, no
 * accounts and no sessions, so there is nobody to authorise — and the whole
 * point of demo mode is that the wizard can be reviewed before a project
 * exists. Nothing can be uploaded from that state: every write refuses with
 * NOT_CONFIGURED_MESSAGE, and step seven says so before the member presses
 * anything. The same decision is documented in
 * `src/app/[locale]/moderation/layout.tsx`.
 */
export default async function UploadLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  // The return path carries the locale, so signing in brings the member back to
  // the wizard in the language they were reading rather than to English.
  if (!isDemoMode()) await requireViewer(withLocalePrefix('/upload', locale));

  return (
    <div className="site-container py-10 lg:py-14">
      {/* A form reads badly across 1440px, so the wizard keeps a narrow measure
          inside the site container rather than filling it. */}
      <div className="max-w-[64rem]">{children}</div>
    </div>
  );
}
