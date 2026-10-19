import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * THE ONE CONVENTION OF THIS CHANGE, and the reason the rest of the app did not
 * have to learn about locales:
 *
 *     import { Link } from '@/i18n/navigation';   // not next/link
 *
 * Every internal link in FRAME imports `Link` from here. These wrappers put the
 * active locale in front of the href, so a component keeps writing
 * `href="/discover"` and the reader on `/th/photographs/…` stays on `/th`. A
 * `next/link` left behind anywhere sends that reader to `/discover`, which the
 * middleware then redirects to `/en/discover` — the language changes under
 * them, quietly, and nothing errors. That is the failure mode to watch for.
 *
 * The same applies to the hooks: `usePathname` here returns the path *without*
 * the locale prefix, which is what an active-link check wants to compare
 * against (`/discover`, never `/th/discover`), and `useRouter().push()` keeps
 * the locale. The one place to keep `next/navigation`'s own `usePathname` is
 * where the value is handed back to the server as a destination — a
 * `?next=` parameter has to carry the prefix, because whatever consumes it
 * later has no other way of knowing the language.
 *
 * `redirect` and `getPathname` require an explicit `locale` argument, so a
 * server-side redirect cannot silently drop one.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
