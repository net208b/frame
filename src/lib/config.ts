/**
 * Runtime configuration and capability detection.
 *
 * FRAME is built so the full UI can be reviewed before any external service
 * exists. Every capability is derived from environment variables rather than
 * assumed, and the UI must *say* when a capability is missing instead of
 * pretending an action succeeded.
 *
 * Nothing in this module may read a secret in code that runs in the browser.
 * Server-only secrets live in `serverEnv()`, which throws if called from a
 * client bundle.
 */

export const SITE = {
  name: 'FRAME',
  tagline: 'Discover places. Capture moments.',
  description:
    'A community for street photographers. Discover photographs, explore the real places behind them, and learn how each frame was made.',
  locale: 'en',
} as const;

/** Public base URL, used for canonical links, Open Graph and the sitemap. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  // Vercel sets this for preview deployments.
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}

/* ------------------------------------------------------------------------ */
/* Public (browser-safe) environment                                         */
/* ------------------------------------------------------------------------ */

export interface PublicEnv {
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  mapStyleUrl: string | null;
  mapAttribution: string | null;
}

export function publicEnv(): PublicEnv {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    // Supabase renamed the browser key; accept both names so a project
    // created at any point in the last two years works unchanged.
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      null,
    mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? null,
    mapAttribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? null,
  };
}

/* ------------------------------------------------------------------------ */
/* Capabilities                                                              */
/* ------------------------------------------------------------------------ */

/**
 * True when Supabase credentials exist, so the app reads real data and real
 * sessions. False means the app renders the bundled demo dataset instead.
 *
 * This flag is what keeps the product honest: in demo mode, write actions are
 * disabled with an explicit explanation rather than reporting fake success.
 */
export function isDatabaseConfigured(): boolean {
  const env = publicEnv();
  return Boolean(env.supabaseUrl && env.supabasePublishableKey);
}

/** Demo mode is simply the absence of a database. */
export function isDemoMode(): boolean {
  return !isDatabaseConfigured();
}

/**
 * The one value of `NEXT_PUBLIC_MAP_STYLE_URL` that is not a style URL: it
 * switches the map off instead of replacing it. Declared here rather than
 * beside the map code because `isMapConfigured` below is what reads it, and the
 * map modules import this one, not the other way round.
 */
export const MAP_DISABLED = 'off';

/**
 * Whether a map may be drawn at all.
 *
 * It normally may. FRAME serves its own basemap style over tiles it is licensed
 * to use (`src/lib/map/basemap.ts`), so a deployment needs no tile subscription
 * and no API key to show a map — which is why this no longer asks whether a
 * provider has been configured. What it asks is whether the operator has turned
 * maps off, by setting the style variable to the one value that means that.
 *
 * An operator might: the basemap's tiles come from a third party, and a
 * deployment that will not call a host it did not choose should be able to say
 * so and fall back to the location list. Pointing the variable at a provider's
 * own style instead replaces FRAME's basemap and still draws a map.
 * See docs/EXTERNAL-SERVICES.md.
 */
export function isMapConfigured(): boolean {
  return publicEnv().mapStyleUrl !== MAP_DISABLED;
}

export interface Capabilities {
  database: boolean;
  auth: boolean;
  uploads: boolean;
  maps: boolean;
  demoMode: boolean;
}

export function capabilities(): Capabilities {
  const database = isDatabaseConfigured();
  return {
    database,
    auth: database,
    uploads: database && Boolean(process.env.STORAGE_PROVIDER ?? 'supabase'),
    maps: isMapConfigured(),
    demoMode: !database,
  };
}

/* ------------------------------------------------------------------------ */
/* Server-only environment                                                   */
/* ------------------------------------------------------------------------ */

export interface ServerEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** Bypasses row-level security. Server-side only, never sent to a browser. */
  supabaseServiceRoleKey: string | null;
  storageProvider: 'supabase' | 'r2';
  storageBucket: string;
  r2: {
    accountId: string | null;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    publicHost: string | null;
  };
}

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must never be called from client-side code.');
  }

  const pub = publicEnv();
  if (!pub.supabaseUrl || !pub.supabasePublishableKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See docs/ENVIRONMENT.md.',
    );
  }

  const provider = (process.env.STORAGE_PROVIDER ?? 'supabase') as 'supabase' | 'r2';

  return {
    supabaseUrl: pub.supabaseUrl,
    supabasePublishableKey: pub.supabasePublishableKey,
    supabaseServiceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? null,
    storageProvider: provider,
    storageBucket: process.env.STORAGE_BUCKET ?? 'photographs',
    r2: {
      accountId: process.env.R2_ACCOUNT_ID ?? null,
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? null,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? null,
      publicHost: process.env.NEXT_PUBLIC_IMAGE_HOST ?? null,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Policy limits — enforced server-side, surfaced in the UI                  */
/* ------------------------------------------------------------------------ */

export const UPLOAD_POLICY = {
  /**
   * 50 MB. A 61-megapixel full-frame raw export or a 16-bit TIFF-sourced JPEG
   * runs past 25, and refusing those was refusing exactly the photographs this
   * site is for. The ceiling still exists to keep one account from running up
   * an egress bill, and nothing this large is ever served: it is decoded once
   * into the derivatives above and then only kept.
   *
   * Two things have to agree with this number outside the application: the
   * storage bucket's own `file_size_limit`, which is set where the bucket was
   * created and not in a migration, and the memory of the function that decodes
   * it — a 50 MB JPEG is around 8000 x 6000 pixels, which sharp holds as
   * roughly 400 MB while it works.
   */
  maxFileBytes: 50 * 1024 * 1024,
  minPixelWidth: 800,
  minPixelHeight: 800,
  /** Verified by inspecting the file's magic bytes, not the declared type. */
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
  acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const,
  maxUploadsPerDay: 20,
  maxUploadsPerHour: 6,
  maxPendingUploads: 30,
  /**
   * An avatar, which is posted to a server action rather than sent straight to
   * storage with a grant. Two megabytes is the ceiling on that request body
   * (`serverActions.bodySizeLimit`), and the browser shrinks a picture to a
   * couple of hundred kilobytes before sending it, so this limit is only ever
   * met by a submission made without JavaScript.
   */
  maxAvatarBytes: 2 * 1024 * 1024,
  /** Below this there is nothing to crop a 256-pixel square out of. */
  minAvatarPixels: 128,
  maxAvatarChangesPerHour: 12,
} as const;

export const LOCATION_POLICY = {
  maxSubmissionsPerDay: 5,
  /** Two submissions closer than this are flagged as possible duplicates. */
  duplicateRadiusMetres: 120,
  /** Coordinate precision published for an approved location (~11 m). */
  publicCoordinateDecimals: 4,
  /** Precision used when a location is marked as privacy-sensitive (~1.1 km). */
  reducedCoordinateDecimals: 2,
} as const;

export const APPRECIATION_POLICY = {
  maxPerMinute: 20,
  maxPerHour: 200,
  /** Half-life in hours used by the trending score. See lib/ranking.ts. */
  trendingHalfLifeHours: 36,
} as const;

/**
 * How many of a place's photographs a map pin carries, newest first.
 *
 * Three, because the card on the map shows the newest frame with two edges
 * behind it — enough for the stack to read as a stack, few enough that the map
 * read stays a single query.
 *
 * It lives here rather than beside `MapPin` because both the live query and the
 * demo dataset need it, and both are imported *by* the module that declares
 * that type: exporting it from there and importing it back would close an
 * import cycle.
 */
export const MAP_PIN_PHOTOGRAPH_SAMPLE = 3;

export const PAGE_SIZE = {
  gallery: 24,
  locations: 18,
  profile: 24,
  moderation: 25,
} as const;
