import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';

export default function LocationNotFound() {
  return (
    <div className="site-container py-24">
      <Eyebrow>Location</Eyebrow>
      <h1 className="text-display-fluid mt-4 max-w-[18ch]">This place is not published.</h1>

      <p className="mt-6 max-w-[56ch] text-lead leading-relaxed text-muted">
        The address does not match an approved location. A place reaches FRAME only once a
        moderator has approved it, and one that has been merged into another entry or taken down
        stops resolving. Nothing here says the place does not exist.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/locations">Browse all locations</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/map">Open the map</Link>
        </Button>
      </div>
    </div>
  );
}
