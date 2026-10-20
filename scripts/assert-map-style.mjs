#!/usr/bin/env node
/**
 * Validates FRAME's basemap against the MapLibre style specification.
 *
 * It reads the four prerendered style documents out of `.next` after a build
 * rather than importing the TypeScript that produced them, which keeps this a
 * plain Node script with no compiler in front of it — the same shape as the
 * other checks in this directory.
 *
 * WHY IT EXISTS. A style error is not a crash and not a type error. MapLibre
 * reports an invalid paint property on its error channel, drops that one layer,
 * and carries on drawing the rest, so the first sign of it is a map with no
 * roads on it. Two of the rules are easy to break while writing perfectly valid
 * TypeScript: a paint property may hold only one zoom curve, and a `zoom`
 * expression may only be the input to a top-level `interpolate` or `step`. Both
 * were broken in the commit that introduced this basemap, and a run of this
 * validator is what found them.
 *
 * WHAT IT DOES NOT COVER: the pin, cluster and selection layers. They are added
 * to a live map by `src/components/map/map-style.ts` and never appear in a
 * style document, so nothing here sees them. The same two rules apply to them —
 * `byPrecision` in that module exists because of the first one — and the only
 * check on them is that the pins are visibly on the map.
 *
 * Run after `npm run build`. Without the prerendered bodies there is nothing to
 * check, and the script says so rather than passing quietly.
 */

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

const VARIANTS = ['light-en', 'light-th', 'dark-en', 'dark-th'];
const directory = argv[2] ?? '.next/server/app/basemap';

let failures = 0;

for (const variant of VARIANTS) {
  const path = `${directory}/${variant}.body`;

  let style;
  try {
    style = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    console.error(`✗ ${variant}: could not read ${path} — run \`npm run build\` first.`);
    console.error(`  ${error.message}`);
    failures += 1;
    continue;
  }

  const errors = validateStyleMin(style);
  if (errors.length === 0) {
    console.log(`✓ ${variant}: ${style.layers.length} layers`);
    continue;
  }

  failures += errors.length;
  console.error(`✗ ${variant}: ${errors.length} error(s)`);
  for (const error of errors) console.error(`  ${error.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} style problem(s). These layers would silently fail to paint.`);
  exit(1);
}

console.log('\nEvery basemap variant is a valid MapLibre style.');
