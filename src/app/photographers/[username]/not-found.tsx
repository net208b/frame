import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';

/**
 * Reached when no member holds this username — including when an account has
 * been removed. The copy says only that, because "deleted" and "suspended" are
 * things a visitor has no business being told about someone else.
 */
export default function PhotographerNotFound() {
  return (
    <div className="site-container pt-20 pb-28">
      <div className="max-w-[46ch]">
        <Eyebrow>Profile</Eyebrow>

        <h1 className="mt-3 text-section-fluid font-bold">No photographer here.</h1>

        <p className="mt-5 text-lead leading-relaxed text-ink-soft">
          This profile address does not belong to a FRAME member. The link may be mistyped, or
          the account may no longer be on FRAME.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild>
            <Link href="/community">Meet the community</Link>
          </Button>

          <Link
            href="/discover"
            className="text-caption font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
          >
            Browse photographs
          </Link>
        </div>
      </div>
    </div>
  );
}
