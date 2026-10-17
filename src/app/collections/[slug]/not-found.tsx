import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/SectionHead';

/**
 * The 404 a collection page falls back to.
 *
 * It is reached from two different situations on purpose: no collection has
 * this address, or one does but it is private and the reader is not its owner.
 * The copy covers both without distinguishing them, because wording that said
 * "this one is private" would confirm the collection exists — and that is the
 * owner's to disclose, not ours.
 */
export default function CollectionNotFound() {
  return (
    <div className="site-container py-24">
      <Eyebrow>Collection</Eyebrow>
      <h1 className="mt-4 max-w-[20ch] text-display-fluid">
        There is no collection <em className="font-serif font-normal italic">here</em>.
      </h1>

      <p className="mt-6 max-w-[56ch] text-lead leading-relaxed text-muted">
        Nothing at this address is open to you. A collection is private until its owner chooses
        otherwise, and an address can also change when a collection is renamed or disappear when
        it is deleted. If somebody shared this link with you, ask them to check it.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/collections">Browse public collections</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/discover">Discover photographs</Link>
        </Button>
      </div>
    </div>
  );
}
