import { ImageResponse } from 'next/og';

import { coverPreset, gearText } from '@/components/photobook/covers';
import { getPhotobook } from '@/lib/data/repository';

/**
 * The share card for a book: its cover, as a 1200 x 630 PNG.
 *
 * Not the canvas drawing the browser makes — that needs a DOM — but the same
 * colours, the same title and the same gear line, laid out as a book standing
 * on the card's own ground. This is what Instagram, LINE and the rest show
 * when the short link is pasted, so it is drawn for a thumbnail: one big
 * title, one colour, no small type.
 *
 * Dynamic, like the page: the title and cover are read from the database on
 * each request, and the response is cached by the platform's image CDN.
 */
export const dynamic = 'force-dynamic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function BookShareImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getPhotobook(slug);
  const preset = coverPreset(book?.cover ?? 'linen');
  const title = book?.title ?? 'FRAME';
  const author = book?.owner.displayName ?? '';
  const gear = book
    ? gearText({
        title: book.title,
        author,
        handle: book.owner.username,
        slug: book.slug,
        gearMode: book.gearMode,
        gearBrand: book.gearBrand,
        gearModel: book.gearModel,
      })
    : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#1c1a14',
          alignItems: 'center',
          padding: '48px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: 380,
            height: 534,
            background: preset.chip,
            borderRadius: 10,
            boxShadow: '24px 32px 60px rgba(0,0,0,0.55)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 32,
            color: preset.ink,
            border: `2px solid ${preset.ink}22`,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 18, marginTop: 14, opacity: 0.8 }}>{author}</div>
          {gear ? <div style={{ fontSize: 14, marginTop: 10, opacity: 0.65 }}>{`Shot on ${gear}`}</div> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 72, color: '#f1ede4', flex: 1 }}>
          <div style={{ fontSize: 22, letterSpacing: 4, opacity: 0.6 }}>FRAME PHOTOBOOK</div>
          <div style={{ fontSize: 56, fontWeight: 700, marginTop: 18, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 28, marginTop: 18, opacity: 0.85 }}>{author}</div>
          <div style={{ fontSize: 22, marginTop: 36, opacity: 0.55 }}>{`worldofstreetphoto.com/b/${slug}`}</div>
        </div>
      </div>
    ),
    size,
  );
}
