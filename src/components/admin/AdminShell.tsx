import { LogOut, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Link } from '@/i18n/navigation';

/**
 * The console's chrome: a name, a way back to the inbox, the full moderation
 * desk for anything the inbox does not cover, and a way out. Nothing else —
 * the point of this page is that there is nothing to learn.
 */
export async function AdminShell({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'admin' });
  return (
    <div className="site-container py-8 lg:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <Link href="/adminnet208b" className="flex items-center gap-2 text-title font-bold">
          <ShieldCheck className="size-5" aria-hidden />
          {t('title')}
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-caption font-semibold">
          <Link href="/adminnet208b" className="text-ink-soft hover:text-ink">
            {t('nav.inbox')}
          </Link>
          <Link href="/moderation" className="text-ink-soft hover:text-ink">
            {t('nav.fullDesk')}
          </Link>
          <Link href="/" className="text-ink-soft hover:text-ink">
            {t('nav.site')}
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
              <LogOut className="size-3.5" aria-hidden />
              {t('nav.signOut')}
            </button>
          </form>
        </nav>
      </header>
      <div className="mt-8">{children}</div>
    </div>
  );
}
