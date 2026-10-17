/** @type {import('next').NextConfig} */

// Hosts we are allowed to render optimised images from.
// Demo content is served from Unsplash; production images come from the
// configured storage provider (Supabase Storage or an R2 custom domain).
const remotePatterns = [
  { protocol: 'https', hostname: 'images.unsplash.com' },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  try {
    remotePatterns.push({ protocol: 'https', hostname: new URL(supabaseUrl).hostname });
  } catch {
    // Ignore a malformed value here; lib/config.ts reports it properly at runtime.
  }
}

const publicImageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;
if (publicImageHost) {
  remotePatterns.push({ protocol: 'https', hostname: publicImageHost });
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns,
    // Widths that match the variants described in docs/IMAGE-PIPELINE.md.
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [96, 160, 256, 384],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  experimental: {
    // Keeps server-action payloads small; uploads go straight to object storage
    // with a signed URL instead of passing through the Next.js server.
    serverActions: { bodySizeLimit: '1mb' },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
