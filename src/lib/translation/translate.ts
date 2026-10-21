import type { Language } from './language';

/**
 * The translation provider.
 *
 * Server only. The key is read from GOOGLE_TRANSLATE_API_KEY and never leaves
 * this module — the same arrangement as the Vision call in
 * `lib/moderation/content-check.ts`, and for the same reason.
 *
 * A SEPARATE KEY FROM VISION, deliberately. `GOOGLE_VISION_API_KEY` is
 * documented as restricted to the Cloud Vision API in the Google Cloud console,
 * which is the right way to hold it; widening that restriction so one key could
 * do both would make the image key also a translation key. Two keys, each
 * restricted to one API, is the cheaper mistake.
 *
 * TRANSLATION IS ALWAYS OPTIONAL. Every failure here — no key, a refused
 * request, a timeout, a malformed answer — returns null and is logged, never
 * thrown. Nothing a member does may fail because a translation could not be
 * fetched: the words they wrote are already saved, and a missing translation
 * only means a reader sees the original, which is what they saw before this
 * feature existed.
 */

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const TIMEOUT_MS = 10_000;

/** Google's own cap on segments in one v2 request. */
const MAX_SEGMENTS = 128;

/**
 * v2 returns HTML-escaped text even when `format` is `text`: an apostrophe
 * comes back as `&#39;`, an ampersand as `&amp;`. Left alone, a Thai reader
 * would see "&#39;" in a photograph's title. This is the documented behaviour
 * rather than a bug, so the unescaping belongs here rather than in a report.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Last, so that "&amp;#39;" does not become an apostrophe.
    .replace(/&amp;/g, '&');
}

export function translationConfigured(): boolean {
  return Boolean(process.env.GOOGLE_TRANSLATE_API_KEY);
}

/**
 * Translate several strings at once, all from the same language into the same
 * language. The answer is positional: index `i` of the result is the
 * translation of index `i` of the input, or null if the whole call failed.
 */
export async function translateTexts(
  texts: string[],
  from: Language,
  to: Language,
): Promise<string[] | null> {
  if (typeof window !== 'undefined') {
    throw new Error('translateTexts() runs on the server only: it reads GOOGLE_TRANSLATE_API_KEY.');
  }
  if (texts.length === 0) return [];
  if (texts.length > MAX_SEGMENTS) {
    console.error(`FRAME translation: refusing ${texts.length} segments in one request.`);
    return null;
  }

  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        source: from,
        target: to,
        // Without this the API treats the input as HTML and will both escape
        // and reflow it. Member text is plain text and must stay that way.
        format: 'text',
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      // The status only. Google's error body can echo the request URL, and the
      // request URL carries the key.
      console.error(`FRAME translation: the provider answered HTTP ${response.status}`);
      return null;
    }

    const body = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: unknown }> };
    };
    const translations = body.data?.translations;
    if (!Array.isArray(translations) || translations.length !== texts.length) {
      console.error('FRAME translation: the provider returned an unexpected shape.');
      return null;
    }

    const out: string[] = [];
    for (const entry of translations) {
      if (typeof entry?.translatedText !== 'string') {
        console.error('FRAME translation: a segment came back without text.');
        return null;
      }
      out.push(decodeEntities(entry.translatedText));
    }
    return out;
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timed out' : 'failed';
    console.error(`FRAME translation: the request ${reason}.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
