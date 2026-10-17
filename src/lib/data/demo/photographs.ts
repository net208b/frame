import { unsplashImage, type AspectPreset } from '@/lib/images/variants';
import type {
  PhotographDetail,
  PhotographerSummary,
  LocationSummary,
  PhotoCategory,
} from '@/types/domain';

import { DEMO_LOCATIONS } from './locations';
import { DEMO_PHOTOGRAPHERS } from './photographers';

/**
 * Demo photographs.
 *
 * Each entry is matched to what the bundled image actually shows. That sounds
 * obvious, but it is the difference between a believable product review and a
 * gallery of captions describing a different city from the one in the frame.
 */

const [kenji, anna, marco, maya, pim, elliot] = DEMO_PHOTOGRAPHERS;

function summariseLocation(slug: string): LocationSummary {
  const location = DEMO_LOCATIONS.find((item) => item.slug === slug);
  if (!location) throw new Error(`Demo data error: unknown location slug "${slug}"`);
  return {
    id: location.id,
    slug: location.slug,
    name: location.name,
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
    photographCount: location.photographCount,
  };
}

function summarisePhotographer(id: string): PhotographerSummary {
  const person = DEMO_PHOTOGRAPHERS.find((item) => item.id === id);
  if (!person) throw new Error(`Demo data error: unknown photographer "${id}"`);
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
    basedIn: person.basedIn,
  };
}

interface RawPhotograph {
  n: number;
  unsplashId: string;
  aspect: AspectPreset;
  slug: string;
  title: string;
  altText: string;
  description: string;
  category: PhotoCategory;
  locationSlug: string;
  photographerId: string;
  appreciationCount: number;
  publishedAt: string;
  capturedAt: string | null;
  editorsPick?: boolean;
  camera: [brand: string, model: string];
  lens: [brand: string, model: string];
  focalLengthMm: number;
  aperture: number;
  shutterSpeed: string;
  iso: number;
  editingSoftware: string | null;
  editingNotes: string | null;
}

const RAW: RawPhotograph[] = [
  {
    n: 1,
    unsplashId: 'photo-1519608487953-e999c86e7455',
    aspect: 'portrait',
    slug: 'the-street-that-only-exists-after-dark',
    title: 'The street that only exists after dark',
    altText:
      'A narrow empty city street at night lit entirely by blue and magenta signage, with wet asphalt reflecting the light.',
    description:
      'I had walked past this turning for two years without looking down it. It is unremarkable at noon. At one in the morning, with the road still wet, it is the best three metres of light in the district.',
    category: 'night',
    locationSlug: 'shinjuku-backstreets-tokyo',
    photographerId: kenji!.id,
    appreciationCount: 612,
    publishedAt: '2026-10-11T14:20:00.000Z',
    capturedAt: '2026-10-09T16:42:00.000Z',
    editorsPick: true,
    camera: ['Fujifilm', 'X-Pro3'],
    lens: ['Fujinon', 'XF 35mm f/1.4 R'],
    focalLengthMm: 35,
    aperture: 1.4,
    shutterSpeed: '1/60',
    iso: 1600,
    editingSoftware: 'Capture One',
    editingNotes:
      'White balance pulled well below the sign temperature to keep the magenta honest, then the shadows lifted about a third of a stop. No colour grading beyond that.',
  },
  {
    n: 2,
    unsplashId: 'photo-1444723121867-7a241cacace9',
    aspect: 'landscape',
    slug: 'the-city-goes-on-past-the-frame',
    title: 'The city goes on past the frame',
    altText:
      'A dense low-rise cityscape photographed from above at twilight, with tower blocks rising in the far distance.',
    description:
      'What I wanted was the flatness. From the ground this city feels vertical; from up here it is almost entirely two storeys high, running to the horizon in every direction.',
    category: 'urban-landscape',
    locationSlug: 'tokyo-twilight-overlook',
    photographerId: kenji!.id,
    appreciationCount: 341,
    publishedAt: '2026-09-28T09:05:00.000Z',
    capturedAt: '2026-09-26T09:38:00.000Z',
    camera: ['Fujifilm', 'X-Pro3'],
    lens: ['Fujinon', 'XF 50mm f/2 R WR'],
    focalLengthMm: 50,
    aperture: 5.6,
    shutterSpeed: '1/15',
    iso: 400,
    editingSoftware: 'Capture One',
    editingNotes: 'Braced on a railing. Single frame, no stacking, slight perspective correction.',
  },
  {
    n: 3,
    unsplashId: 'photo-1493976040374-85c8e12f0c0e',
    aspect: 'portrait',
    slug: 'the-slope-before-the-crowds',
    title: 'The slope before the crowds',
    altText:
      'A sloping traditional Japanese street of wooden machiya houses leading up to a five-storey pagoda, with two people in kimono walking away from the camera.',
    description:
      'Six fifty in the morning. By nine you cannot see the road surface for people. I waited for the two figures to reach the third doorway so the pagoda had something to measure itself against.',
    category: 'street',
    locationSlug: 'higashiyama-kyoto',
    photographerId: kenji!.id,
    appreciationCount: 488,
    publishedAt: '2026-09-15T07:40:00.000Z',
    capturedAt: null,
    editorsPick: true,
    camera: ['Fujifilm', 'X-Pro3'],
    lens: ['Fujinon', 'XF 35mm f/1.4 R'],
    focalLengthMm: 35,
    aperture: 4,
    shutterSpeed: '1/250',
    iso: 320,
    editingSoftware: 'Capture One',
    editingNotes:
      'Highlights on the white walls pulled back. The people are far enough away and turned away that nobody is identifiable, which is why this one is published at all.',
  },
  {
    n: 4,
    unsplashId: 'photo-1538485399081-7191377e8241',
    aspect: 'portrait',
    slug: 'a-wall-made-entirely-of-type',
    title: 'A wall made entirely of type',
    altText:
      'A narrow night street with stacked illuminated Korean shop signs filling both sides of the frame from street level to rooftop.',
    description:
      'There is no architecture visible in this picture at all. Every surface is a sign. I like that you can read the economics of the street vertically, floor by floor.',
    category: 'night',
    locationSlug: 'myeongdong-seoul',
    photographerId: pim!.id,
    appreciationCount: 397,
    publishedAt: '2026-10-06T16:10:00.000Z',
    capturedAt: '2026-10-02T13:55:00.000Z',
    camera: ['Sony', 'α7C'],
    lens: ['Sigma', '35mm f/1.4 DG DN Art'],
    focalLengthMm: 35,
    aperture: 2.8,
    shutterSpeed: '1/125',
    iso: 2000,
    editingSoftware: 'Lightroom Classic',
    editingNotes:
      'Shot at 1/125 to stay above the LED flicker threshold. Only correction was pulling the greens out of the fluorescent sections.',
  },
  {
    n: 5,
    unsplashId: 'photo-1496442226666-8d4d0e62e6e9',
    aspect: 'portrait',
    slug: 'looking-up-instead',
    title: 'Looking up instead',
    altText:
      'A view straight up a street of illuminated advertising screens and billboards at night, with yellow taxis below.',
    description:
      'Everyone here photographs the crowd. Point the camera at the sky instead and the crowd disappears entirely — you get the thing people actually came to look at.',
    category: 'night',
    locationSlug: 'times-square-new-york',
    photographerId: maya!.id,
    appreciationCount: 534,
    publishedAt: '2026-10-13T20:30:00.000Z',
    capturedAt: '2026-10-12T23:14:00.000Z',
    editorsPick: true,
    camera: ['Leica', 'Q3'],
    lens: ['Leica', 'Summilux 28mm f/1.7 ASPH'],
    focalLengthMm: 28,
    aperture: 2.8,
    shutterSpeed: '1/200',
    iso: 800,
    editingSoftware: 'Lightroom Classic',
    editingNotes:
      'Twenty frames continuous, kept the one where the screens were not all showing white. Nothing else done to it.',
  },
  {
    n: 6,
    unsplashId: 'photo-1518391846015-55a9cc003b25',
    aspect: 'landscape',
    slug: 'ten-minutes-of-overlap',
    title: 'Ten minutes of overlap',
    altText:
      'A suspension bridge lit at night spanning dark water, with an illuminated city skyline behind it under a deep blue sky.',
    description:
      'The bridge lights come on while there is still colour in the sky. That overlap lasts about ten minutes and it is the only time the bridge and the skyline are the same brightness.',
    category: 'urban-landscape',
    locationSlug: 'brooklyn-bridge-waterfront',
    photographerId: maya!.id,
    appreciationCount: 455,
    publishedAt: '2026-09-21T22:00:00.000Z',
    capturedAt: '2026-09-20T23:48:00.000Z',
    camera: ['Canon', 'EOS R6 Mark II'],
    lens: ['Canon', 'RF 24-70mm f/2.8 L IS USM'],
    focalLengthMm: 35,
    aperture: 8,
    shutterSpeed: '4s',
    iso: 100,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Tripod, two-second timer, single exposure. No blending.',
  },
  {
    n: 7,
    unsplashId: 'photo-1480714378408-67cf0d13bc1b',
    aspect: 'landscape',
    slug: 'the-island-at-the-end-of-the-day',
    title: 'The island at the end of the day',
    altText:
      'An aerial view of a dense island of skyscrapers in warm late-afternoon light, with rivers either side.',
    description:
      'Taken from a building, not a drone — worth saying, because the two look similar and only one of them is legal here without a licence.',
    category: 'urban-landscape',
    locationSlug: 'brooklyn-bridge-waterfront',
    photographerId: maya!.id,
    appreciationCount: 288,
    publishedAt: '2026-08-30T18:15:00.000Z',
    capturedAt: '2026-08-29T21:05:00.000Z',
    camera: ['Canon', 'EOS R6 Mark II'],
    lens: ['Canon', 'RF 70-200mm f/4 L IS USM'],
    focalLengthMm: 70,
    aperture: 7.1,
    shutterSpeed: '1/320',
    iso: 200,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Dehaze at around fifteen. Nothing else — the light did the work.',
  },
  {
    n: 8,
    unsplashId: 'photo-1519501025264-65ba15a82390',
    aspect: 'landscape',
    slug: 'everything-arriving-at-once',
    title: 'Everything arriving at once',
    altText:
      'A wide city avenue at dusk seen down its centre line, with headlights, tail lights and tall buildings on both sides.',
    description:
      'A kilometre of avenue compressed into about thirty metres of apparent depth. The long lens is doing something your eye cannot do, which is the only reason to use one.',
    category: 'street',
    locationSlug: 'midtown-avenues-new-york',
    photographerId: maya!.id,
    appreciationCount: 374,
    publishedAt: '2026-10-02T19:45:00.000Z',
    capturedAt: '2026-09-30T22:36:00.000Z',
    camera: ['Canon', 'EOS R6 Mark II'],
    lens: ['Canon', 'RF 70-200mm f/4 L IS USM'],
    focalLengthMm: 160,
    aperture: 4,
    shutterSpeed: '1/80',
    iso: 1250,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Shot from the pedestrian island. Minor lens correction, no crop.',
  },
  {
    n: 9,
    unsplashId: 'photo-1449824913935-59a10b8d2000',
    aspect: 'landscape',
    slug: 'sunday-at-six',
    title: 'Sunday at six',
    altText:
      'A wide, almost empty city avenue in flat early-morning light, flanked by tall buildings receding into the distance.',
    description:
      'The same avenue as everyone else photographs, at the one hour of the week when there is nothing in it. No trick, just an alarm clock.',
    category: 'urban-landscape',
    locationSlug: 'midtown-avenues-new-york',
    photographerId: elliot!.id,
    appreciationCount: 196,
    publishedAt: '2026-09-07T08:30:00.000Z',
    capturedAt: '2026-09-06T10:12:00.000Z',
    camera: ['Panasonic', 'Lumix S5 II'],
    lens: ['Lumix', 'S 20-60mm f/3.5-5.6'],
    focalLengthMm: 28,
    aperture: 8,
    shutterSpeed: '1/125',
    iso: 200,
    editingSoftware: 'Darktable',
    editingNotes: 'Perspective corrected so the verticals stay vertical. Contrast left flat.',
  },
  {
    n: 10,
    unsplashId: 'photo-1485871981521-5b1fd3805eee',
    aspect: 'landscape',
    slug: 'the-last-twenty-minutes',
    title: 'The last twenty minutes',
    altText:
      'A city skyline at sunset with a tall spired skyscraper at the centre, under an orange and blue sky.',
    description:
      'I was in town for two days and this was the only clear evening. Sometimes the picture is simply a matter of having been upstairs at the right time.',
    category: 'urban-landscape',
    locationSlug: 'midtown-avenues-new-york',
    photographerId: marco!.id,
    appreciationCount: 263,
    publishedAt: '2026-08-18T18:50:00.000Z',
    capturedAt: '2026-08-16T23:20:00.000Z',
    camera: ['Nikon', 'Z f'],
    lens: ['Nikkor', 'Z 70-180mm f/2.8'],
    focalLengthMm: 120,
    aperture: 5.6,
    shutterSpeed: '1/250',
    iso: 125,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Graduated filter on the sky, about half a stop. Nothing on the buildings.',
  },
  {
    n: 11,
    unsplashId: 'photo-1511818966892-d7d671e672a2',
    aspect: 'portrait',
    slug: 'no-sky-available',
    title: 'No sky available',
    altText:
      'Glass and steel office towers photographed looking straight up, their edges converging towards a small patch of pale sky.',
    description:
      'Converging verticals are usually treated as a mistake to correct. Here they are the subject: the street is designed so you cannot see out of it.',
    category: 'architecture',
    locationSlug: 'financial-district-canyons',
    photographerId: anna!.id,
    appreciationCount: 421,
    publishedAt: '2026-09-25T11:00:00.000Z',
    capturedAt: '2026-09-23T13:40:00.000Z',
    editorsPick: true,
    camera: ['Sony', 'α7 IV'],
    lens: ['Sony', 'FE 24mm f/1.4 GM'],
    focalLengthMm: 24,
    aperture: 8,
    shutterSpeed: '1/500',
    iso: 100,
    editingSoftware: 'Capture One',
    editingNotes:
      'Converted with a cool-neutral profile. The blue is the glass, not a grade — I checked it against a grey card in the same light.',
  },
  {
    n: 12,
    unsplashId: 'photo-1513635269975-59663e0ac1ad',
    aspect: 'landscape',
    slug: 'the-bend-in-the-river',
    title: 'The bend in the river',
    altText:
      'An aerial view of a historic twin-towered bascule bridge over a wide river, with a dense city skyline behind it.',
    description:
      'The bridge is photographed several thousand times a day from the embankment. From above, it finally reads as what it is: a small object in a very large city.',
    category: 'architecture',
    locationSlug: 'tower-bridge-thames',
    photographerId: elliot!.id,
    appreciationCount: 108,
    publishedAt: '2026-07-19T13:00:00.000Z',
    capturedAt: '2026-07-18T16:30:00.000Z',
    camera: ['Panasonic', 'Lumix S5 II'],
    lens: ['Lumix', 'S 20-60mm f/3.5-5.6'],
    focalLengthMm: 45,
    aperture: 7.1,
    shutterSpeed: '1/400',
    iso: 160,
    editingSoftware: 'Darktable',
    editingNotes: 'Haze reduction and a little local contrast on the river. No sky replacement.',
  },
  {
    n: 13,
    unsplashId: 'photo-1502602898657-3e91760cbb34',
    aspect: 'portrait',
    slug: 'the-obvious-subject',
    title: 'The obvious subject',
    altText:
      'An iron lattice tower silhouetted against a pink and blue dusk sky, seen across a river.',
    description:
      'There is no original angle on this left. I stopped trying to find one and photographed it the way it actually looks when you walk up the river at dusk.',
    category: 'urban-landscape',
    locationSlug: 'champ-de-mars-paris',
    photographerId: marco!.id,
    appreciationCount: 219,
    publishedAt: '2026-07-04T19:30:00.000Z',
    capturedAt: '2026-07-02T20:55:00.000Z',
    camera: ['Nikon', 'Z f'],
    lens: ['Nikkor', 'Z 40mm f/2'],
    focalLengthMm: 40,
    aperture: 4,
    shutterSpeed: '1/125',
    iso: 200,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Straightened and cropped to vertical. Colour left as shot.',
  },
  {
    n: 14,
    unsplashId: 'photo-1486325212027-8081e485255e',
    aspect: 'landscape',
    slug: 'tower-and-everything-under-it',
    title: 'Tower and everything under it',
    altText:
      'A night-time city skyline dominated by a tall concrete observation tower, with lit office blocks in the foreground.',
    description:
      'The tower is the landmark, but the picture is really about the thousand lit windows underneath it — all those rooms where somebody is still at work.',
    category: 'night',
    locationSlug: 'downtown-toronto',
    photographerId: anna!.id,
    appreciationCount: 177,
    publishedAt: '2026-08-09T21:10:00.000Z',
    capturedAt: '2026-08-08T02:30:00.000Z',
    camera: ['Sony', 'α7 IV'],
    lens: ['Sony', 'FE 55mm f/1.8 ZA'],
    focalLengthMm: 55,
    aperture: 5.6,
    shutterSpeed: '2s',
    iso: 200,
    editingSoftware: 'Capture One',
    editingNotes: 'Tripod. Single exposure, highlight recovery on the brightest windows.',
  },
  {
    n: 15,
    unsplashId: 'photo-1517935706615-2717063c2225',
    aspect: 'landscape',
    slug: 'the-grid-from-above',
    title: 'The grid from above',
    altText:
      'An aerial view at dusk of a downtown core beside a large body of water, streets picked out in orange light.',
    description:
      'Two minutes after the street lights switched on and before the sky lost its colour. Timing, not technique.',
    category: 'urban-landscape',
    locationSlug: 'downtown-toronto',
    photographerId: anna!.id,
    appreciationCount: 144,
    publishedAt: '2026-07-27T20:00:00.000Z',
    capturedAt: '2026-07-26T01:12:00.000Z',
    camera: ['Sony', 'α7 IV'],
    lens: ['Sony', 'FE 24mm f/1.4 GM'],
    focalLengthMm: 24,
    aperture: 5.6,
    shutterSpeed: '1/30',
    iso: 640,
    editingSoftware: 'Capture One',
    editingNotes: 'Shot through observation-deck glass with a rubber hood. Minor dehaze.',
  },
  {
    n: 16,
    unsplashId: 'photo-1477959858617-67f85cf4f1df',
    aspect: 'landscape',
    slug: 'where-the-city-meets-the-water',
    title: 'Where the city meets the water',
    altText:
      'Tall waterfront buildings in clear daylight with open water and a pale horizon behind them.',
    description:
      'A city that ends abruptly at a shoreline gives you a horizon line for free. You rarely get that in a downtown.',
    category: 'architecture',
    locationSlug: 'downtown-toronto',
    photographerId: pim!.id,
    appreciationCount: 190,
    publishedAt: '2026-09-12T12:25:00.000Z',
    capturedAt: '2026-09-10T15:48:00.000Z',
    camera: ['Sony', 'α7C'],
    lens: ['Sigma', '35mm f/1.4 DG DN Art'],
    focalLengthMm: 35,
    aperture: 9,
    shutterSpeed: '1/640',
    iso: 100,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Polariser on the lens. Verticals corrected, otherwise untouched.',
  },
  {
    n: 17,
    unsplashId: 'photo-1552832230-c0197dd311b5',
    aspect: 'landscape',
    slug: 'two-thousand-years-at-the-end-of-the-road',
    title: 'Two thousand years at the end of the road',
    altText:
      'A large ancient stone amphitheatre under a bright sky, seen from street level with its arches in full sun.',
    description:
      'What still surprises me is how ordinary the approach is. You walk up a normal street past normal parked cars and then it is simply there.',
    category: 'architecture',
    locationSlug: 'rione-monti-rome',
    photographerId: marco!.id,
    appreciationCount: 231,
    publishedAt: '2026-06-22T08:40:00.000Z',
    capturedAt: '2026-06-21T06:30:00.000Z',
    camera: ['Nikon', 'Z f'],
    lens: ['Nikkor', 'Z 40mm f/2'],
    focalLengthMm: 40,
    aperture: 8,
    shutterSpeed: '1/500',
    iso: 100,
    editingSoftware: 'Lightroom Classic',
    editingNotes: 'Early light, so very little to do. Shadows opened a quarter of a stop.',
  },
  {
    n: 18,
    unsplashId: 'photo-1534351590666-13e3e96b5017',
    aspect: 'landscape',
    slug: 'nothing-happening-slowly',
    title: 'Nothing happening, slowly',
    altText:
      'A tree-lined canal with moored boats along both banks and terraced houses behind them in soft daylight.',
    description:
      'After a month of photographing dense city centres I wanted a frame with no event in it at all. This is five minutes of nothing, which turned out to be the point.',
    category: 'street',
    locationSlug: 'jordaan-canals-amsterdam',
    photographerId: anna!.id,
    appreciationCount: 126,
    publishedAt: '2026-10-14T09:15:00.000Z',
    capturedAt: '2026-10-13T06:50:00.000Z',
    camera: ['Sony', 'α7 IV'],
    lens: ['Sony', 'FE 55mm f/1.8 ZA'],
    focalLengthMm: 55,
    aperture: 4,
    shutterSpeed: '1/250',
    iso: 160,
    editingSoftware: 'Capture One',
    editingNotes: 'Flat profile, no added contrast. The greens are as metered.',
  },
  {
    n: 19,
    unsplashId: 'photo-1516483638261-f4dbaf036963',
    aspect: 'portrait',
    slug: 'houses-that-should-not-be-there',
    title: 'Houses that should not be there',
    altText:
      'Brightly painted houses stacked on a steep rocky cliff above a small harbour and blue sea.',
    description:
      'Every one of these buildings is an argument with the geology. I photographed it vertically because the picture is really about the drop.',
    category: 'architecture',
    locationSlug: 'manarola-cinque-terre',
    photographerId: marco!.id,
    appreciationCount: 302,
    publishedAt: '2026-06-28T17:20:00.000Z',
    capturedAt: '2026-06-27T18:40:00.000Z',
    camera: ['Nikon', 'Z f'],
    lens: ['Nikkor', 'Z 40mm f/2'],
    focalLengthMm: 40,
    aperture: 5.6,
    shutterSpeed: '1/400',
    iso: 100,
    editingSoftware: 'Lightroom Classic',
    editingNotes:
      'Saturation deliberately left alone. The houses really are that colour in evening light.',
  },
  {
    n: 20,
    unsplashId: 'photo-1555992336-fb0d29498b13',
    aspect: 'landscape',
    slug: 'a-room-that-has-not-changed',
    title: 'A room that has not changed',
    altText:
      'The interior of a classic American diner with red vinyl booths, a chequerboard floor and chrome fittings.',
    description:
      'I asked the owner first, ordered breakfast, and shot the empty half of the room. No customers are in the frame and that was not an accident.',
    category: 'documentary',
    locationSlug: 'lower-east-side-diner',
    photographerId: maya!.id,
    appreciationCount: 268,
    publishedAt: '2026-09-04T13:05:00.000Z',
    capturedAt: '2026-09-03T14:10:00.000Z',
    camera: ['Leica', 'Q3'],
    lens: ['Leica', 'Summilux 28mm f/1.7 ASPH'],
    focalLengthMm: 28,
    aperture: 2.8,
    shutterSpeed: '1/60',
    iso: 1000,
    editingSoftware: 'Lightroom Classic',
    editingNotes:
      'Mixed window and fluorescent light, so this is a two-zone white balance correction. Nothing cloned out.',
  },
];

function toDetail(raw: RawPhotograph): PhotographDetail {
  return {
    id: `c3e7a200-0000-4000-8000-${String(raw.n).padStart(12, '0')}`,
    slug: raw.slug,
    title: raw.title,
    altText: raw.altText,
    category: raw.category,
    image: unsplashImage(raw.unsplashId, raw.aspect),
    appreciationCount: raw.appreciationCount,
    viewerHasAppreciated: null,
    photographer: summarisePhotographer(raw.photographerId),
    location: summariseLocation(raw.locationSlug),
    publishedAt: raw.publishedAt,
    editorsPick: Boolean(raw.editorsPick),
    description: raw.description,
    capture: {
      cameraBrand: raw.camera[0],
      cameraModel: raw.camera[1],
      lensBrand: raw.lens[0],
      lensModel: raw.lens[1],
      focalLengthMm: raw.focalLengthMm,
      aperture: raw.aperture,
      shutterSpeed: raw.shutterSpeed,
      iso: raw.iso,
    },
    editing: {
      software: raw.editingSoftware,
      notes: raw.editingNotes,
    },
    capturedAt: raw.capturedAt,
    status: 'published',
    rightsConfirmedAt: raw.publishedAt,
  };
}

export const DEMO_PHOTOGRAPHS: PhotographDetail[] = RAW.map(toDetail);

export function demoPhotographBySlug(slug: string): PhotographDetail | undefined {
  return DEMO_PHOTOGRAPHS.find((photo) => photo.slug === slug);
}

export function demoPhotographsByLocation(locationId: string): PhotographDetail[] {
  return DEMO_PHOTOGRAPHS.filter((photo) => photo.location?.id === locationId);
}

export function demoPhotographsByPhotographer(photographerId: string): PhotographDetail[] {
  return DEMO_PHOTOGRAPHS.filter((photo) => photo.photographer.id === photographerId);
}

/**
 * Keep the counts on profiles and locations honest.
 *
 * A profile that advertises five photographs and renders four is a small bug
 * that reads as a broken product, so the dataset fails loudly in development
 * instead of shipping a quiet inconsistency.
 */
if (process.env.NODE_ENV !== 'production') {
  for (const person of DEMO_PHOTOGRAPHERS) {
    const actual = demoPhotographsByPhotographer(person.id).length;
    if (actual !== person.photographCount) {
      throw new Error(
        `Demo data mismatch: ${person.username} declares ${person.photographCount} photographs but has ${actual}.`,
      );
    }
  }

  for (const location of DEMO_LOCATIONS) {
    const actual = demoPhotographsByLocation(location.id).length;
    if (actual !== location.photographCount) {
      throw new Error(
        `Demo data mismatch: ${location.slug} declares ${location.photographCount} photographs but has ${actual}.`,
      );
    }
  }

  const slugs = new Set<string>();
  for (const photo of DEMO_PHOTOGRAPHS) {
    if (slugs.has(photo.slug)) throw new Error(`Demo data mismatch: duplicate slug ${photo.slug}`);
    slugs.add(photo.slug);
  }
}
