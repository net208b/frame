import type { PhotographerProfile } from '@/types/domain';

/**
 * Demo photographers.
 *
 * Every record here is fictional. The dataset exists so the full interface can
 * be reviewed, and type-checked, before any external service is connected.
 * Anything rendered from this file is accompanied by a visible demo notice —
 * see `components/system/DemoNotice.tsx`.
 *
 * Counts are kept consistent with `photographs.ts` by the assertion at the
 * bottom of that module, so the profile pages never claim a number the
 * portfolio cannot show.
 */

const avatar = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=192&q=80`;

export const DEMO_PHOTOGRAPHERS: PhotographerProfile[] = [
  {
    id: '7a1c1e6e-0000-4000-8000-000000000001',
    username: 'kenjiwatanabe',
    // The demo sample is written in one language and never translated.
    translations: {},
    displayName: 'Kenji Watanabe',
    avatarUrl: avatar('photo-1500648767791-00dcc994a43e'),
    basedIn: 'Tokyo, Japan',
    biography:
      'I walk the same handful of streets behind Shinjuku most nights. The light changes, the people change, and the picture is never the same twice. Available light, mostly 35mm.',
    website: null,
    countryCode: 'JP',
    styles: ['black-and-white', 'candid'],
    collaboration: 'selective',
    critique: 'technical',
    socialLinks: ['https://example.com/kenjiwatanabe/frames'],
    cover: null,
    usualGear: ['Fujifilm X-Pro3', 'Fujinon XF 35mm f/1.4 R', 'Ricoh GR IIIx'],
    favouriteCities: ['Tokyo', 'Osaka', 'Taipei'],
    approach:
      'I shoot the same two stations every week until the light changes enough to make them somewhere else.',
    contactUrl: 'https://example.com/kenji',
    photographCount: 3,
    appreciationsReceived: 1184,
    locationsContributed: 3,
    followerCount: 59,
    followingCount: 20,
    memberSince: '2024-03-01',
    role: 'member',
  },
  {
    id: '7a1c1e6e-0000-4000-8000-000000000002',
    username: 'annakeller',
    // The demo sample is written in one language and never translated.
    translations: {},
    displayName: 'Anna Keller',
    avatarUrl: avatar('photo-1534528741775-53994a69daeb'),
    basedIn: 'Amsterdam, Netherlands',
    biography:
      'Architecture first, people second — though the people usually make the frame. I am interested in how a city tells you where to walk.',
    website: 'https://example.com/annakeller',
    countryCode: 'NL',
    styles: ['minimal', 'geometry', 'colour'],
    collaboration: 'open',
    critique: 'any',
    socialLinks: [
      'https://example.com/annakeller/pictures',
      'https://example.net/annakeller',
    ],
    cover: null,
    usualGear: ['Sony α7 IV', 'Sony FE 24mm f/1.4 GM', 'Sony FE 55mm f/1.8 ZA'],
    favouriteCities: ['Lisbon', 'Porto'],
    approach:
      'Mornings only, and never more than one lens. Deciding less leaves more attention for what is in front of me.',
    contactUrl: 'https://example.com/ana',
    photographCount: 4,
    appreciationsReceived: 742,
    locationsContributed: 3,
    followerCount: 37,
    followingCount: 12,
    memberSince: '2024-07-01',
    role: 'member',
  },
  {
    id: '7a1c1e6e-0000-4000-8000-000000000003',
    username: 'marcosilva',
    // The demo sample is written in one language and never translated.
    translations: {},
    displayName: 'Marco Silva',
    avatarUrl: avatar('photo-1506794778202-cad84cf45f1d'),
    basedIn: 'Rome, Italy',
    biography:
      'Long evenings, hard geometry, and a notebook of corners to come back to when the light is right. I travel for work and photograph on the way.',
    website: null,
    countryCode: 'IT',
    styles: ['geometry', 'film'],
    collaboration: null,
    critique: null,
    socialLinks: ['https://example.com/marcosilva/street'],
    cover: null,
    usualGear: ['Nikon Z f', 'Nikkor Z 40mm f/2', 'Nikkor Z 70-180mm f/2.8'],
    favouriteCities: ['Bangkok', 'Chiang Mai', 'Hanoi'],
    approach:
      'Markets before dawn. I go back to the same stalls until the people there stop noticing the camera.',
    contactUrl: null,
    photographCount: 4,
    appreciationsReceived: 668,
    locationsContributed: 3,
    followerCount: 33,
    followingCount: 11,
    memberSince: '2025-01-01',
    role: 'member',
  },
  {
    id: '7a1c1e6e-0000-4000-8000-000000000004',
    username: 'mayachen',
    // The demo sample is written in one language and never translated.
    translations: {},
    displayName: 'Maya Chen',
    avatarUrl: avatar('photo-1544005313-94ddf0286df2'),
    basedIn: 'New York, United States',
    biography:
      'Documentary habits applied to a daily commute. I photograph the same few blocks until something happens, which is most days.',
    website: 'https://example.com/mayachen',
    countryCode: 'US',
    styles: ['candid', 'layered', 'colour'],
    collaboration: 'open',
    critique: 'technical',
    socialLinks: [
      'https://example.com/mayachen/daily',
      'https://example.net/mayachen/zine',
    ],
    cover: null,
    usualGear: ['Leica Q3', 'Canon EOS R6 Mark II', 'Canon RF 35mm f/1.8 Macro IS STM'],
    favouriteCities: ['Berlin', 'Leipzig'],
    approach:
      'I follow a single colour through a city for a day and photograph only what carries it.',
    contactUrl: 'mailto:commissions@example.com',
    photographCount: 5,
    appreciationsReceived: 913,
    locationsContributed: 5,
    followerCount: 46,
    followingCount: 15,
    memberSince: '2024-11-01',
    role: 'member',
  },
  {
    id: '7a1c1e6e-0000-4000-8000-000000000005',
    username: 'pimframes',
    // The demo sample is written in one language and never translated.
    translations: {},
    displayName: 'Pim Thanaphon',
    avatarUrl: null,
    basedIn: 'Bangkok, Thailand',
    biography:
      'Neon is a light source like any other — you just have to respect its colour. Based in Bangkok, photographing wherever the job sends me.',
    website: null,
    countryCode: 'TH',
    styles: ['colour', 'flash'],
    collaboration: 'closed',
    critique: 'none',
    socialLinks: ['https://example.com/pimframes'],
    cover: null,
    usualGear: ['Sony α7C', 'Sigma 35mm f/1.4 DG DN Art'],
    favouriteCities: ['São Paulo', 'Buenos Aires'],
    approach:
      'Rain is the point, not the problem. Wet pavement gives a street two of everything.',
    contactUrl: null,
    photographCount: 2,
    appreciationsReceived: 587,
    locationsContributed: 1,
    followerCount: 29,
    followingCount: 10,
    memberSince: '2025-04-01',
    role: 'member',
  },
  {
    id: '7a1c1e6e-0000-4000-8000-000000000006',
    username: 'elliotreyes',
    // The demo sample is written in one language and never translated.
    translations: {},
    displayName: 'Elliot Reyes',
    avatarUrl: null,
    basedIn: 'London, United Kingdom',
    biography:
      'Hard geometry and the people who use it as a shortcut. I also help review new locations on FRAME.',
    website: null,
    countryCode: 'GB',
    styles: [],
    collaboration: null,
    critique: null,
    socialLinks: [],
    cover: null,
    usualGear: ['Panasonic Lumix S5 II', 'Lumix S 20-60mm f/3.5-5.6'],
    favouriteCities: ['Seoul', 'Busan'],
    approach:
      'I photograph queues: people waiting are the only ones not performing for anybody.',
    contactUrl: 'https://example.com/minseo',
    photographCount: 2,
    appreciationsReceived: 304,
    locationsContributed: 1,
    followerCount: 15,
    followingCount: 5,
    memberSince: '2024-05-01',
    role: 'moderator',
  },
];

/** The moderator account used by the demo moderation dashboard. */
export const DEMO_MODERATOR = DEMO_PHOTOGRAPHERS[5]!;

export function demoPhotographerById(id: string): PhotographerProfile | undefined {
  return DEMO_PHOTOGRAPHERS.find((person) => person.id === id);
}

export function demoPhotographerByUsername(username: string): PhotographerProfile | undefined {
  const needle = username.toLowerCase();
  return DEMO_PHOTOGRAPHERS.find((person) => person.username.toLowerCase() === needle);
}
