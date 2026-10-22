import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Eyebrow } from '@/components/ui/SectionHead';
import { Link } from '@/i18n/navigation';
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
 *
 * The values are not translated, and that is the point. `f/1.4`, `1/250`,
 * `3200` and `35 mm` are written the same way by a photographer in Bangkok as
 * by one in Copenhagen; only the words naming them change. ISO keeps its name
 * in Thai because that is what Thai photographers say and write.
 */

/** Discover reads its filters from the query string; see DiscoverQuery. */
function discoverHref(
  filter: 'cameraBrand' | 'cameraModel' | 'lensBrand' | 'lensModel',
  value: string,
): string {
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
  filter: 'cameraBrand' | 'cameraModel' | 'lensBrand' | 'lensModel';
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

export async function CaptureSpecs({
  capture,
  explanation,
  className,
}: {
  capture: CaptureSettings;
  /**
   * The photographer's own account of what they were doing (0044). Shown above
   * the numbers, because it is the answer to the question the numbers only
   * partly answer — and never styled as a caption under the frame, which would
   * make it read as a description of what is in the picture.
   */
  explanation?: string | null;
  className?: string;
}) {
  const t = await getTranslations('photo');

  const {
    cameraBrand,
    cameraModel,
    lensBrand,
    lensModel,
    focalLengthMm,
    aperture,
    shutterSpeed,
    iso,
    filmStock,
    filmCamera,
    filmScanner,
  } = capture;

  const hasGear = Boolean(cameraBrand || cameraModel || lensBrand || lensModel || focalLengthMm);
  const hasExposure = aperture !== null || shutterSpeed !== null || iso !== null;
  // A frame scanned from film says so here, in the member's words (0038) —
  // the stock, the camera and the scanner stand where a digital frame's
  // camera record would. Public on purpose: other film photographers are the
  // readers who can tell a scan from a phone filter, and the report dialog
  // gives them a reason to choose.
  const hasFilm = Boolean(filmStock || filmCamera || filmScanner);

  /*
   * Where these values came from, as ONE line rather than a badge per row.
   *
   * The brief asks for a clear status when a value was typed, and the reason it
   * matters is not auditing: it is that a reader deciding whether to trust an
   * exposure should know whether they are reading the camera's record or the
   * photographer's account. Both are legitimate — EXIF is regularly wrong about
   * a manual lens — so the line states which it is and claims nothing more. It
   * is deliberately not a verification mark: EXIF is editable with a free tool,
   * which is exactly why the schema calls `exif_source` evidence for review
   * rather than proof.
   *
   * Nothing is said when there is nothing to compare against — a scan from
   * film, or a frame published before the readout was kept. Printing "we don't
   * know" under every film frame would be noise about an absence.
   */
  const provenanceLine =
    capture.provenance === 'camera'
      ? t('capture.provenance.camera')
      : capture.provenance === 'edited'
        ? t('capture.provenance.edited')
        : null;

  return (
    <section className={cn('min-w-0', className)}>
      <Eyebrow>{t('capture.eyebrow')}</Eyebrow>
      <h2 className="mt-2 text-title font-bold">{t('capture.title')}</h2>

      {!hasGear && !hasExposure && !hasFilm ? (
        <p className="mt-3 text-caption leading-relaxed text-muted">{t('capture.none')}</p>
      ) : null}

      {provenanceLine && (hasGear || hasExposure) ? (
        <p className="mt-3 text-meta leading-relaxed text-muted">{provenanceLine}</p>
      ) : null}

      {/* Labelled, and in the photographer's voice: an unlabelled paragraph
          here would read as FRAME describing the photograph. §7.3's rule is
          that the numbers do not explain why a photograph is good — this is
          the half that can, and it is still only one person's account. */}
      {explanation ? (
        <div className="mt-5 border-l border-line-strong pl-4">
          <h3 className="text-eyebrow uppercase text-muted">{t('capture.explanationTitle')}</h3>
          <div className="mt-2 space-y-3 text-caption leading-relaxed text-ink-soft">
            {explanation
              .split(/\n{2,}/)
              .map((block) => block.trim())
              .filter(Boolean)
              .map((block, index) => (
                <p key={index}>{block}</p>
              ))}
          </div>
        </div>
      ) : null}

      {hasFilm ? (
        <dl className="mt-4 text-caption">
          <Row term={t('capture.film')}>
            <span className="rounded-pill border border-line px-2 py-0.5 text-meta font-semibold">
              {t('capture.filmBadge')}
            </span>
          </Row>
          {filmStock ? <Row term={t('capture.filmStock')}>{filmStock}</Row> : null}
          {filmCamera ? <Row term={t('capture.filmCamera')}>{filmCamera}</Row> : null}
          {filmScanner ? <Row term={t('capture.filmScanner')}>{filmScanner}</Row> : null}
        </dl>
      ) : null}

      {hasExposure ? (
        <dl className="mt-4 flex flex-wrap gap-2">
          {aperture !== null ? (
            <ExposureCell term={t('capture.aperture')} value={formatAperture(aperture)} />
          ) : null}
          {shutterSpeed !== null ? (
            <ExposureCell term={t('capture.shutter')} value={shutterSpeed} />
          ) : null}
          {iso !== null ? (
            <ExposureCell term={t('capture.iso')} value={String(iso)} />
          ) : null}
        </dl>
      ) : null}

      {hasGear ? (
        <dl className={cn('text-caption', hasExposure ? 'mt-5' : 'mt-4')}>
          {cameraBrand ? (
            <Row term={t('capture.cameraBrand')}>
              <FilterLink filter="cameraBrand" value={cameraBrand} />
            </Row>
          ) : null}
          {cameraModel ? (
            <Row term={t('capture.camera')}>
              <FilterLink filter="cameraModel" value={cameraModel} />
            </Row>
          ) : null}
          {lensBrand ? (
            <Row term={t('capture.lensBrand')}>
              <FilterLink filter="lensBrand" value={lensBrand} />
            </Row>
          ) : null}
          {/* A Discover facet since 0043, so this is a link like the three
              above it. It was plain text for as long as filtering by it would
              have filtered on nothing. */}
          {lensModel ? (
            <Row term={t('capture.lens')}>
              <FilterLink filter="lensModel" value={lensModel} />
            </Row>
          ) : null}
          {focalLengthMm !== null ? (
            <Row term={t('capture.focalLength')}>
              <span className="tabular-nums">{focalLengthMm} mm</span>
            </Row>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
