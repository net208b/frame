'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { Photobook } from '@/types/domain';

import type { BookScene } from './book-scene';
import type { CoverSubject, Picture } from './covers';

/**
 * The book on the page.
 *
 * Three.js is loaded here and nowhere else, by dynamic import, only once this
 * component has mounted on the book page: 160 KB of gzipped WebGL is a price
 * worth paying for somebody who opened a book and nothing anybody else should
 * carry. The scene itself lives in `book-scene.ts`, which knows nothing about
 * React; this file owns the lifecycle and the buttons.
 *
 * THE 2D SPREAD IS NOT A DEGRADED MODE. It is what a reader gets when WebGL is
 * unavailable, when they asked for reduced motion, or while the scene is still
 * loading — and it shows every page in the same order, so nothing a member put
 * in their book depends on a graphics card. It also renders on the server, so
 * the page has its pictures before any script runs.
 */

/** Pictures the canvas may draw: they have to arrive with CORS headers. */
async function loadPicture(url: string): Promise<Picture | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function blank(index: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 840;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = `hsl(${(index * 47) % 360} 12% 30%)`;
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

export function BookViewer({ book, tableColor }: { book: Photobook; tableColor: string }) {
  const t = useTranslations('photobook');
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BookScene | null>(null);
  const [mode, setMode] = useState<'loading' | '3d' | 'flat'>('loading');
  const [state, setState] = useState({ coverOpen: false, turned: 0, sheets: Math.ceil(book.pages.length / 2) });

  const subject: CoverSubject = {
    title: book.title,
    author: book.owner.displayName,
    handle: book.owner.username,
    slug: book.slug,
    gearMode: book.gearMode,
    gearBrand: book.gearBrand,
    gearModel: book.gearModel,
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let disposed = false;
    (async () => {
      // Decided here rather than at render: a server render has no window to
      // ask, and the answer is this browser's, not the page's.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
      if (!gl || reduced) {
        setMode('flat');
        return;
      }
      try {
        const [{ createBookScene }, loaded] = await Promise.all([
          import('./book-scene'),
          Promise.all(book.pages.map((page) => loadPicture(page.photograph.image.gridUrl))),
        ]);
        if (disposed) return;
        const pictures = loaded.map((picture, index) => picture ?? blank(index));
        const scene = await createBookScene({
          container: stage,
          pictures,
          paper: book.paper,
          cover: book.cover,
          subject,
          tableColor,
          reducedMotion: false,
          onChange: setState,
        });
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        setMode('3d');
        // Opens itself after a beat, so the first thing a reader sees moving
        // is the cover lifting rather than a closed box they have to prod.
        setTimeout(() => void scene.next(), 900);
      } catch (error) {
        console.error('FRAME photobook: the 3D book could not start', error);
        if (!disposed) setMode('flat');
      }
    })();

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // The book is the page's data and does not change under the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.slug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') void sceneRef.current?.next();
      if (event.key === 'ArrowLeft') void sceneRef.current?.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const total = book.pages.length;
  const from = state.turned * 2 + 1;
  const to = Math.min(total, state.turned * 2 + 2);
  const counter = !state.coverOpen
    ? t('viewer.closed')
    : state.turned >= state.sheets
      ? t('viewer.end')
      : from === to
        ? t('viewer.page', { page: from, total })
        : t('viewer.pages', { from, to, total });

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'relative overflow-hidden rounded-panel border border-line',
          'aspect-[4/5] sm:aspect-[16/10]',
        )}
        style={{ background: `radial-gradient(120% 90% at 50% 10%, color-mix(in srgb, ${tableColor} 70%, white 8%), ${tableColor} 70%)` }}
      >
        {/* The stage the scene mounts into. Hidden, not removed, while flat:
            a second mount would build a second scene. */}
        <div ref={stageRef} className={cn('absolute inset-0', mode !== '3d' && 'invisible')} aria-hidden={mode !== '3d'} />

        {mode === 'flat' ? (
          <FlatSpread book={book} />
        ) : null}

        {mode === 'loading' ? (
          <div className="absolute inset-0 grid place-items-center">
            <FlatSpread book={book} />
            <p className="absolute right-3 bottom-3 rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-meta text-muted backdrop-blur-sm">
              {t('viewer.loading')}
            </p>
          </div>
        ) : null}

        {mode === '3d' ? (
          <>
            <p className="pointer-events-none absolute top-3 right-3 rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-meta text-ink-soft tabular-nums backdrop-blur-sm">
              {counter}
            </p>
            <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-pill border border-line bg-surface/80 px-3 py-1.5 text-meta text-muted backdrop-blur-sm sm:block">
              {t('viewer.hint')}
            </p>
          </>
        ) : null}
      </div>

      {mode === '3d' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void sceneRef.current?.next()}>
            {state.coverOpen ? t('viewer.next') : t('viewer.open')}
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

/**
 * Every page as a two-up spread, in order. Server-rendered, so it is also what
 * a crawler and a reader without scripts get.
 */
function FlatSpread({ book }: { book: Photobook }) {
  const t = useTranslations('photobook');
  const sheets: Array<[Photobook['pages'][number] | undefined, Photobook['pages'][number] | undefined]> = [];
  for (let i = 0; i < book.pages.length; i += 2) sheets.push([book.pages[i], book.pages[i + 1]]);

  return (
    <div className="absolute inset-0 overflow-y-auto p-3 sm:p-5">
      <ol className="mx-auto grid max-w-3xl gap-4">
        {sheets.map(([left, right], index) => (
          <li key={index} className="grid grid-cols-2 gap-1 rounded-[6px] bg-surface p-1 shadow-popover">
            {[left, right].map((page, side) =>
              page ? (
                <div key={side} className="relative aspect-[1/1.32] overflow-hidden bg-surface-sunken">
                  <Image
                    src={page.photograph.image.gridUrl}
                    alt={page.photograph.altText}
                    fill
                    sizes="(max-width: 640px) 50vw, 360px"
                    className="object-cover"
                    priority={index === 0}
                  />
                </div>
              ) : (
                <div key={side} className="aspect-[1/1.32] bg-surface-sunken" aria-hidden />
              ),
            )}
          </li>
        ))}
      </ol>
      <p className="sr-only">{t('viewer.flatNote')}</p>
    </div>
  );
}
