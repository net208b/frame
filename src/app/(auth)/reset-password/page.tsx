import Link from 'next/link';

import { AuthCta, AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { Notice } from '@/components/ui/states';
import { getViewer } from '@/lib/auth';
import { buildMetadata } from '@/lib/seo';

/**
 * Set a new password.
 *
 * The recovery link in the email creates a real session, and that session is
 * the only proof of ownership this page has. Without one there is nothing to
 * change, so the form is not rendered at all — and `resetPassword` checks the
 * session again before it writes, because an absent form is a courtesy to the
 * reader rather than a permission check.
 */

export const metadata = buildMetadata({
  title: 'Set a new password',
  description: 'Choose a new password for your FRAME account.',
  path: '/reset-password',
  noIndex: true,
});

export default async function ResetPasswordPage() {
  const viewer = await getViewer();

  return (
    <AuthShell
      eyebrow="Account"
      title={
        <>
          Set a <span className="font-serif font-normal italic">new</span> password
        </>
      }
      description={
        viewer
          ? 'Choose a password you have not used anywhere else. This browser stays signed in once it is saved.'
          : 'This page is opened from the recovery link in your email. The link is what proves the account is yours.'
      }
      action="Changing a password"
      footer={
        viewer ? (
          <>
            Signed in as{' '}
            <Link
              href={`/photographers/${viewer.username}`}
              className="font-semibold text-ink underline underline-offset-2"
            >
              @{viewer.username}
            </Link>
            . Changing the password here does not sign your other devices out.
          </>
        ) : (
          <>
            Links expire after an hour and can be used once.{' '}
            <Link
              href="/forgot-password"
              className="font-semibold text-ink underline underline-offset-2"
            >
              Ask for a new one
            </Link>
            .
          </>
        )
      }
    >
      {viewer ? (
        <ResetPasswordForm />
      ) : (
        <div>
          <Notice tone="info" title="No recovery link is open in this browser">
            FRAME cannot change a password without one. Request a link, then open it in this
            browser — a link opened on another device signs that device in instead of this one.
          </Notice>

          <div className="mt-6">
            <AuthCta href="/forgot-password">Request a recovery link</AuthCta>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
