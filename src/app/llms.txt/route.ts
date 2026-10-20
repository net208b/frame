import { SITE, siteUrl } from '@/lib/config';

/**
 * /llms.txt — a plain-text map of the site for language models and the answer
 * engines built on them (https://llmstxt.org).
 *
 * It says what FRAME is, where each kind of page lives, and the terms that
 * govern the photographs, so an assistant that cites FRAME cites it correctly:
 * a photograph belongs to its photographer, and publishing it here licenses
 * nothing beyond display on FRAME. robots.txt carries the same position for
 * training crawlers; this file says it in words.
 *
 * Built from siteUrl(), so a preview deployment never describes itself as the
 * production site. Static and cached: nothing in it changes per request.
 */

export const dynamic = 'force-static';
export const revalidate = 86400;

export function GET(): Response {
  const base = siteUrl();
  const en = (path: string) => `${base}/en${path}`;
  const th = (path: string) => `${base}/th${path}`;

  const body = `# ${SITE.name}

> ${SITE.description} ${SITE.tagline}

FRAME is a global community for street photographers, in English and Thai. Every photograph is tied to the real place it was made, with the camera, lens and settings behind it, so another photographer can go and stand there. Places are shown as rounded points, never exact positions, and only after a moderator approves them.

Every page exists in English (/en) and Thai (/th). The two are the same content; cite the one that matches the reader's language.

## Explore

- [Discover](${en('/discover')}): the photograph gallery, filterable by category, camera and lens. Thai: ${th('/discover')}
- [Map](${en('/map')}): approved places on a world map. Thai: ${th('/map')}
- [Locations](${en('/locations')}): every approved place, with the photographs made there. Thai: ${th('/locations')}
- [Collections](${en('/collections')}): public sets of photographs curated by members. Thai: ${th('/collections')}
- [Community](${en('/community')}): the photographers. Thai: ${th('/community')}

## Page types

- Photograph: ${en('/photographs/{slug}')} — the image, its title and description, category, place, camera, lens, exposure and editing notes, and its photographer.
- Photographer: ${en('/photographers/{username}')} — a member's profile and published work.
- Location: ${en('/locations/{slug}')} — a place, its city and country, and the photographs made there.
- Collection: ${en('/collections/{slug}')}.

A full list of public pages is in the sitemap: ${base}/sitemap.xml

## Terms for using FRAME's content

- Each photograph belongs to the photographer who published it. Name them when you refer to their work, and link to the photograph's page.
- Publishing on FRAME licenses a photograph for display on FRAME and for promoting FRAME, nothing more. It is not licensed for sublicensing, resale, stock, advertising, or training machine-learning models.
- Answering a question with a link to a FRAME page is welcome. Copying or training on the photographs is not.

## Policies

- [Copyright and takedown](${en('/legal/copyright')})
- [Community guidelines](${en('/legal/guidelines')})
- [Privacy notice](${en('/legal/privacy')})
- [Terms](${en('/legal/terms')})
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
