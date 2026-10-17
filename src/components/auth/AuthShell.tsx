import Link from 'next/link';
import type { ReactNode } from 'react';

import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';
import { cn } from '@/lib/utils';

/**
 * The furniture every account page shares: an eyebrow, one h1, a short lede,
 * the capability notice, and the form at a comfortable measure.
 *
 * The notice sits above the card deliberately. A viewer on a deployment with
 * no identity service should read that nothing can be created *before* they
 * start typing, not after they press the button.
 */

export function AuthShell({
  eyebrow,
  title,
  description,
  action,
  children,
  footer,
  className,
}: {
  eyebrow: string;
  /** Allows one serif italic accent word, as the prototype's headlines do. */
  title: ReactNode;
  description: string;
  /** Named in the capability notice, for example "Signing in". */
  action: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('animate-rise-in', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 text-section-fluid font-bold">{title}</h1>
      <p className="mt-4 text-lead leading-relaxed text-muted">{description}</p>

      <CapabilityNotice capability="auth" action={action} className="mt-7" />

      {children ? (
        <div className="mt-7 rounded-panel border border-line bg-surface p-6 sm:p-8">{children}</div>
      ) : null}

      {footer ? <div className="mt-6 text-caption leading-relaxed text-muted">{footer}</div> : null}
    </section>
  );
}

/**
 * The one call to action on an account page that has finished its job: the
 * link onwards after a confirmation, or back to a form that can issue a new
 * link.
 */
export function AuthCta({
  href,
  children,
  tone = 'primary',
}: {
  href: string;
  children: ReactNode;
  tone?: 'primary' | 'secondary';
}) {
  return (
    <Button asChild variant={tone}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/**
 * What a sign-in or join page shows to somebody who is already signed in.
 *
 * Neither page redirects them away. A redirect would make the sign-out button
 * in the header the only way to reach a second account, and would leave
 * somebody who followed a stale `?next=` link with no idea why they moved.
 * The sign-out control is a real POST form, so it works without JavaScript and
 * cannot be fired by a cross-site image tag.
 */
export function AlreadySignedIn({
  displayName,
  username,
  continueHref,
  continueLabel,
}: {
  displayName: string;
  username: string;
  continueHref: string;
  continueLabel: string;
}) {
  return (
    <div>
      <p className="text-body leading-relaxed text-ink">
        You are already signed in as <strong className="font-bold">{displayName}</strong> (
        <span className="text-muted">@{username}</span>). Sign out first to use a different
        account.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <AuthCta href={continueHref}>{continueLabel}</AuthCta>

        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

/**
 * The first value of a search parameter.
 *
 * A query string can repeat a key — `?next=/a&next=/b` — in which case Next
 * hands over an array. Taking the first entry keeps the pages from having to
 * think about it, and every value still passes through `safeNextPath` or a
 * known-status lookup before it is used.
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
