import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { readLocaleParams, type LocaleParams } from '@/i18n/params';
import type { Locale } from '@/i18n/locales';
import { requireModerator } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';

/**
 * The gate on the moderation dashboard.
 *
 * `requireModerator()` answers with `notFound()` rather than a redirect or a
 * 403, so a member probing `/moderation` cannot tell it from a URL that does
 * not exist. This check is for the reader's benefit: a layout is rendered once
 * and can be cached, so it is not what protects anything. Every function in
 * `@/server/actions/moderation` re-reads the session and re-checks the role for
 * itself, because those are the public endpoints.
 *
 * In demo mode the check is skipped, and deliberately: there is no database,
 * no accounts and no sessions, so there is nobody to authorise and nothing
 * private to protect — the queues are the bundled sample dataset. Skipping it
 * is what makes the dashboard reviewable before a project exists, which is the
 * whole point of demo mode. Every write still refuses with
 * NOT_CONFIGURED_MESSAGE, so nothing can be decided from this state.
 */

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale } = await readLocaleParams(params);
  const t = await getTranslations({ locale, namespace: 'moderation' });

  return buildMetadata({
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/moderation',
    locale,
    noIndex: true,
  });
}

export default async function ModerationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: LocaleParams;
}) {
  const { locale } = await readLocaleParams(params);
  setRequestLocale(locale);

  if (!isDemoMode()) await requireModerator();

  return <>{children}</>;
}
