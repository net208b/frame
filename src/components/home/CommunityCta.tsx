import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { SectionHead } from '@/components/ui/SectionHead';
import { cn } from '@/lib/utils';

/**
 * The closing invitation.
 *
 * The call to action points at a real route either way, and the capability
 * notice says plainly when this deployment cannot yet accept an account or an
 * upload — a button that looks real and quietly fails is worse than a sentence
 * explaining what is missing.
 */
export function CommunityCta({
  signedIn,
  className,
}: {
  signedIn: boolean;
  className?: string;
}) {
  return (
    <section className={cn('mt-14 border-t border-line pt-10', className)}>
      <SectionHead
        eyebrow="Contribute"
        title="Add the place you know best."
        action={
          <Button asChild>
            <Link href={signedIn ? '/upload' : '/join'}>
              {signedIn ? 'Upload a photograph' : 'Create your profile'}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </Button>
        }
      />

      <p className="max-w-[610px] text-body text-muted">
        Share the photograph, pin the place it was made and say what the light was doing. Nothing
        is published until you confirm the work is yours, and no exact coordinate is published
        unless you choose to share it.
      </p>

      <CapabilityNotice
        capability={signedIn ? 'uploads' : 'auth'}
        action={signedIn ? 'Uploading a photograph' : 'Creating an account'}
        className="mt-6 max-w-[610px]"
      />
    </section>
  );
}
