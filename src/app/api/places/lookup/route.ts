import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { reverseGeocode, searchPlaces } from '@/lib/geo/geocode';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * The place lookup the upload form uses: a point in, a place name out, or the
 * other way round.
 *
 * ONE ROUTE FOR BOTH DIRECTIONS because they are one feature with one budget.
 * The services behind it are free, community-run and unmetered (see
 * `lib/geo/geocode.ts`), which is exactly why the limit below is FRAME's own
 * rather than a provider's: nobody is going to bill us for abusing them, they
 * will simply block the address, and the first warning would be every member's
 * place lookup failing at once.
 *
 * WHY IT IS A SERVER ROUTE AT ALL. The browser could call Nominatim directly and
 * it would work, which is the problem. The policy asks for one identifiable
 * caller, a `User-Agent` that names the application, and caching. A browser
 * gives none of those: it is a different anonymous address every time, it cannot
 * set a `User-Agent`, and nothing it caches is shared with the next member. Here
 * there is one caller, it is named, every answer is cached for a day, and a
 * single member cannot spend the whole community's goodwill.
 *
 * WHAT IT WILL NOT DO. It does not write anything, it does not decide that a
 * place exists, and its answer is a suggestion into fields the member can still
 * edit on a proposal a moderator still reads. A failure is answered with an
 * empty result and no error shown: the member types, exactly as they did before
 * this existed.
 */

/**
 * Per member, per hour.
 *
 * Sixty was sized for dragging a pin. Since the name field suggests as the
 * member types, typing spends this budget too: one request per pause in a word
 * rather than one per search pressed, so naming a single place now costs
 * several lookups instead of one. A member proposing places as fast as the form
 * allows — five a day, by `LOCATION_POLICY.maxSubmissionsPerDay` — can spend a
 * dozen or more on each, between typing a name, changing their mind and
 * dragging the pin afterwards.
 *
 * Three a minute sustained is the new figure: comfortable for somebody working
 * carefully through a proposal, and still a firm stop on a loop in a client
 * this route cannot see. The cap matters because the far end is a free
 * community service; when it is reached the answer is empty rather than an
 * error, so suggestions quietly stop and the member keeps typing.
 */
const LOOKUPS_PER_HOUR = 180;
const HOUR_SECONDS = 60 * 60;

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  // The upstream answer is cached by `lib/geo/geocode.ts` for a day. This
  // response is per member and carries no secret, so a short private cache is
  // enough to absorb a member dragging the same pin twice.
  'cache-control': 'private, max-age=60',
};

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** A failed or refused lookup looks the same as one with no results. */
function nothing(): Response {
  return answer({ guess: null, matches: [] });
}

function coordinate(raw: string | null, limit: number): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const language = url.searchParams.get('lang') === 'th' ? 'th' : 'en';

  // Members only, because the upload form is. Demo mode has no session to read
  // — `getViewer()` returns null by design — so it is let through there, which
  // is also what makes the form usable on a developer's machine.
  if (!isDemoMode()) {
    const viewer = await getViewer();
    if (!viewer) return answer({ error: 'sign_in_required' }, 401);

    const verdict = await checkRateLimit(
      `places:lookup:${viewer.id}`,
      LOOKUPS_PER_HOUR,
      HOUR_SECONDS,
    );
    // Silently, with an empty answer: a member who has dragged a pin sixty times
    // in an hour is not doing anything wrong, and a red error on a field that
    // fills itself in would be a worse experience than the field staying empty.
    if (!verdict.allowed) return nothing();
  }

  const latitude = coordinate(url.searchParams.get('lat'), 90);
  const longitude = coordinate(url.searchParams.get('lng'), 180);

  if (latitude !== null && longitude !== null) {
    const guess = await reverseGeocode(latitude, longitude, language);
    return answer({ guess, matches: [] });
  }

  const query = url.searchParams.get('q');
  if (query) {
    const matches = await searchPlaces(query, language);
    return answer({ guess: null, matches });
  }

  return nothing();
}
