import type { ImageVariantName, PhotoImage } from '@/types/domain';

/**
 * The derivative set generated once per upload.
 *
 * A gallery request must never download an original. Originals routinely run
 * 8–40 MB from a full-frame body; serving them to a 24-image grid is both the
 * fastest way to a slow site and the fastest way to an unexpected egress bill.
 * So every upload produces these four sizes, and the UI picks by role.
 */
export const IMAGE_VARIANTS: Record<
  ImageVariantName,
  { width: number; quality: number; format: 'webp' | 'avif'; purpose: string }
> = {
  thumb: { width: 320, quality: 80, format: 'webp', purpose: 'Moderation rows, dense lists' },
  grid: { width: 800, quality: 84, format: 'webp', purpose: 'Gallery and masonry cards' },
  display: { width: 1800, quality: 90, format: 'webp', purpose: 'Photo detail page, mid-size' },
  full: { width: 2560, quality: 92, format: 'webp', purpose: 'Photo detail page, large screens' },
};

/**
 * WHY THESE NUMBERS WENT UP.
 *
 * They started at 72–84, which is where a general-purpose site sits, and FRAME
 * is not one: the photograph is the product, and the first thing anybody said
 * about the old numbers was that the pictures looked soft. A webp at 84 next to
 * the same frame at 92 is a visible difference in exactly the places street
 * photography lives — gradients in a night sky, grain, the edge of a neon sign.
 * The cost is roughly a third more bytes on the one image a reader asked to
 * look at, and none at all on the grid, which still downloads an 800-pixel card.
 *
 * The other half of that fix is not in this file: `next/image` re-encodes
 * whatever it is given, so a derivative built at 92 was being served at the
 * default 75 and the quality here was never reaching anybody. See the `quality`
 * on PhotoStage and `images.qualities` in next.config.mjs.
 *
 * What is NOT done, and will not be: serving the original. It is kept, untouched
 * and unserved — a 20–50 MB file per frame is a gallery nobody on a phone can
 * open and an egress bill that grows with every view. "Quality" here means the
 * largest derivative is genuinely large and genuinely high quality, and that
 * the original is still there if a photograph ever has to be rebuilt.
 */

/** Storage key layout. Keeping the original separate makes re-processing cheap. */
export function storageKeys(photographId: string, ownerId: string) {
  const base = `${ownerId}/${photographId}`;
  return {
    original: `${base}/original`,
    thumb: `${base}/thumb.webp`,
    grid: `${base}/grid.webp`,
    display: `${base}/display.webp`,
    full: `${base}/full.webp`,
  };
}

/**
 * What `next/image` is allowed to re-encode a photograph at.
 *
 * It has to be declared in `images.qualities` as well — Next refuses a quality
 * that is not on that list — and it is deliberately a little below the
 * derivative's own 92: the second pass is then invisible, while leaving it at
 * the default 75 was not.
 */
export const PHOTOGRAPH_DISPLAY_QUALITY = 90;

/** The same, for an avatar: its file is built at 90 and must not be ground down. */
export const AVATAR_DISPLAY_QUALITY = 88;

/**
 * The avatar, which is not one of the photograph derivatives above.
 *
 * One size, square, and small: it is drawn at 128px at the very largest (the
 * profile masthead) and at 32px nearly everywhere else, so 256 covers a
 * two-times display with nothing to spare. A member's face is not a photograph
 * they published — it needs no gallery or detail derivative, and giving it one
 * would be storing four files to answer a question nobody asks.
 */
export const AVATAR_VARIANT = {
  // 512, not 256. The profile masthead draws the avatar at 128 CSS pixels,
  // which is 256 device pixels on a two-times display and 384 on a phone — so a
  // 256-pixel file had no headroom at all on the one screen that shows it
  // largest, and was being upscaled on most phones. At this size the same
  // picture has something to spare everywhere it appears.
  size: 512,
  quality: 90,
  format: 'webp',
  contentType: 'image/webp',
} as const;

/**
 * Where a member's avatar lives: one object per account, replaced in place.
 *
 * DETERMINISTIC, unlike the photograph keys, which carry the photograph's id.
 * That is what lets the account be tidied up without recording a key anywhere:
 * removing the avatar, or deleting the account, can derive the object from the
 * member id alone. The cost is that the public URL does not change when the
 * picture does, and these objects are served with a year of cache — so the URL
 * stored on the profile carries a version (see `avatarPublicUrl`), and the key
 * stays stable underneath it.
 */
export function avatarStorageKey(ownerId: string): string {
  return `${ownerId}/avatars/avatar.${AVATAR_VARIANT.format}`;
}

/**
 * The URL written to `profiles.avatar_url`: the object's public URL with a
 * fingerprint of the bytes on it.
 *
 * The query string is the cache-buster, and a content fingerprint rather than a
 * timestamp so that saving the same picture twice does not change the address
 * and re-download it for everybody who had it.
 */
export function avatarPublicUrl(publicUrl: string, fingerprint: string): string {
  return `${publicUrl}?v=${fingerprint}`;
}

/**
 * `sizes` values matching the real layouts, so the browser downloads one
 * correctly-sized image instead of the widest candidate.
 */
export const IMAGE_SIZES = {
  /** 4-up masonry at desktop, 2-up tablet, 1-up phone. */
  galleryCard: '(max-width: 420px) 92vw, (max-width: 820px) 46vw, (max-width: 1100px) 31vw, 23vw',
  /** Detail page: image column is ~62% of a 1440px container. */
  detail: '(max-width: 900px) 100vw, 62vw',
  /** Homepage hero: right-hand column. */
  hero: '(max-width: 650px) 100vw, (max-width: 950px) 44vw, 40vw',
  /** Small editorial strips and related rows. */
  strip: '(max-width: 650px) 60vw, 22vw',
  /**
   * Kept for a fixed-size avatar elsewhere, and no longer used by `Avatar`
   * itself: that component declares the size it is actually drawing, because a
   * flat 48px here made the 128px masthead avatar download a 48px file.
   */
  avatar: '48px',
} as const;

/** Aspect presets used by the demo dataset, so the grid has real variety. */
export const ASPECT = {
  landscape: 3 / 2,
  wide: 16 / 9,
  square: 1,
  portrait: 4 / 5,
  tall: 2 / 3,
} as const;

export type AspectPreset = keyof typeof ASPECT;

/**
 * Build a {@link PhotoImage} from Unsplash URLs for the demo dataset.
 *
 * Unsplash is used only for bundled demo content. Both `w` and `h` are sent so
 * the delivered crop matches the dimensions we declare to the layout — if the
 * two disagree, every card reflows once the image lands.
 */
export function unsplashImage(
  photoId: string,
  aspect: AspectPreset | number = 'landscape',
  options: { saturation?: number } = {},
): PhotoImage {
  const ratio = typeof aspect === 'number' ? aspect : ASPECT[aspect];

  const build = (targetWidth: number, quality: number) => {
    const url = new URL(`https://images.unsplash.com/${photoId}`);
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');
    url.searchParams.set('crop', 'entropy');
    url.searchParams.set('w', String(targetWidth));
    url.searchParams.set('h', String(Math.round(targetWidth / ratio)));
    url.searchParams.set('q', String(quality));
    if (options.saturation !== undefined) {
      url.searchParams.set('sat', String(options.saturation));
    }
    return url.toString();
  };

  return {
    thumbUrl: build(IMAGE_VARIANTS.thumb.width, IMAGE_VARIANTS.thumb.quality),
    gridUrl: build(IMAGE_VARIANTS.grid.width, IMAGE_VARIANTS.grid.quality),
    displayUrl: build(IMAGE_VARIANTS.display.width, IMAGE_VARIANTS.display.quality),
    width: IMAGE_VARIANTS.display.width,
    height: Math.round(IMAGE_VARIANTS.display.width / ratio),
  };
}

/** Aspect ratio as a CSS-friendly number, guarding against bad metadata. */
export function aspectRatio(image: Pick<PhotoImage, 'width' | 'height'>): number {
  if (!image.width || !image.height) return 1;
  const ratio = image.width / image.height;
  // Clamp absurd panoramas so one row cannot destroy the grid rhythm.
  return Math.min(Math.max(ratio, 0.45), 3);
}

export function orientation(
  image: Pick<PhotoImage, 'width' | 'height'>,
): 'portrait' | 'landscape' | 'square' {
  const ratio = aspectRatio(image);
  if (ratio > 1.08) return 'landscape';
  if (ratio < 0.92) return 'portrait';
  return 'square';
}
