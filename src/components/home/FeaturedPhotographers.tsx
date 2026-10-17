import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import type { PhotographerProfile } from '@/types/domain';

export function FeaturedPhotographers({
  photographers,
  className,
}: {
  photographers: readonly PhotographerProfile[];
  className?: string;
}) {
  return (
    <section className={cn('mt-14', className)}>
      <SectionHead
        eyebrow="Made by photographers"
        title="The people behind the frames."
        description="The members whose published work has drawn the most appreciation."
        action={
          <Link
            href="/community"
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
          >
            Meet the community
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      />

      {photographers.length > 0 ? (
        <ul className="grid gap-4 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-4">
          {photographers.map((photographer) => (
            <li key={photographer.id}>
              <PhotographerCard photographer={photographer} className="h-full" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No profiles to show yet"
          description="This surface fills in once members have published work for others to appreciate."
        />
      )}
    </section>
  );
}
