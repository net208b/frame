import Link from 'next/link';

import { AuthShell, firstParam } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { Notice } from '@/components/ui/states';
import { buildMetadata } from '@/lib/seo';

/**
 * Ask for a password reset link.
 *
 * Nothing on this page reveals whether an address has an account. The form
 * reports the same outcome either way, which is the only answer that does not
 * turn a reset form into a way to check who is a member.
 */

export const metadata = buildMetadata({
  title: 'Forgotten password',
  description: 'Ask FRAME for a link that lets you set a new password.',
  path: '/forgot-password',
  noIndex: true,
});

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Set by /auth/confirm when a recovery link could not be verified.
  const linkExpired = firstParam(params.status) === 'link_expired';

  return (
    <AuthShell
      eyebrow="Account"
      title={
        <>
          Forgotten <span className="font-serif font-normal italic">password</span>
        </>
      }
      description="Give the address the account was created with and FRAME will send a link that lets you set a new password."
      action="Resetting a password"
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            Sign in
          </Link>
          . If the address itself is lost, there is no way to recover the account — FRAME holds
          nothing else that could prove it is yours.
        </>
      }
    >
      {linkExpired ? (
        <Notice tone="warning" title="That recovery link could not be used" className="mb-6">
          A recovery link works once and expires after an hour. Ask for a new one below.
        </Notice>
      ) : null}

      <ForgotPasswordForm />
    </AuthShell>
  );
}
