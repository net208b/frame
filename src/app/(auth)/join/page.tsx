import Link from 'next/link';

import { AlreadySignedIn, AuthShell } from '@/components/auth/AuthShell';
import { JoinForm } from '@/components/auth/JoinForm';
import { getViewer } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo';

/**
 * Create an account.
 *
 * Joining does not sign anybody in: the address has to be confirmed first,
 * and the form says so rather than dropping somebody onto the home page as a
 * member of a community they have not finished joining.
 */

export const metadata = buildMetadata({
  title: 'Join FRAME',
  description:
    'Create a FRAME account to publish street photography, appreciate other people’s work and build collections.',
  path: '/join',
  noIndex: true,
});

export default async function JoinPage() {
  const viewer = await getViewer();

  return (
    <AuthShell
      eyebrow="Account"
      title={
        <>
          Join <span className="font-serif font-normal italic">FRAME</span>
        </>
      }
      description="An account lets you publish your own photographs, appreciate work you admire and keep collections. Three details and a password are all it takes."
      action="Creating an account"
      footer={
        <>
          Already a member?{' '}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            Sign in
          </Link>
          . Waiting on a confirmation email?{' '}
          <Link
            href="/verify-email"
            className="font-semibold text-ink underline underline-offset-2"
          >
            Ask for another link
          </Link>
          .
        </>
      }
    >
      {viewer ? (
        <AlreadySignedIn
          displayName={viewer.displayName}
          username={viewer.username}
          continueHref={`/photographers/${viewer.username}`}
          continueLabel="Open your profile"
        />
      ) : (
        <JoinForm />
      )}
    </AuthShell>
  );
}
