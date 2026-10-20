import createNextIntlPlugin from 'next-intl/plugin';

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

// Crawlers that read the HTML as it arrives and never run JavaScript. Next
// streams a page's <title>, description, canonical and Open Graph tags after
// the first chunk for ordinary browsers, so they land in <body> and React moves
// them into <head> on the client. A crawler that does not run scripts never
// sees that move, and most AI answer engines parse <head> only. For the user
// agents below Next renders the page in one piece instead: metadata in <head>,
// and a real 404 status for a page that is not there.
//
// This replaces Next's own list, so that list (next/dist/shared/lib/router/
// utils/html-bots.js, 15.5) is repeated first, then Googlebot and the AI
// crawlers it does not name.
const NEXT_DEFAULT_HTML_LIMITED_BOTS =
  '[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight';
const SEARCH_AND_AI_BOTS =
  'Googlebot|GPTBot|OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|Amazonbot|DuckAssistBot|MistralAI-User|YouBot|cohere-ai|meta-externalagent|Bytespider|CCBot';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  htmlLimitedBots: new RegExp(`${NEXT_DEFAULT_HTML_LIMITED_BOTS}|${SEARCH_AND_AI_BOTS}`, 'i'),

  images: {
    remotePatterns,
    // Widths that match the variants described in docs/IMAGE-PIPELINE.md.
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [96, 160, 256, 384],
    formats: ['image/avif', 'image/webp'],
    // Next refuses any `quality` not on this list, and its default of 75 is a
    // second lossy pass over derivatives this project already built at 84–92.
    // 75 stays for everything incidental; the two higher values are for the
    // photograph itself and for an avatar. See lib/images/variants.ts.
    qualities: [75, 88, 90],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  experimental: {
    // Keeps server-action payloads small. A photograph never passes through
    // this server at all: it goes straight to object storage with a signed URL.
    // The one file that does arrive here is a profile picture, which the
    // browser shrinks to a 1024-pixel square first — a few hundred
    // kilobytes — and this ceiling is what a submission made without that
    // script is measured against. `UPLOAD_POLICY.maxAvatarBytes` states the
    // same number where the form and the action can read it.
    serverActions: { bodySizeLimit: '2mb' },
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

// Points next-intl at the per-request configuration in src/i18n/request.ts and
// nothing else. The config above is unchanged.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
