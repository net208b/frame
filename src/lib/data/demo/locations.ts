import { publishableCoordinates } from '@/lib/geo';
import type { LocationDetail } from '@/types/domain';

import { DEMO_PHOTOGRAPHERS } from './photographers';

/**
 * Demo locations.
 *
 * The set is deliberately matched to the actual subject of each bundled demo
 * photograph: a caption must never describe a place the picture does not show.
 *
 * Coordinates here are the published, policy-processed values — four decimals
 * for an ordinary public street, two for anything flagged sensitive. Every
 * restriction carries a source, because an unsourced "no tripods" note is a
 * rumour the platform would be putting its name to.
 */

const [kenji, anna, marco, maya, pim, elliot] = DEMO_PHOTOGRAPHERS;

interface RawLocation {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  isSensitive?: boolean;
  withholdCoordinates?: boolean;
  description: string;
  categories: LocationDetail['categories'];
  shootingNotes: string[];
  restrictions: LocationDetail['restrictions'];
  bestTimeOfDay: string | null;
  submittedById: string | null;
  approvedAt: string;
  photographCount: number;
}

const RAW: RawLocation[] = [
  {
    id: 'b2d5f100-0000-4000-8000-000000000001',
    slug: 'shinjuku-backstreets-tokyo',
    name: 'Shinjuku backstreets',
    city: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    latitude: 35.693835,
    longitude: 139.699738,
    description:
      'The grid of narrow service streets behind the main Shinjuku strip. Almost no daylight reaches them, so the entire exposure is signage, vending machines and whatever is reflecting off the asphalt.',
    categories: ['street', 'night'],
    shootingNotes: [
      'Everything here is mixed lighting. Set white balance by hand or shoot raw and expect to split-tone the shadows.',
      'The streets are roughly four metres wide. A 28mm equivalent gives you the walls as well as the signage.',
      'After rain the asphalt doubles every light source. It is worth going out in bad weather.',
    ],
    restrictions: [
      {
        kind: 'private-property',
        note: 'The streets are public, but the premises either side are not. Several bars display no-photography notices at the door.',
        source: 'On-site signage recorded during a FRAME moderator review, March 2026.',
        recordedAt: '2026-03-14T09:00:00.000Z',
      },
      {
        kind: 'no-tripod',
        note: 'A tripod blocks a lane this narrow. Handheld or a wall brace is the practical option.',
        source: 'FRAME moderator review, March 2026.',
        recordedAt: '2026-03-14T09:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'After dark, 20:00 onwards',
    submittedById: kenji!.id,
    approvedAt: '2026-03-15T11:20:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000002',
    slug: 'tokyo-twilight-overlook',
    name: 'Tokyo twilight overlook',
    city: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    latitude: 35.660429,
    longitude: 139.729241,
    description:
      'An elevated public viewpoint over the low-rise sprawl, with the towers behind it. The interest is in how dense and flat the city reads from above at blue hour.',
    categories: ['urban-landscape', 'night'],
    shootingNotes: [
      'Blue hour lasts around twenty-five minutes here. Set up before the sun is fully down.',
      'A short telephoto compresses the sprawl; a wide lens mostly gives you sky.',
      'Glass between you and the city causes reflections. A rubber lens hood pressed to the glass solves it.',
    ],
    restrictions: [],
    bestTimeOfDay: 'Blue hour',
    submittedById: kenji!.id,
    approvedAt: '2026-02-03T10:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000003',
    slug: 'higashiyama-kyoto',
    name: 'Higashiyama, below Yasaka Pagoda',
    city: 'Kyoto',
    country: 'Japan',
    countryCode: 'JP',
    latitude: 34.99,
    longitude: 135.78,
    isSensitive: true,
    description:
      'The sloping machiya street that frames the pagoda. Heavily visited, genuinely beautiful, and subject to photography restrictions that are enforced in the surrounding district.',
    categories: ['street', 'documentary', 'architecture'],
    shootingNotes: [
      'Before 07:00 the street is close to empty. By 10:00 it is shoulder to shoulder.',
      'The pagoda sits at the top of the slope, so a 50mm from halfway down stacks the roofs beneath it.',
      'Residents live on this street. Doorways and interiors are private even where the street is public.',
    ],
    restrictions: [
      {
        kind: 'permit',
        note: 'In the nearby Gion district, photography on the privately owned side lanes is prohibited and carries a fine, and photographing geiko or maiko without consent is not permitted. Treat the whole area as consent-first.',
        source:
          'Gion-machi Minamigawa District Council public notice, as reported by Kyoto City; re-checked by a FRAME moderator in January 2026.',
        recordedAt: '2026-01-11T09:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Early morning, before 07:00',
    submittedById: kenji!.id,
    approvedAt: '2026-01-12T09:30:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000004',
    slug: 'myeongdong-seoul',
    name: 'Myeong-dong signage streets',
    city: 'Seoul',
    country: 'South Korea',
    countryCode: 'KR',
    latitude: 37.563656,
    longitude: 126.98273,
    description:
      'Stacked vertical signage on both sides of a pedestrian street, lit well past midnight. One of the few places where a frame can be built entirely out of typography.',
    categories: ['night', 'street'],
    shootingNotes: [
      'Shoot straight up the street so the signs on both sides converge. A 35mm is about right.',
      'LED signage flickers. Below 1/125s you will catch banding — either go faster or go much slower and accept the streaks.',
      'The street is busiest from 19:00. For clean signage without crowds, go after 23:00.',
    ],
    restrictions: [],
    bestTimeOfDay: 'Night',
    submittedById: pim!.id,
    approvedAt: '2026-04-20T08:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000005',
    slug: 'times-square-new-york',
    name: 'Times Square',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.758,
    longitude: -73.98551,
    description:
      'Screens on every surface and a constant crowd. The cliché is the wide shot; the frames worth taking are usually looking straight up, or down at what the screens are lighting.',
    categories: ['night', 'street', 'urban-landscape'],
    shootingNotes: [
      'The screens are the key light and they change colour every few seconds. Shoot continuous and pick the frame where the colour lands.',
      'Looking directly up from the pedestrian islands removes the crowd entirely and leaves only signage and sky.',
      'Auto white balance will fight you all night. Lock it to daylight and correct later.',
    ],
    restrictions: [
      {
        kind: 'permit',
        note: 'Handheld personal photography needs no permit. Tripods, lighting or any crew-scale setup on a New York City street generally do.',
        source:
          "New York City Mayor's Office of Media and Entertainment permit guidance, summarised by a FRAME moderator in February 2026.",
        recordedAt: '2026-02-09T15:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'After dark',
    submittedById: maya!.id,
    approvedAt: '2026-02-10T16:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000006',
    slug: 'brooklyn-bridge-waterfront',
    name: 'Brooklyn Bridge waterfront',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.703342,
    longitude: -73.989677,
    description:
      'The East River edge looking back at the bridge and the Lower Manhattan skyline behind it. Open sky, open water and a very reliable sunset line.',
    categories: ['urban-landscape', 'architecture'],
    shootingNotes: [
      'The bridge lights come on before the sky is fully dark. That ten-minute overlap is the frame.',
      'There is almost always wind off the water. At long exposures weight the tripod or brace on the railing.',
      'A 70mm from the pier compresses the bridge into the skyline; a 24mm separates them.',
    ],
    restrictions: [],
    bestTimeOfDay: 'Sunset into blue hour',
    submittedById: maya!.id,
    approvedAt: '2026-02-14T16:00:00.000Z',
    photographCount: 2,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000007',
    slug: 'midtown-avenues-new-york',
    name: 'Midtown avenues',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.754932,
    longitude: -73.984016,
    description:
      'The long north–south avenues, shot down the centre line. Traffic, steam and a kilometre of depth stacked into one frame by a long lens.',
    categories: ['street', 'urban-landscape'],
    shootingNotes: [
      'Shoot from the pedestrian island at a crossing, not the roadway. A 135mm or longer gives you the stacking effect.',
      'Twice a year the sunset aligns with the cross streets. Any other evening, the side light at the top of the avenue is still worth it.',
      'Early Sunday morning is the only time these avenues are genuinely empty.',
    ],
    restrictions: [
      {
        kind: 'other',
        note: 'Standing in a live traffic lane to shoot down an avenue is both dangerous and ticketable. Use the islands.',
        source: 'FRAME moderator note, February 2026.',
        recordedAt: '2026-02-20T15:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Golden hour, or early Sunday',
    submittedById: maya!.id,
    approvedAt: '2026-02-21T10:00:00.000Z',
    photographCount: 3,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000008',
    slug: 'financial-district-canyons',
    name: 'Financial District canyons',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.70724,
    longitude: -74.01121,
    description:
      'Tight streets between glass and stone towers. Almost no sky, almost no direct light, and reflections doing most of the work.',
    categories: ['architecture', 'urban-landscape'],
    shootingNotes: [
      'Point the camera straight up and let the verticals converge rather than fighting them.',
      'Mid-morning, light bounces off one glass façade onto the one opposite. That bounce is the softest light in the city.',
      'Weekends are empty here, which makes the geometry readable without people.',
    ],
    restrictions: [
      {
        kind: 'private-property',
        note: 'Many plazas between these towers are privately owned public spaces. Access is normal, but security may ask tripod users to move on.',
        source: 'FRAME moderator review of posted plaza signage, March 2026.',
        recordedAt: '2026-03-03T14:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Mid-morning',
    submittedById: anna!.id,
    approvedAt: '2026-03-04T09:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000009',
    slug: 'tower-bridge-thames',
    name: 'Tower Bridge and the Pool of London',
    city: 'London',
    country: 'United Kingdom',
    countryCode: 'GB',
    latitude: 51.505456,
    longitude: -0.075356,
    description:
      'The river bend at Tower Bridge, with the City behind it. The bridge is photographed constantly, which makes it a good place to practise finding an angle nobody queues for.',
    categories: ['architecture', 'urban-landscape'],
    shootingNotes: [
      'The south bank gives you the bridge with the City skyline behind; the north bank gives you the bridge alone.',
      'Overcast is not a problem here — the stone reads better without hard shadow.',
      'The bridge lifts for shipping on a published schedule. Checking it beforehand is worth the two minutes.',
    ],
    restrictions: [],
    bestTimeOfDay: 'Late afternoon',
    submittedById: elliot!.id,
    approvedAt: '2026-04-06T12:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000010',
    slug: 'champ-de-mars-paris',
    name: 'Champ de Mars',
    city: 'Paris',
    country: 'France',
    countryCode: 'FR',
    latitude: 48.85614,
    longitude: 2.297924,
    description:
      'The long park approach to the tower. Everyone shoots the tower; the better frames are usually the people on the grass with the tower as a background element.',
    categories: ['urban-landscape', 'street'],
    shootingNotes: [
      'The tower faces are lit differently through the evening. Walk the park and pick a face before setting up.',
      'A long lens from the far end of the park makes the tower loom over the foreground rather than shrink into it.',
      'Dusk gives you the structure against colour; full night gives you the lights against black.',
    ],
    restrictions: [
      {
        kind: 'other',
        note: 'The tower’s night-time lighting display is subject to copyright claims for commercial reuse. Personal and editorial use is normal practice; clear commercial use first.',
        source:
          'Widely documented position of the tower’s operating company, summarised by a FRAME moderator in May 2026. Not legal advice.',
        recordedAt: '2026-05-10T11:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Dusk',
    submittedById: marco!.id,
    approvedAt: '2026-05-14T10:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000011',
    slug: 'downtown-toronto',
    name: 'Downtown core',
    city: 'Toronto',
    country: 'Canada',
    countryCode: 'CA',
    latitude: 43.642566,
    longitude: -79.387057,
    description:
      'A dense downtown that photographs well from the water, from above and from street level — unusually accommodating for a city this size.',
    categories: ['urban-landscape', 'architecture', 'night'],
    shootingNotes: [
      'The waterfront gives you the whole skyline in one frame; the financial district gives you the canyon view.',
      'Blue hour over the lake is long and even here compared with an inland city.',
      'Winter light is low all day, which flatters the glass towers far more than summer midday.',
    ],
    restrictions: [],
    bestTimeOfDay: 'Blue hour',
    submittedById: anna!.id,
    approvedAt: '2026-03-18T13:00:00.000Z',
    photographCount: 3,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000012',
    slug: 'rione-monti-rome',
    name: 'Rione Monti and the Colosseum',
    city: 'Rome',
    country: 'Italy',
    countryCode: 'IT',
    latitude: 41.890251,
    longitude: 12.492373,
    description:
      'The streets above the Colosseum, where a two-thousand-year-old structure sits at the end of an ordinary residential road.',
    categories: ['architecture', 'street', 'documentary'],
    shootingNotes: [
      'The interesting frames are the ones that include normal life in front of the monument, not the monument alone.',
      'Hard Roman midday light is unflattering. Early morning gives the travertine its texture back.',
      'The streets of Monti behind the site are quiet even when the site itself is packed.',
    ],
    restrictions: [
      {
        kind: 'fee',
        note: 'The archaeological site itself is ticketed, with its own rules on tripods. The surrounding streets are free and unrestricted.',
        source: 'FRAME moderator review of the site operator’s published visitor rules, May 2026.',
        recordedAt: '2026-05-06T08:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Early morning',
    submittedById: marco!.id,
    approvedAt: '2026-05-07T09:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000013',
    slug: 'jordaan-canals-amsterdam',
    name: 'Jordaan canals',
    city: 'Amsterdam',
    country: 'Netherlands',
    countryCode: 'NL',
    latitude: 52.374874,
    longitude: 4.881264,
    description:
      'Narrow canals, moored boats and elms leaning over the water. A quiet counterpoint to the dense city frames elsewhere in this archive.',
    categories: ['urban-landscape', 'street', 'architecture'],
    shootingNotes: [
      'The bridges are the obvious vantage point, but the canal-side benches give you a lower, better line on the boats.',
      'Still water in the early morning doubles the façades. Any wind at all and the reflection is gone.',
      'The houses either side are lived in. Shooting into front windows from a bridge is both easy and not acceptable.',
    ],
    restrictions: [],
    bestTimeOfDay: 'Early morning',
    submittedById: anna!.id,
    approvedAt: '2026-03-01T09:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000014',
    slug: 'manarola-cinque-terre',
    name: 'Manarola, Cinque Terre',
    city: 'Manarola',
    country: 'Italy',
    countryCode: 'IT',
    latitude: 44.106825,
    longitude: 9.727472,
    description:
      'Painted houses stacked on a cliff above a small harbour. Photographed to exhaustion from one viewpoint, and barely at all from the village itself.',
    categories: ['urban-landscape', 'architecture'],
    shootingNotes: [
      'The classic viewpoint is the coastal path south of the harbour. It is busy from an hour before sunset.',
      'The village lanes above the harbour are almost always empty and give a far more interesting picture of the place.',
      'The cliff faces west, so the light is on the houses only in the last hour of the day.',
    ],
    restrictions: [
      {
        kind: 'hours',
        note: 'Sections of the coastal path close in bad weather and after landslides. Check before planning a sunset around it.',
        source: 'National park operator’s published path status, checked by a FRAME moderator in June 2026.',
        recordedAt: '2026-06-02T07:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Last hour before sunset',
    submittedById: marco!.id,
    approvedAt: '2026-06-03T08:00:00.000Z',
    photographCount: 1,
  },
  {
    id: 'b2d5f100-0000-4000-8000-000000000015',
    slug: 'lower-east-side-diner',
    name: 'Lower East Side diner',
    city: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.72,
    longitude: -73.99,
    isSensitive: true,
    description:
      'A working diner with its original fittings. Interior street photography, which means the rules are different: you are a guest in someone’s business.',
    categories: ['documentary', 'street'],
    shootingNotes: [
      'Ask the owner first, order something, and keep the camera small. In that order.',
      'The window light at the booths is the only good light in the room. Everything else is fluorescent.',
      'Other customers did not agree to be photographed. Frame the room, not their faces, unless they say yes.',
    ],
    restrictions: [
      {
        kind: 'private-property',
        note: 'Private business. Photography is at the owner’s discretion and that permission does not extend to other customers.',
        source: 'Submitted by the contributing member and confirmed by a FRAME moderator, April 2026.',
        recordedAt: '2026-04-22T12:00:00.000Z',
      },
    ],
    bestTimeOfDay: 'Mid-morning, off peak',
    submittedById: maya!.id,
    approvedAt: '2026-04-23T10:00:00.000Z',
    photographCount: 1,
  },
];

function toDetail(raw: RawLocation): LocationDetail {
  const submitter = raw.submittedById
    ? DEMO_PHOTOGRAPHERS.find((person) => person.id === raw.submittedById)
    : undefined;

  return {
    // The demo sample is written in one language and never translated.
    translations: {},
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    city: raw.city,
    country: raw.country,
    countryCode: raw.countryCode,
    photographCount: raw.photographCount,
    description: raw.description,
    coordinates: publishableCoordinates(raw.latitude, raw.longitude, {
      isSensitive: raw.isSensitive,
      withhold: raw.withholdCoordinates,
    }),
    categories: raw.categories,
    shootingNotes: raw.shootingNotes,
    restrictions: raw.restrictions,
    bestTimeOfDay: raw.bestTimeOfDay,
    submittedBy: submitter
      ? {
          id: submitter.id,
          username: submitter.username,
          displayName: submitter.displayName,
          avatarUrl: submitter.avatarUrl,
          basedIn: submitter.basedIn,
        }
      : null,
    approvedAt: raw.approvedAt,
    pinPrecision: 'approximate',
  };
}

export const DEMO_LOCATIONS: LocationDetail[] = RAW.map(toDetail);

export function demoLocationBySlug(slug: string): LocationDetail | undefined {
  return DEMO_LOCATIONS.find((location) => location.slug === slug);
}

export function demoLocationById(id: string): LocationDetail | undefined {
  return DEMO_LOCATIONS.find((location) => location.id === id);
}
