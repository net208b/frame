import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';

/**
 * Shown when a photograph slug resolves to nothing the viewer may see.
 *
 * It deliberately does not guess which of the possible reasons applies. A page
 * that says "this was removed" when the truth is a mistyped URL is worse than
 * one that lists what might have happened, and saying "removed for copyright"
 * about someone's work on no evidence would be worse still.
 */
export default function PhotographNotFound() {
  return (
    <div className="site-container py-20 lg:py-28">
      <div className="max-w-xl">
        <Eyebrow>Not found</Eyebrow>

        <h1 className="text-section-fluid mt-3 font-bold">
          That photograph is not here.
        </h1>

        <p className="mt-5 text-lead text-ink-soft">
          The link may be mistyped, or the frame may have been unpublished by the photographer or
          taken down by a moderator. Photographs on FRAME keep their address for as long as they
          are published, so an old link that worked before has probably been withdrawn rather than
          moved.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/discover">Browse photographs</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/map">Explore the map</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
