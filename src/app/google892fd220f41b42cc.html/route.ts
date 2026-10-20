/**
 * Google Search Console ownership file for https://worldofstreetphoto.com/
 * (URL-prefix property). Google re-checks it from time to time, so it has to
 * stay: removing it unverifies the property. The token is public by design —
 * it proves control of the site, it grants nothing.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response('google-site-verification: google892fd220f41b42cc.html', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
