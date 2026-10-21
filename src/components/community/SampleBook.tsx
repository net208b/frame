'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { PhotobookCover } from '@/types/domain';

import type { BookScene } from '@/components/photobook/book-scene';
import { coverPreset, drawCoverFace, type CoverSubject } from '@/components/photobook/covers';

/**
 * A sample of the 3D book, for the page that has no real book to open yet.
 *
 * It is the SAME engine the real book runs on — `createBookScene`, the bending
 * pages, the lit cover — so a visitor sees exactly what their own book would
 * do, not a drawing of it. What it is NOT is somebody's photographs: the pages
 * are plain tinted plates, and the whole thing is labelled a sample. It shows
 * the format, and claims nothing about content.
 *
 * WebGL loads only here, only once this mounts, and a browser without it (or a
 * reader who asked for less motion) gets the drawn cover instead — never a
 * blank box.
 */

const SUBJECT: CoverSubject = {
  title: 'Shinjuku, After Hours',
  author: 'Kenji Watanabe',
  handle: 'kenjiwatanabe',
  slug: 'kenji-after-hours',
  gearMode: 'model',
  gearBrand: 'Fujifilm',
  gearModel: 'X-Pro3',
};

/** Tinted plates, not photographs: a soft wash a reader cannot mistake for a frame. */
function samplePage(index: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 840;
  const x = c.getContext('2d');
  if (!x) return c;
  const hue = (28 + index * 33) % 360;
  const g = x.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, `hsl(${hue} 14% 82%)`);
  g.addColorStop(1, `hsl(${(hue + 24) % 360} 16% 66%)`);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  // A faint centre mark, the way a placeholder plate reads as "a page goes here".
  x.strokeStyle = 'rgba(0,0,0,0.10)';
  x.lineWidth = 2;
  x.strokeRect(46, 46, c.width - 92, c.height - 92);
  return c;
}

export function SampleBook({
  cover = 'linen',
  tableColor = '#15170f',
  className,
}: {
  cover?: PhotobookCover;
  tableColor?: string;
  className?: string;
}) {
  const t = useTranslations('photobook');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BookScene | null>(null);
  const [mode, setMode] = useState<'loading' | '3d' | 'flat'>('loading');

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let disposed = false;

    (async () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
      if (!gl || reduced) {
        setMode('flat');
        return;
      }
      try {
        const { createBookScene } = await import('@/components/photobook/book-scene');
        if (disposed) return;
        const pictures = Array.from({ length: 10 }, (_, index) => samplePage(index));
        const scene = await createBookScene({
          container: stage,
          pictures,
          paper: 'lustre',
          cover,
          subject: SUBJECT,
          tableColor,
          reducedMotion: false,
        });
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        setMode('3d');
        setTimeout(() => void scene.next(), 900);
      } catch (error) {
        console.error('FRAME photobook: the sample book could not start', error);
        if (!disposed) setMode('flat');
      }
    })();

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [cover, tableColor]);

  return (
    <div className="space-y-4">
      <div
        className={cn('relative overflow-hidden rounded-panel border border-line aspect-[4/5] sm:aspect-[16/10]', className)}
        style={{
          background: `radial-gradient(120% 90% at 50% 10%, color-mix(in srgb, ${tableColor} 70%, white 8%), ${tableColor} 70%)`,
        }}
      >
        <div ref={stageRef} className={cn('absolute inset-0', mode !== '3d' && 'invisible')} aria-hidden={mode !== '3d'} />

        {mode !== '3d' ? <FlatCover cover={cover} /> : null}

        {/* Always on: this is a demonstration, not a member's book. */}
        <p className="pointer-events-none absolute top-3 left-3 rounded-pill bg-accent px-3 py-1.5 text-meta font-semibold text-accent-ink">
          {t('showcase.sampleBadge')}
        </p>

        {mode === 'loading' ? (
          <p className="absolute right-3 bottom-3 rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-meta text-muted backdrop-blur-sm">
            {t('viewer.loading')}
          </p>
        ) : null}
      </div>

      {mode === '3d' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void sceneRef.current?.next()}>
            {t('viewer.next')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void sceneRef.current?.prev()}>
            {t('viewer.prev')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void sceneRef.current?.close()}>
            {t('viewer.close')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The drawn front cover, for a browser without WebGL — never a blank box. */
function FlatCover({ cover }: { cover: PhotobookCover }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const drawn = drawCoverFace('front', coverPreset(cover), SUBJECT, [], (host.clientWidth * dpr) / 1000 || 0.3);
    host.width = drawn.width;
    host.height = drawn.height;
    const ctx = host.getContext('2d');
    if (ctx) ctx.drawImage(drawn, 0, 0);
  }, [cover]);

  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <canvas ref={ref} className="h-full max-h-full w-auto rounded-[4px] shadow-popover" style={{ aspectRatio: '5 / 7' }} />
    </div>
  );
}
