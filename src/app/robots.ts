import type { MetadataRoute } from 'next';

import { LOCALES, withLocalePrefix } from '@/i18n/locales';
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
 *
 * The page routes are listed once per language and once unprefixed, because a
 * crawler that finds `/upload` follows a redirect to `/en/upload` and a rule
 * naming only one of the two would leave the other open. `/api` and `/auth` are
 * endpoints rather than pages and have no language, so they are listed as they
 * are.
 */
const DISALLOWED_ENDPOINTS = ['/api', '/auth'] as const;

const DISALLOWED_PAGES = [
  '/upload',
  '/moderation',
  '/search',
  '/login',
  '/join',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
] as const;

function disallowed(): string[] {
  const paths: string[] = [...DISALLOWED_ENDPOINTS];

  for (const path of DISALLOWED_PAGES) {
    paths.push(path);
    for (const locale of LOCALES) paths.push(withLocalePrefix(path, locale));
  }

  return paths;
}

/**
 * Crawlers that collect pages to train models, as opposed to answering a
 * search. FRAME's copyright terms say plainly that uploading a photograph does
 * not license it for training a machine-learning model, so these are kept off
 * the whole site.
 *
 * The answer engines are not on this list and fall under `*` like any search
 * engine: OAI-SearchBot and ChatGPT-User (ChatGPT search), PerplexityBot and
 * Perplexity-User, Claude-SearchBot and Claude-User, DuckAssistBot. Blocking
 * Google-Extended keeps photographs out of Gemini training without touching
 * Google Search or its AI Overviews, which crawl as Googlebot.
 *
 * robots.txt is a request that reputable crawlers honour, not an access
 * control. It is the signal the training crawlers below document that they
 * respect.
 */
const TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
  'cohere-training-data-crawler',
  'Amazonbot',
  'Diffbot',
  'ImagesiftBot',
  'Timpibot',
  'omgili',
] as const;

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: disallowed(),
      },
      {
        userAgent: [...TRAINING_CRAWLERS],
        disallow: '/',
      },
    ],
    // No `host` directive: Google and Bing ignore it and Yandex retired it, so
    // emitting one would be a line of robots.txt that nothing reads.
    sitemap: `${base}/sitemap.xml`,
  };
}
