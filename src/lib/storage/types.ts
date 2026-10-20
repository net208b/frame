import { UPLOAD_POLICY } from '@/lib/config';
import { AVATAR_VARIANT, IMAGE_VARIANTS } from '@/lib/images/variants';

/**
 * The storage contract: the shapes a driver speaks, and the invariants every
 * driver has to enforce before it signs anything.
 *
 * The interface is deliberately narrow — sign an upload, name a public URL,
 * delete some keys — so that moving from Supabase Storage to R2 is a change to
 * `STORAGE_PROVIDER` rather than a rewrite. Anything a provider offers beyond
 * these three operations is not used, because the moment one driver depends on
 * it the other is no longer a drop-in.
 */

export interface SignedUploadRequest {
  /** A key built by `storageKeys()` in lib/images/variants. Nothing else. */
  key: string;
  /** The media type the grant is restricted to. */
  contentType: string;
  /** The ceiling the grant is intended to allow, in bytes. */
  maxBytes: number;
}

export interface SignedUploadGrant {
  url: string;
  method: 'PUT' | 'POST';
  /** Headers the client must send unchanged, or the grant will not verify. */
  headers: Record<string, string>;
  /** Form fields, for a provider that signs a POST policy instead of a PUT. */
  fields?: Record<string, string>;
  /** The real lifetime of this grant, not a hoped-for one. */
  expiresInSeconds: number;
}

export interface StorageDriver {
  name: 'supabase' | 'r2';
  createSignedUpload(input: SignedUploadRequest): Promise<SignedUploadGrant>;
  publicUrl(key: string): string;
  remove(keys: string[]): Promise<void>;
}

/** Thrown when the selected provider is missing a variable it cannot work without. */
export class StorageConfigurationError extends Error {
  /** The environment variable to set, for the message the UI shows. */
  readonly variable: string | null;

  constructor(message: string, variable: string | null = null) {
    super(message);
    this.name = 'StorageConfigurationError';
    this.variable = variable;
  }
}

/** Thrown when the provider was reachable and refused, or returned nonsense. */
export class StorageRequestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageRequestError';
  }
}

/**
 * How long a grant should live. Long enough for a 25 MB upload on a poor
 * connection, short enough that a leaked URL is worth little. A provider that
 * cannot honour this reports its own lifetime on the grant instead.
 */
export const SIGNED_UPLOAD_TTL_SECONDS = 600;

/* ------------------------------------------------------------------------ */
/* Key layout                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The leaf names `storageKeys` produces, derived from `IMAGE_VARIANTS` so the
 * two cannot drift: adding a derivative there makes it signable here.
 */
const LEAF_NAMES: ReadonlySet<string> = new Set<string>([
  'original',
  ...Object.entries(IMAGE_VARIANTS).map(([name, variant]) => `${name}.${variant.format}`),
]);

/** Owner id and photograph id, matching the identifiers the schemas accept. */
const KEY_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The one account-level object: `<owner>/avatars/avatar.webp`.
 *
 * It is matched by its own rule rather than by widening the rule above, because
 * `avatars` is a fixed word in a position that otherwise holds a photograph id.
 * Anything else under that folder is not a key this app writes, and the driver
 * refuses to sign or delete it.
 */
const AVATAR_FOLDER = 'avatars';
const AVATAR_LEAF = `avatar.${AVATAR_VARIANT.format}`;

/**
 * The content type each leaf must carry. `original` may be any accepted upload
 * type; a derivative must be in the format FRAME generated it in, so a grant
 * for `grid.webp` can never be used to write a PNG.
 */
function expectedContentTypes(leaf: string): readonly string[] {
  if (leaf === 'original') return UPLOAD_POLICY.acceptedMimeTypes;
  if (leaf === AVATAR_LEAF) return [AVATAR_VARIANT.contentType];
  const extension = leaf.slice(leaf.lastIndexOf('.') + 1);
  return [`image/${extension}`];
}

export interface ParsedStorageKey {
  ownerId: string;
  /** Null for an account-level object — today, only the avatar. */
  photographId: string | null;
  leaf: string;
}

/**
 * Parse a key, or return null when it does not match the layout built by
 * `storageKeys()`. Keys arrive from request bodies, so a key that has not
 * been through this function must never reach a provider: a stray `..` or a
 * fourth segment is how one member's upload ends up overwriting another's.
 */
export function parseStorageKey(key: string): ParsedStorageKey | null {
  const segments = key.split('/');
  if (segments.length !== 3) return null;

  const [ownerId, photographId, leaf] = segments;
  if (ownerId === undefined || photographId === undefined || leaf === undefined) return null;
  if (!KEY_SEGMENT.test(ownerId)) return null;

  if (photographId === AVATAR_FOLDER) {
    return leaf === AVATAR_LEAF ? { ownerId, photographId: null, leaf } : null;
  }

  if (!KEY_SEGMENT.test(photographId)) return null;
  if (!LEAF_NAMES.has(leaf)) return null;

  return { ownerId, photographId, leaf };
}

/**
 * Check a grant request before a provider is called.
 *
 * Throws rather than returning a result: a caller reaching here with an invalid
 * key has skipped validation, which is a bug in the caller and not something a
 * member can fix by editing a form.
 */
export function assertSignableUpload(input: SignedUploadRequest): ParsedStorageKey {
  const parsed = parseStorageKey(input.key);
  if (!parsed) {
    throw new StorageRequestError(
      `Refusing to sign "${input.key}": a storage key must be owner/photograph/name as built by storageKeys(), or owner/avatars/${AVATAR_LEAF}.`,
    );
  }

  const allowed = expectedContentTypes(parsed.leaf);
  if (!allowed.includes(input.contentType)) {
    throw new StorageRequestError(
      `Refusing to sign ${parsed.leaf} as ${input.contentType}. Allowed: ${allowed.join(', ')}.`,
    );
  }

  if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1) {
    throw new StorageRequestError('A signed upload needs a positive byte ceiling.');
  }

  if (input.maxBytes > UPLOAD_POLICY.maxFileBytes) {
    throw new StorageRequestError(
      `Refusing to sign a grant for ${input.maxBytes} bytes: the upload policy allows ${UPLOAD_POLICY.maxFileBytes}.`,
    );
  }

  return parsed;
}

/** Percent-encode a key for a URL path, leaving the separators alone. */
export function encodeKeyPath(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
