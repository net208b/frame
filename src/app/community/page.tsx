import type { Metadata } from 'next';
import Link from 'next/link';

import { PhotographerCard } from '@/components/photographer/PhotographerCard';
import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Button } from '@/components/ui/Button';
import { Eyebrow, SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { LOCATION_POLICY } from '@/lib/config';
import { getFeaturedPhotographers, getPlatformStats } from '@/lib/data/repository';
import { precisionLabel } from '@/lib/geo';
import { buildMetadata } from '@/lib/seo';
import { formatCount } from '@/lib/utils';
import type { PlatformStats } from '@/types/domain';

export const metadata: Metadata = buildMetadata({
  title: 'Community',
  description:
    'How FRAME works: who the photographers are, what an appreciation means, and how a new location is proposed and reviewed.',
  path: '/community',
});

/** A larger set than the home page shows, because this is the page about people. */
const FEATURED_LIMIT = 12;

function StatsBand({ stats }: { stats: PlatformStats }) {
  const figures = [
    { label: 'Photographs', value: stats.photographs },
    { label: 'Locations', value: stats.locations },
    { label: 'Countries', value: stats.countries },
    { label: 'Photographers', value: stats.photographers },
  ];

  return (
    <section className="mt-14">
      <h2>
        <Eyebrow>FRAME in numbers</Eyebrow>
      </h2>

      <dl className="mt-4 grid grid-cols-2 border-t border-line sm:grid-cols-4 sm:divide-x sm:divide-line">
        {figures.map((figure) => (
          <div key={figure.label} className="border-b border-line py-5 sm:px-6 sm:first:pl-0">
            <dt className="text-eyebrow text-muted-soft uppercase">{figure.label}</dt>
            <dd className="mt-2 text-section font-bold tabular-nums">
              {formatCount(figure.value)}
              {/* The figure and the fact that it is a sample travel together,
                  so a number can never be read as a real community total. */}
              {stats.isDemoData ? (
                <span className="mt-1 block text-meta font-normal tracking-normal text-muted">
                  sample data
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {stats.isDemoData ? (
        <p className="mt-3 max-w-[62ch] text-meta text-muted">
          No database is configured for this deployment, so these four figures describe the
          bundled sample dataset rather than a real community.
        </p>
      ) : null}
    </section>
  );
}

export default async function CommunityPage() {
  const [featured, stats] = await Promise.all([
    getFeaturedPhotographers(FEATURED_LIMIT),
    getPlatformStats(),
  ]);

  const publicPrecision = precisionLabel(LOCATION_POLICY.publicCoordinateDecimals);
  const reducedPrecision = precisionLabel(LOCATION_POLICY.reducedCoordinateDecimals);

  return (
    <div className="site-container pt-10 pb-20 lg:pt-14">
      <header className="max-w-[46ch]">
        <Eyebrow>The community</Eyebrow>

        <h1 className="mt-4 text-display-fluid">
          Photographs,
          <br />
          and the people <span className="font-serif font-normal italic">behind</span> them.
        </h1>

        <p className="mt-7 max-w-[58ch] text-lead leading-relaxed text-ink-soft">
          FRAME is a record of street photographs and of the real places they were made in.
          Everything on it was published by a member who holds the rights to their own work,
          and every location was reviewed by a person before it appeared on the map.
        </p>
      </header>

      <StatsBand stats={stats} />

      <section className="mt-16">
        <SectionHead
          eyebrow="Members"
          title="The most appreciated photographers"
          description="Ranked by the appreciations their published photographs have received, nothing else."
        />

        {featured.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((photographer) => (
              <li key={photographer.id}>
                <PhotographerCard photographer={photographer} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No photographers to show yet"
            description="This list is built from published photographs, so it fills up as members publish their first frames."
          />
        )}
      </section>

      <div className="mt-20 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <section>
          <h2 className="text-section font-bold">What an appreciation means</h2>

          <div className="mt-5 max-w-[58ch] space-y-4 text-body leading-relaxed text-ink-soft">
            <p>
              An appreciation is the only way to say something about a photograph on FRAME, and
              it counts once per member. Appreciating a frame a second time withdraws the first,
              so the number under an image is a count of people rather than a count of clicks.
            </p>
            <p>
              Appreciations cannot be bought, promoted or transferred, and no amount of them
              changes how a photograph is moderated. The editor’s picks are chosen by editors,
              always carry that label, and are never paid for.
            </p>
            <p>
              Trending orders photographs so that recent appreciations weigh more than old ones.
              That is the whole rule, and it is written on the{' '}
              <Link
                href="/discover"
                className="font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-ink"
              >
                Discover
              </Link>{' '}
              page beside the sort control, because a ranking nobody can explain is a ranking
              nobody should trust.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-section font-bold">How a location is reviewed</h2>

          <ol className="mt-5 max-w-[58ch] space-y-5 text-body leading-relaxed text-ink-soft">
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">A member proposes a place.</strong> A name,
              a city, a coordinate and a note about what makes it worth the walk. Up to{' '}
              {LOCATION_POLICY.maxSubmissionsPerDay} proposals a day, which is enough for a good
              afternoon and not enough to flood the queue.
            </li>
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">Automated checks run.</strong> Duplicate
              candidates nearby, a coordinate that does not sit in the country it claims, an
              unusually coarse point. These are shown to a moderator as signals and never
              decide anything on their own.
            </li>
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">A moderator decides.</strong> Approved,
              declined with a reason the member can read, or returned with a request for
              changes. Access and photography restrictions are only published when a moderator
              has recorded where the claim came from.
            </li>
            <li className="border-l border-line pl-5">
              <strong className="font-bold text-ink">The coordinate is published carefully.</strong>{' '}
              An approved place is pinned to {publicPrecision}. Somewhere privacy-sensitive is
              coarsened to {reducedPrecision} and labelled as approximate, and some places carry
              no coordinate at all. GPS found in a photograph’s metadata is never published
              unless the member chooses to publish it.
            </li>
          </ol>

          <p className="mt-6 max-w-[58ch] text-caption text-muted">
            What will and will not be approved is set out in the{' '}
            <Link
              href="/legal/guidelines"
              className="font-semibold text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
            >
              community guidelines
            </Link>
            .
          </p>
        </section>
      </div>

      <section className="on-ink mt-20 rounded-panel bg-ink-surface px-7 py-12 md:px-14 md:py-16">
        <div className="max-w-[46ch]">
          <Eyebrow onInk>Made by photographers</Eyebrow>

          <h2 className="mt-4 text-section-fluid font-bold text-on-ink">
            Your perspective belongs here.
          </h2>

          <p className="mt-5 text-body leading-relaxed text-on-ink-muted">
            Publish the photograph, pin the place, and say how the frame was made. Keep your
            copyright, withdraw a photograph whenever you like, and help the next person find a
            street they would not have walked down.
          </p>

          <div className="mt-8">
            <Button asChild variant="accent" size="lg">
              <Link href="/join">Create your profile</Link>
            </Button>
          </div>

          <p className="mt-5 text-caption text-on-ink-muted">
            Already a member?{' '}
            <Link
              href="/login"
              className="font-semibold text-on-ink underline decoration-line-inverse underline-offset-4 transition-colors duration-150 hover:decoration-accent"
            >
              Sign in
            </Link>
            .
          </p>
        </div>

        {/* Says plainly that sign-up cannot work here, rather than letting the
            button above look like a working one. Renders nothing when auth is
            configured. */}
        <CapabilityNotice
          capability="auth"
          action="Creating an account"
          className="mt-8 max-w-[62ch]"
        />
      </section>
    </div>
  );
}
