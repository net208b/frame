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
  thumb: { width: 320, quality: 72, format: 'webp', purpose: 'Moderation rows, dense lists' },
  grid: { width: 800, quality: 76, format: 'webp', purpose: 'Gallery and masonry cards' },
  display: { width: 1800, quality: 82, format: 'webp', purpose: 'Photo detail page' },
  full: { width: 2560, quality: 84, format: 'webp', purpose: 'Large-screen detail view' },
};

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
 * The avatar, which is not one of the photograph derivatives above.
 *
 * One size, square, and small: it is drawn at 128px at the very largest (the
 * profile masthead) and at 32px nearly everywhere else, so 256 covers a
 * two-times display with nothing to spare. A member's face is not a photograph
 * they published — it needs no gallery or detail derivative, and giving it one
 * would be storing four files to answer a question nobody asks.
 */
export const AVATAR_VARIANT = {
  size: 256,
  quality: 82,
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
