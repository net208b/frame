import Link from 'next/link';
import type { ReactNode } from 'react';

import { AuthCta, AuthShell, firstParam } from '@/components/auth/AuthShell';
import { ResendVerificationForm } from '@/components/auth/ResendVerificationForm';
import { Notice } from '@/components/ui/states';
import { buildMetadata } from '@/lib/seo';

/**
 * Where a confirmation link lands, and where a new one is asked for.
 *
 * /auth/confirm sends every outcome here with a `status`, so a member always
 * reads what happened instead of being dropped on the home page to work it
 * out. The four states below are the only ones honoured; an unrecognised value
 * falls through to the explanation of what a confirmation link is for.
 */

export const metadata = buildMetadata({
  title: 'Confirm your email address',
  description: 'Confirm the address on your FRAME account, or ask for another confirmation link.',
  path: '/verify-email',
  noIndex: true,
});

type Status = 'confirmed' | 'email_changed' | 'invalid';

function readStatus(value: string | undefined): Status | null {
  if (value === 'confirmed' || value === 'email_changed' || value === 'invalid') return value;
  return null;
}

interface Presentation {
  title: ReactNode;
  description: string;
  /** The notice above the panel, if this state has something to report. */
  notice: { tone: 'success' | 'danger'; title: string; body: string } | null;
  /** False once the address is confirmed: there is no link left to resend. */
  offerResend: boolean;
}

const CONFIRMED_TITLE = (
  <>
    Address <span className="font-serif font-normal italic">confirmed</span>
  </>
);

function present(status: Status | null): Presentation {
  switch (status) {
    case 'confirmed':
      return {
        title: CONFIRMED_TITLE,
        description:
          'Your email address is confirmed and this browser is signed in. Your account is ready to use.',
        notice: {
          tone: 'success',
          title: 'That worked',
          body: 'The link has been used and cannot be used again. You are signed in on this device only.',
        },
        offerResend: false,
      };

    case 'email_changed':
      return {
        title: CONFIRMED_TITLE,
        description:
          'Your new email address is confirmed. Account notices and any future reset links will go there from now on.',
        notice: {
          tone: 'success',
          title: 'That worked',
          body: 'The old address is no longer attached to the account. Nothing on your public profile has changed — FRAME never shows an email address there.',
        },
        offerResend: false,
      };

    case 'invalid':
      return {
        title: (
          <>
            That link has <span className="font-serif font-normal italic">expired</span>
          </>
        ),
        description:
          'A confirmation link works once and expires after 24 hours. Ask for another one below and it will replace it.',
        notice: {
          tone: 'danger',
          title: 'The link could not be used',
          body: 'It has either been used already, expired, or been altered in transit — some mail clients rewrite links. Copying the address straight from the email usually fixes the last of those.',
        },
        offerResend: true,
      };

    default:
      return {
        title: (
          <>
            Check your <span className="font-serif font-normal italic">email</span>
          </>
        ),
        description:
          'A confirmation link is what stops somebody else signing up with your address. Open the link and the account is ready; until then there is no account to sign in to.',
        notice: null,
        offerResend: true,
      };
  }
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = present(readStatus(firstParam(params.status)));

  return (
    <AuthShell
      eyebrow="Account"
      title={view.title}
      description={view.description}
      action="Confirming an email address"
      footer={
        view.offerResend ? (
          <>
            Confirmed already?{' '}
            <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
              Sign in
            </Link>
            . FRAME sends nothing else to this address apart from account notices.
          </>
        ) : (
          <>
            Signed in on this device. The{' '}
            <Link
              href="/legal/privacy"
              className="font-semibold text-ink underline underline-offset-2"
            >
              privacy notice
            </Link>{' '}
            lists everything FRAME stores against an account.
          </>
        )
      }
    >
      {view.notice ? (
        <Notice
          tone={view.notice.tone}
          title={view.notice.title}
          className={view.offerResend ? 'mb-6' : undefined}
        >
          {view.notice.body}
        </Notice>
      ) : null}

      {view.offerResend ? (
        <ResendVerificationForm />
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <AuthCta href="/discover">Go to the gallery</AuthCta>
          <AuthCta href="/upload" tone="secondary">
            Publish a photograph
          </AuthCta>
        </div>
      )}
    </AuthShell>
  );
}
