-- =============================================================================
-- FRAME — seed data
-- =============================================================================
-- What this file contains: reference data. Camera brands, camera models, lens
-- brands, lens models, and a starter set of approved places.
--
-- What this file deliberately does NOT contain, and must never contain:
--
--   * profiles. No invented photographers. A profile implies a person who
--     agreed to be here.
--   * photographs. No invented work, and no invented credit for it.
--   * photograph_appreciations, or any appreciation_count above zero. A seeded
--     appreciation is a fabricated endorsement by a member who does not exist.
--   * location_restrictions. A restriction needs a source — signage, a
--     published policy, a dated site visit — and a fresh database has had no
--     moderator review to cite. An unsourced "permit required" note is a
--     rumour this platform would be putting its name to.
--   * shooting_notes. Those are attributed community advice, not editorial
--     copy, so they arrive with the members who write them.
--   * locations.categories. The recount_location_photographs trigger derives
--     those from the published photographs at a place. With no photographs, the
--     honest value is the empty array, and the trigger will fill it in as work
--     is published.
--
-- The brief is explicit that demo statistics must never be rendered as if they
-- described a real community, and PlatformStats.isDemoData carries that
-- distinction through the UI. A seeded community statistic would defeat the
-- whole mechanism: it would arrive with isDemoData false, having come from a
-- real database, and there would be nothing left to warn anybody with. So the
-- counts in a freshly seeded database are zero, and the pages that read them
-- say so.
--
-- Re-running is safe. Every insert ends in `on conflict do nothing`, so a
-- second run adds what is missing and leaves curated edits alone.
-- =============================================================================

set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- Camera brands
-- -----------------------------------------------------------------------------
-- The manufacturers the bundled demo dataset shoots with, so the Discover gear
-- facets have something real to resolve against on day one.
insert into public.camera_brands (name, slug) values
  ('Fujifilm',  'fujifilm'),
  ('Sony',      'sony'),
  ('Nikon',     'nikon'),
  ('Canon',     'canon'),
  ('Leica',     'leica'),
  ('Ricoh',     'ricoh'),
  ('Panasonic', 'panasonic'),
  ('Sigma',     'sigma')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Camera models
-- -----------------------------------------------------------------------------
-- Slugs are brand-prefixed because camera_models.slug is globally unique and
-- bare model names collide across manufacturers.
insert into public.camera_models (brand_id, name, slug)
select b.id, v.name, v.slug
  from (values
    ('fujifilm',  'X-Pro3',            'fujifilm-x-pro3'),
    ('fujifilm',  'X100VI',            'fujifilm-x100vi'),
    ('fujifilm',  'X-T5',              'fujifilm-x-t5'),
    ('sony',      'α7 IV',             'sony-a7-iv'),
    ('sony',      'α7C',               'sony-a7c'),
    ('sony',      'α7R V',             'sony-a7r-v'),
    ('nikon',     'Z f',               'nikon-zf'),
    ('nikon',     'Z6 III',            'nikon-z6-iii'),
    ('nikon',     'Z8',                'nikon-z8'),
    ('canon',     'EOS R6 Mark II',    'canon-eos-r6-mark-ii'),
    ('canon',     'EOS R8',            'canon-eos-r8'),
    ('leica',     'Q3',                'leica-q3'),
    ('leica',     'M11',               'leica-m11'),
    ('ricoh',     'GR III',            'ricoh-gr-iii'),
    ('ricoh',     'GR IIIx',           'ricoh-gr-iiix'),
    ('panasonic', 'Lumix S5 II',       'panasonic-lumix-s5-ii'),
    ('panasonic', 'Lumix S9',          'panasonic-lumix-s9'),
    ('sigma',     'fp L',              'sigma-fp-l'),
    ('sigma',     'fp',                'sigma-fp')
  ) as v(brand_slug, name, slug)
  join public.camera_brands b on b.slug = v.brand_slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Lens brands
-- -----------------------------------------------------------------------------
-- A separate table from camera_brands, and not a copy of it: several
-- manufacturers sell lenses under a different name from their bodies. Fujifilm
-- cameras take Fujinon lenses, Nikon bodies take Nikkor, Panasonic sells Lumix
-- glass. Collapsing the two lists would make every one of those facets wrong.
insert into public.lens_brands (name, slug) values
  ('Fujinon', 'fujinon'),
  ('Sony',    'sony'),
  ('Nikkor',  'nikkor'),
  ('Canon',   'canon'),
  ('Leica',   'leica'),
  ('Lumix',   'lumix'),
  ('Sigma',   'sigma'),
  ('Ricoh',   'ricoh'),
  ('Voigtländer', 'voigtlander')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Lens models
-- -----------------------------------------------------------------------------
insert into public.lens_models (brand_id, name, slug)
select b.id, v.name, v.slug
  from (values
    ('fujinon', 'XF 35mm f/1.4 R',                   'fujinon-xf-35mm-f14-r'),
    ('fujinon', 'XF 50mm f/2 R WR',                  'fujinon-xf-50mm-f2-r-wr'),
    ('fujinon', 'XF 23mm f/2 R WR',                  'fujinon-xf-23mm-f2-r-wr'),
    ('fujinon', 'XF 18mm f/1.4 R LM WR',             'fujinon-xf-18mm-f14-r-lm-wr'),
    ('sony',    'FE 24mm f/1.4 GM',                  'sony-fe-24mm-f14-gm'),
    ('sony',    'FE 35mm f/1.8',                     'sony-fe-35mm-f18'),
    ('sony',    'FE 55mm f/1.8 ZA',                  'sony-fe-55mm-f18-za'),
    ('nikkor',  'Z 40mm f/2',                        'nikkor-z-40mm-f2'),
    ('nikkor',  'Z 26mm f/2.8',                      'nikkor-z-26mm-f28'),
    ('nikkor',  'Z 70-180mm f/2.8',                  'nikkor-z-70-180mm-f28'),
    ('canon',   'RF 24-70mm f/2.8 L IS USM',         'canon-rf-24-70mm-f28-l-is-usm'),
    ('canon',   'RF 70-200mm f/4 L IS USM',          'canon-rf-70-200mm-f4-l-is-usm'),
    ('canon',   'RF 35mm f/1.8 Macro IS STM',        'canon-rf-35mm-f18-macro-is-stm'),
    ('leica',   'Summilux 28mm f/1.7 ASPH',          'leica-summilux-28mm-f17-asph'),
    ('leica',   'Summicron-M 35mm f/2 ASPH',         'leica-summicron-m-35mm-f2-asph'),
    ('lumix',   'S 20-60mm f/3.5-5.6',               'lumix-s-20-60mm-f35-56'),
    ('lumix',   'S 50mm f/1.8',                      'lumix-s-50mm-f18'),
    ('sigma',   '35mm f/1.4 DG DN Art',              'sigma-35mm-f14-dg-dn-art'),
    ('sigma',   '24mm f/2 DG DN Contemporary',       'sigma-24mm-f2-dg-dn-contemporary'),
    ('sigma',   '45mm f/2.8 DG DN Contemporary',     'sigma-45mm-f28-dg-dn-contemporary'),
    ('ricoh',   'GR 18.3mm f/2.8',                   'ricoh-gr-183mm-f28'),
    ('ricoh',   'GR 26.1mm f/2.8',                   'ricoh-gr-261mm-f28'),
    ('voigtlander', 'Nokton 35mm f/1.2 Aspherical',  'voigtlander-nokton-35mm-f12-aspherical')
  ) as v(brand_slug, name, slug)
  join public.lens_brands b on b.slug = v.brand_slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Starter locations
-- -----------------------------------------------------------------------------
-- Approved places, so a freshly configured instance has a map and a location
-- index rather than two empty pages.
--
-- The ids and slugs match the bundled demo dataset in src/lib/data/demo/
-- deliberately: a link, a screenshot or a bookmark taken while the app was
-- running on demo data still resolves once a real database is attached.
--
-- submitted_by and approved_by are null, and that is the accurate record. These
-- are editorial starter rows written by whoever set the instance up; no member
-- proposed them and no moderator reviewed a proposal. approved_at is filled in
-- by the locations_stamp_approval trigger.
--
-- The two places flagged is_sensitive are stored at two decimal places rather
-- than six. publishableCoordinates() would coarsen them on the way out anyway,
-- but storing them coarse means even a database dump cannot give up a precise
-- point for a residential street or a working diner. Precision you never
-- collected is the only kind that cannot leak.
insert into public.locations (
  id, slug, name, city, country, country_code,
  latitude, longitude, description, best_time_of_day, is_sensitive, status
) values
  ('b2d5f100-0000-4000-8000-000000000001', 'shinjuku-backstreets-tokyo',
   'Shinjuku backstreets', 'Tokyo', 'Japan', 'JP',
   35.693835, 139.699738,
   'The grid of narrow service streets behind the main Shinjuku strip. Almost no daylight reaches them, so the entire exposure is signage, vending machines and whatever is reflecting off the asphalt.',
   'After dark, 20:00 onwards', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000002', 'tokyo-twilight-overlook',
   'Tokyo twilight overlook', 'Tokyo', 'Japan', 'JP',
   35.660429, 139.729241,
   'A raised walkway with an unobstructed line across the western skyline. The interest is in the ten minutes when the city lights and the remaining daylight are roughly equal.',
   'Blue hour', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000003', 'higashiyama-kyoto',
   'Higashiyama, below Yasaka Pagoda', 'Kyoto', 'Japan', 'JP',
   34.99, 135.78,
   'A sloping lane of wooden machiya houses with the pagoda closing the view. A residential street before it is anything else, which is why the published coordinate is approximate.',
   'Early morning, before 07:00', true, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000004', 'myeongdong-seoul',
   'Myeong-dong signage streets', 'Seoul', 'South Korea', 'KR',
   37.563656, 126.98273,
   'Pedestrianised blocks where the shopfronts are stacked four storeys high. The light is almost entirely borrowed from advertising, and it changes colour as you walk.',
   'Night', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000005', 'times-square-new-york',
   'Times Square', 'New York', 'United States', 'US',
   40.758, -73.98551,
   'The most photographed junction in the world, which is the difficulty rather than the appeal. The screens give enough light to shoot at a stopped-down aperture well after midnight.',
   'After dark', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000006', 'brooklyn-bridge-waterfront',
   'Brooklyn Bridge waterfront', 'New York', 'United States', 'US',
   40.703342, -73.989677,
   'The cobbled streets and the pier below the bridge, where the structure, the river and the Manhattan skyline are all available from one position.',
   'Sunset into blue hour', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000007', 'midtown-avenues-new-york',
   'Midtown avenues', 'New York', 'United States', 'US',
   40.754932, -73.984016,
   'Long north-south avenues that compress into near-flat planes through a telephoto lens. Traffic islands give you a safe, central position; the crossing signals give you the gaps.',
   'Golden hour, or early Sunday', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000008', 'financial-district-canyons',
   'Financial District canyons', 'New York', 'United States', 'US',
   40.70724, -74.01121,
   'Pre-war towers at close quarters, with one or two hours around the middle of the day when light reaches the pavement at all.',
   'Mid-morning', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000009', 'tower-bridge-thames',
   'Tower Bridge and the Pool of London', 'London', 'United Kingdom', 'GB',
   51.505456, -0.075356,
   'Both banks are walkable and the bridge reads differently from each. The south side gives you the towers against the sky; the north gives you the river traffic.',
   'Late afternoon', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000010', 'champ-de-mars-paris',
   'Champ de Mars', 'Paris', 'France', 'FR',
   48.85614, 2.297924,
   'The lawns south-east of the tower, where the structure can be set against people rather than against itself. Busy, and worth walking away from the obvious centre line.',
   'Dusk', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000011', 'downtown-toronto',
   'Downtown core', 'Toronto', 'Canada', 'CA',
   43.642566, -79.387057,
   'Glass towers at close range, with the lake throwing light back up into them. The streets run on a clean grid, so the sun lines up along them twice a year.',
   'Blue hour', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000012', 'rione-monti-rome',
   'Rione Monti and the Colosseum', 'Rome', 'Italy', 'IT',
   41.890251, 12.492373,
   'The residential streets uphill from the amphitheatre, where washing lines and scooters sit in front of two thousand years of masonry.',
   'Early morning', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000013', 'jordaan-canals-amsterdam',
   'Jordaan canals', 'Amsterdam', 'Netherlands', 'NL',
   52.374874, 4.881264,
   'Narrow canals and bridges with a consistent facade height, so reflections hold their shape. Quiet enough early that the water is still.',
   'Early morning', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000014', 'manarola-cinque-terre',
   'Manarola, Cinque Terre', 'Manarola', 'Italy', 'IT',
   44.106825, 9.727472,
   'The footpath above the harbour, looking back at stacked houses on the cliff. A small village doing a great deal of visitor traffic, so arrive on foot and early.',
   'Last hour before sunset', false, 'approved'),

  ('b2d5f100-0000-4000-8000-000000000015', 'lower-east-side-diner',
   'Lower East Side diner', 'New York', 'United States', 'US',
   40.72, -73.99,
   'A working counter-service diner. A business with staff and regulars rather than a landmark, which is why the coordinate is approximate and why asking before photographing inside is not optional.',
   'Mid-morning, off peak', true, 'approved')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- A note on what a freshly seeded database looks like
-- -----------------------------------------------------------------------------
-- /locations and /map have fifteen places. /discover, /community and every
-- photograph count are empty, and PlatformStats returns zeros with isDemoData
-- false, because that is the truth about an instance nobody has uploaded to
-- yet. The first moderator is promoted by hand:
--
--   update public.profiles set role = 'moderator' where username = '<username>';
--
-- run from the SQL editor or psql as the postgres role. There is no code path
-- that promotes an account, which is the point — see handle_new_user() in
-- 0006_functions_and_triggers.sql.
