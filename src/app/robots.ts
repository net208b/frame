import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/config';

/**
 * robots.txt.
 *
 * The public surfaces are open. Everything disallowed here is disallowed for
 * one of three reasons: it is an account or moderation surface that no crawler
 * should walk, it is an endpoint rather than a page, or it is a results page
 * with nothing stable behind it.
 *
 * This is a crawling instruction, not a security control. `/moderation` and
 * `/upload` authorise every request for themselves on the server; listing them
 * here only stops a well-behaved crawler wasting its time and ours.
 *
 * Each entry below is a prefix rather than a directory: `/api` covers `/api`
 * itself and everything beneath it, whereas `/api/` would leave the bare path
 * open.
 */
const DISALLOWED = [
  '/api',
  '/upload',
  '/moderation',
  '/search',
  '/auth',
  '/login',
  '/join',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
] as const;

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...DISALLOWED],
      },
    ],
    // No `host` directive: Google and Bing ignore it and Yandex retired it, so
    // emitting one would be a line of robots.txt that nothing reads.
    sitemap: `${base}/sitemap.xml`,
  };
}
