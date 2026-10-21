import { ImageResponse } from 'next/og';

import { getSeries } from '@/lib/data/repository';

/**
 * The share card for a series: its cover frame with the title over it, as a
 * 1200 x 630 PNG. The cover is the 2560px display derivative, never an
 * original — an original carries EXIF and GPS, and nothing public serves it.
 *
 * Dynamic, like the page; cached by the platform's image CDN.
 */
export const dynamic = 'force-dynamic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function SeriesShareImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getSeries(slug);
  const title = series?.title ?? 'FRAME';
  const author = series?.owner.displayName ?? '';
  const cover = series?.cover?.image.displayUrl ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#1c1a14',
          fontFamily: 'sans-serif',
        }}
      >
        {cover ? (
          <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '56px 72px',
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.78) 100%)',
            color: '#f1ede4',
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 4, opacity: 0.7 }}>FRAME SERIES</div>
          <div style={{ fontSize: 60, fontWeight: 700, marginTop: 14, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 28, marginTop: 16, opacity: 0.9 }}>{author}</div>
          <div style={{ fontSize: 22, marginTop: 20, opacity: 0.6 }}>{`worldofstreetphoto.com/s/${slug}`}</div>
        </div>
      </div>
    ),
    size,
  );
}
