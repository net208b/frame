'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { PhotobookCover } from '@/types/domain';

import { COVER_H, COVER_W, coverPreset, drawCoverFace, type CoverSubject } from './covers';

/**
 * One book's front cover, drawn the way the 3D book draws it.
 *
 * The same `drawCoverFace` as the book page, the Settings swatches and the
 * cover gallery, so a book looks like itself on the shelf, in the editor and
 * when opened. It needs a canvas, hence a client component; the server renders
 * the sized box so the shelf lays out before any script runs, and the drawing
 * lands in it a moment later.
 */
export function BookCover({
  cover,
  subject,
  className,
}: {
  cover: PhotobookCover;
  subject: CoverSubject;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = host.clientWidth || 200;
    const drawn = drawCoverFace('front', coverPreset(cover), subject, [], (cssWidth * dpr) / COVER_W);
    host.width = drawn.width;
    host.height = drawn.height;
    host.getContext('2d')?.drawImage(drawn, 0, 0);
    // Redrawn only when the cover or its words change; the subject object is
    // rebuilt by the server on every render, so its fields are the deps.
  }, [cover, subject.title, subject.author, subject.handle, subject.slug, subject.gearMode, subject.gearBrand, subject.gearModel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={ref}
      className={cn('block w-full', className)}
      style={{ aspectRatio: `${COVER_W} / ${COVER_H}`, background: coverPreset(cover).chip }}
      aria-hidden
    />
  );
}
