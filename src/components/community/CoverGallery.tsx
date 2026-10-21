'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import {
  COVER_H,
  COVER_W,
  drawCoverFace,
  PHOTOBOOK_COVER_PRESETS,
  type CoverSubject,
} from '@/components/photobook/covers';

/**
 * The fifteen covers as they are actually drawn — not flat colour chips.
 *
 * This is the same `drawCoverFace` the Settings swatches and the 3D book use,
 * so a cover looks like itself here too: the linen weave, the foil title, the
 * gear line, all of it. It needs a canvas, so it is a client component; the
 * covers section it sits in is below the fold of a page about a feature, which
 * is exactly where a little JavaScript is worth spending.
 *
 * The subject is one invented book, the same one across all fifteen, so the
 * covers read as a set and a reader compares the designs rather than the words.
 * It is plainly a sample — a demonstration of the covers, pretending to be
 * nobody's book.
 */

const SAMPLE: CoverSubject = {
  title: 'Shinjuku, After Hours',
  author: 'Kenji Watanabe',
  handle: 'kenjiwatanabe',
  slug: 'kenji-after-hours',
  gearMode: 'model',
  gearBrand: 'Fujifilm',
  gearModel: 'X-Pro3',
};

function CoverCanvas({ presetId }: { presetId: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const preset = PHOTOBOOK_COVER_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;

    // Drawn at the artwork's own ratio and a device-pixel scale, so the type
    // stays crisp when CSS lays it into the grid cell.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = host.clientWidth || 220;
    const scale = (cssWidth * dpr) / COVER_W;
    const drawn = drawCoverFace('front', preset, SAMPLE, [], scale);
    host.width = drawn.width;
    host.height = drawn.height;
    host.style.aspectRatio = `${COVER_W} / ${COVER_H}`;
    const ctx = host.getContext('2d');
    if (ctx) ctx.drawImage(drawn, 0, 0);
  }, [presetId]);

  return <canvas ref={ref} className="block w-full rounded-[4px] shadow-popover" />;
}

export function CoverGallery({ className }: { className?: string }) {
  const t = useTranslations('common');

  return (
    <ul className={className ?? 'grid grid-cols-3 gap-3 sm:grid-cols-5'}>
      {PHOTOBOOK_COVER_PRESETS.map((preset) => (
        <li key={preset.id}>
          <CoverCanvas presetId={preset.id} />
          <p className="mt-2 text-center text-meta text-muted">{t(`photobookCovers.${preset.id}`)}</p>
        </li>
      ))}
    </ul>
  );
}
