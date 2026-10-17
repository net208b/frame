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
 * A map needs a style URL from a provider whose terms allow this traffic.
 * We deliberately do not ship a default public tile server: the demo.tiles
 * endpoints that MapLibre's examples use are for evaluation only, and quietly
 * shipping them would push the project into a terms violation on first launch.
 * See docs/EXTERNAL-SERVICES.md.
 */
export function isMapConfigured(): boolean {
  return Boolean(publicEnv().mapStyleUrl);
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
  /** Keeps a single bad actor from running up an egress bill. */
  maxFileBytes: 25 * 1024 * 1024,
  minPixelWidth: 800,
  minPixelHeight: 800,
  /** Verified by inspecting the file's magic bytes, not the declared type. */
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
  acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const,
  maxUploadsPerDay: 20,
  maxUploadsPerHour: 6,
  maxPendingUploads: 30,
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

export const PAGE_SIZE = {
  gallery: 24,
  locations: 18,
  profile: 24,
  moderation: 25,
} as const;
