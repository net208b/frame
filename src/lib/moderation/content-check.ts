/**
 * The automated content check behind publishing at once.
 *
 * Sends one image — the display size FRAME generated, re-encoded with every tag
 * stripped, never the member's original file — to Google Cloud Vision
 * SafeSearch, and turns its likelihoods into one of three verdicts:
 *
 * - `clear`: nothing likely adult, violent or graphic. The upload publishes.
 * - `review`: something the classifier thinks is likely. A person looks first.
 * - `unavailable`: the check did not run. Treated exactly like `review`: a
 *   photograph is never published because a check failed to object.
 *
 * The thresholds lean towards review, because a false alarm costs a moderator
 * thirty seconds and a miss puts an explicit image on a public page. `racy` is
 * held only at VERY_LIKELY: street photography is full of beaches, swimwear and
 * people on summer evenings, and at LIKELY the queue would fill with them.
 *
 * Server only. The API key is read from GOOGLE_VISION_API_KEY and never leaves
 * this module.
 */

export type ContentVerdict = 'clear' | 'review' | 'unavailable';

export type Likelihood =
  | 'UNKNOWN'
  | 'VERY_UNLIKELY'
  | 'UNLIKELY'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERY_LIKELY';

export interface ContentCheckResult {
  provider: 'google_vision_safesearch' | 'none';
  verdict: ContentVerdict;
  adult: Likelihood | null;
  racy: Likelihood | null;
  violence: Likelihood | null;
  medical: Likelihood | null;
  spoof: Likelihood | null;
  /** Why it is not clear, in a sentence a moderator can read. Null when clear. */
  note: string | null;
}

const RANK: Record<Likelihood, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

/** The likelihood at or above which each category sends an upload to review. */
const HOLD_AT: Record<'adult' | 'racy' | 'violence' | 'medical', Likelihood> = {
  adult: 'POSSIBLE',
  violence: 'LIKELY',
  medical: 'VERY_LIKELY',
  racy: 'VERY_LIKELY',
};

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
const TIMEOUT_MS = 8_000;

function asLikelihood(value: unknown): Likelihood | null {
  return typeof value === 'string' && value in RANK ? (value as Likelihood) : null;
}

function unavailable(note: string): ContentCheckResult {
  return {
    provider: 'none',
    verdict: 'unavailable',
    adult: null,
    racy: null,
    violence: null,
    medical: null,
    spoof: null,
    note,
  };
}

/** Pure, so the thresholds can be read and tested without a network call. */
export function verdictFor(likelihoods: Pick<ContentCheckResult, 'adult' | 'racy' | 'violence' | 'medical'>): {
  verdict: ContentVerdict;
  note: string | null;
} {
  const held: string[] = [];
  // A classifier that cannot say is not a classifier that said no. Adult and
  // violence are the two categories a miss would put on a public page, so an
  // UNKNOWN (or missing) answer for either goes to a person.
  for (const category of ['adult', 'violence'] as const) {
    const found = likelihoods[category];
    if (found === null || found === 'UNKNOWN') held.push(`${category} could not be rated`);
  }
  for (const category of Object.keys(HOLD_AT) as Array<keyof typeof HOLD_AT>) {
    const found = likelihoods[category];
    if (found !== null && RANK[found] >= RANK[HOLD_AT[category]]) {
      held.push(`${category} ${found.toLowerCase().replace('_', ' ')}`);
    }
  }
  if (held.length === 0) return { verdict: 'clear', note: null };
  return { verdict: 'review', note: `The automated check rated this image: ${held.join(', ')}.` };
}

export function contentCheckConfigured(): boolean {
  return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

export async function checkImageContent(image: Uint8Array): Promise<ContentCheckResult> {
  if (typeof window !== 'undefined') {
    throw new Error('checkImageContent() runs on the server only: it reads GOOGLE_VISION_API_KEY.');
  }
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    return unavailable('No content checker is configured, so a person reviews every upload.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: Buffer.from(image).toString('base64') },
            features: [{ type: 'SAFE_SEARCH_DETECTION' }],
          },
        ],
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      // The status only: Google's error body can echo the request URL, and the
      // request URL carries the key.
      console.error(`FRAME content check: Vision answered HTTP ${response.status}`);
      return unavailable('The automated check could not run, so a person reviews this upload.');
    }

    const body = (await response.json()) as {
      responses?: Array<{
        safeSearchAnnotation?: Record<string, unknown>;
        error?: { message?: string };
      }>;
    };
    const first = body.responses?.[0];
    if (!first || first.error || !first.safeSearchAnnotation) {
      console.error(`FRAME content check: Vision returned no annotation — ${first?.error?.message ?? 'empty response'}`);
      return unavailable('The automated check returned no answer, so a person reviews this upload.');
    }

    const annotation = first.safeSearchAnnotation;
    const likelihoods = {
      adult: asLikelihood(annotation.adult),
      racy: asLikelihood(annotation.racy),
      violence: asLikelihood(annotation.violence),
      medical: asLikelihood(annotation.medical),
    };
    const { verdict, note } = verdictFor(likelihoods);

    return {
      provider: 'google_vision_safesearch',
      verdict,
      ...likelihoods,
      spoof: asLikelihood(annotation.spoof),
      note,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error(`FRAME content check: ${aborted ? 'timed out' : 'request failed'}`);
    return unavailable('The automated check did not answer in time, so a person reviews this upload.');
  } finally {
    clearTimeout(timer);
  }
}
