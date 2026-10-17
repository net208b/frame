import Link from 'next/link';
import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/SectionHead';
import { cn } from '@/lib/utils';
import type { CaptureSettings } from '@/types/domain';

/**
 * How the frame was made.
 *
 * This is the block a photographer came for, so it is written as craft
 * information rather than as a properties panel: the gear reads as a list of
 * names, the exposure triangle sits together in one row because that is how it
 * is reasoned about, and the camera and lens names are links into Discover so
 * the specs are a way to find more work shot the same way.
 *
 * Every field is nullable, and a missing field is omitted rather than printed
 * as a dash: an em dash beside "Aperture" looks like a value that is known to
 * be nothing, when the truth is that nobody recorded it.
 */

/** Discover reads its filters from the query string; see DiscoverQuery. */
function discoverHref(filter: 'cameraBrand' | 'cameraModel' | 'lensBrand', value: string): string {
  const params = new URLSearchParams({ [filter]: value });
  return `/discover?${params.toString()}`;
}

function Row({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <dt className="text-meta text-muted">{term}</dt>
      <dd className="text-caption font-semibold text-ink">{children}</dd>
    </div>
  );
}

function FilterLink({ filter, value }: {
  filter: 'cameraBrand' | 'cameraModel' | 'lensBrand';
  value: string;
}) {
  return (
    <Link
      href={discoverHref(filter, value)}
      className="underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-ink"
    >
      {value}
    </Link>
  );
}

/** An exposure value gets its own cell, so the three read as one setting. */
function ExposureCell({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 basis-[7rem] rounded-card bg-surface-sunken px-3.5 py-3">
      <dt className="text-eyebrow text-muted uppercase">{term}</dt>
      <dd className="mt-1.5 text-title font-bold tracking-[-0.05em] tabular-nums">{value}</dd>
    </div>
  );
}

/** f/1.4 and f/8, never f/1.40 or f/8.0. */
function formatAperture(aperture: number): string {
  return `f/${Number.isInteger(aperture) ? aperture : aperture.toFixed(1)}`;
}

export function CaptureSpecs({
  capture,
  className,
}: {
  capture: CaptureSettings;
  className?: string;
}) {
  const { cameraBrand, cameraModel, lensBrand, lensModel, focalLengthMm, aperture, shutterSpeed, iso } =
    capture;

  const hasGear = Boolean(cameraBrand || cameraModel || lensBrand || lensModel || focalLengthMm);
  const hasExposure = aperture !== null || shutterSpeed !== null || iso !== null;

  return (
    <section className={cn('min-w-0', className)}>
      <Eyebrow>In the camera</Eyebrow>
      <h2 className="mt-2 text-title font-bold">Capture settings</h2>

      {!hasGear && !hasExposure ? (
        <p className="mt-3 text-caption leading-relaxed text-muted">
          The photographer did not record the settings for this frame, so there is nothing to
          show here. Settings are optional on upload and are never inferred from the file.
        </p>
      ) : null}

      {hasExposure ? (
        <dl className="mt-4 flex flex-wrap gap-2">
          {aperture !== null ? (
            <ExposureCell term="Aperture" value={formatAperture(aperture)} />
          ) : null}
          {shutterSpeed !== null ? (
            <ExposureCell term="Shutter" value={shutterSpeed} />
          ) : null}
          {iso !== null ? <ExposureCell term="ISO" value={String(iso)} /> : null}
        </dl>
      ) : null}

      {hasGear ? (
        <dl className={cn('text-caption', hasExposure ? 'mt-5' : 'mt-4')}>
          {cameraBrand ? (
            <Row term="Camera brand">
              <FilterLink filter="cameraBrand" value={cameraBrand} />
            </Row>
          ) : null}
          {cameraModel ? (
            <Row term="Camera">
              <FilterLink filter="cameraModel" value={cameraModel} />
            </Row>
          ) : null}
          {lensBrand ? (
            <Row term="Lens brand">
              <FilterLink filter="lensBrand" value={lensBrand} />
            </Row>
          ) : null}
          {/* Lens models are not a Discover facet, so this one is plain text
              rather than a link that would filter on nothing. */}
          {lensModel ? <Row term="Lens">{lensModel}</Row> : null}
          {focalLengthMm !== null ? (
            <Row term="Focal length">
              <span className="tabular-nums">{focalLengthMm} mm</span>
            </Row>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
