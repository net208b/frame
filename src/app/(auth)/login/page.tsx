import Link from 'next/link';

import { AlreadySignedIn, AuthShell, firstParam } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { Notice } from '@/components/ui/states';
import { getViewer } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-redirect';
import { buildMetadata } from '@/lib/seo';

/**
 * Sign in.
 *
 * The page reads two query parameters and trusts neither. `next` passes
 * through `safeNextPath`, so a link that tried to carry somebody off this
 * origin lands on the home page instead; `error` is matched against the short
 * list below rather than being rendered, so a crafted link cannot put its own
 * sentence inside FRAME's chrome.
 */

export const metadata = buildMetadata({
  title: 'Sign in',
  description:
    'Sign in to FRAME to publish your photographs, appreciate other people’s work and keep collections.',
  path: '/login',
  // A sign-in form has no business in a search index, and indexing it would
  // put a page carrying a `next` parameter in front of people who never asked
  // to go anywhere.
  noIndex: true,
});

/**
 * The reasons another part of the app sends somebody here. Each is a fixed
 * sentence keyed by a known value — nothing from the query string is shown.
 */
const ARRIVALS: Record<string, { title: string; body: string }> = {
  not_configured: {
    title: 'Accounts are not configured here',
    body: 'This deployment has no identity service, so the link you followed could not sign anybody in. Nothing was created and nothing was changed.',
  },
  link_expired: {
    title: 'That link could not be used',
    body: 'A sign-in link works once, expires after an hour, and has to be opened in the browser that asked for it. Sign in below, or ask for a new link.',
  },
  signout_failed: {
    title: 'You may still be signed in',
    body: 'The sign-out could not be completed, so this browser may still hold a session. Try signing out again from the account menu.',
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const arrivalKey = firstParam(params.error);
  const arrival = arrivalKey ? ARRIVALS[arrivalKey] : undefined;

  const viewer = await getViewer();

  return (
    <AuthShell
      eyebrow="Account"
      title={
        <>
          Welcome <span className="font-serif font-normal italic">back</span>
        </>
      }
      description="Sign in to publish photographs, appreciate other people’s work and keep collections. Browsing FRAME needs no account at all."
      action="Signing in"
      footer={
        <>
          No account yet?{' '}
          <Link href="/join" className="font-semibold text-ink underline underline-offset-2">
            Join FRAME
          </Link>
          . It takes an email address, a handle and a password.
        </>
      }
    >
      {arrival ? (
        <Notice
          tone={arrivalKey === 'not_configured' ? 'info' : 'warning'}
          title={arrival.title}
          className="mb-6"
        >
          {arrival.body}
        </Notice>
      ) : null}

      {viewer ? (
        <AlreadySignedIn
          displayName={viewer.displayName}
          username={viewer.username}
          continueHref={next}
          continueLabel="Continue"
        />
      ) : (
        <LoginForm next={next} />
      )}
    </AuthShell>
  );
}
