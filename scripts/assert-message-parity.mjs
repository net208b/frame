#!/usr/bin/env node
/**
 * Every message exists in every language FRAME publishes.
 *
 * The promise is that each page is readable in English and in Thai, and
 * `src/i18n/request.ts` loads one catalogue per request on purpose: a Thai page
 * never ships the English one. So there is no fallback language. A key added to
 * `en.json` and forgotten in `th.json` is not a build error and not a runtime
 * crash — next-intl's default fallback renders the key path itself, so the
 * mistake reaches a reader as the literal text `discover.results.total` sitting
 * in the middle of a Thai page, and nothing in CI notices.
 *
 * Nothing enforced that. `tsc` has no view into the catalogues, the build reads
 * them as data, and the two files are 2,500 keys long each, which is past the
 * size where a reviewer can see a one-sided addition in a diff. Until now the
 * guarantee was kept by discipline alone.
 *
 * What is compared is the *shape*: the same keys, in the same order, each
 * holding text somebody can read. Not the ICU arguments inside a message —
 * Thai has no plural inflection, so `{count, plural, one {…} other {…}}` in
 * English is correctly a plain `{formatted}` sentence in Thai, and demanding
 * the same arguments on both sides would be demanding a mistranslation.
 *
 * The locale list is read from `src/i18n/locales.ts`, which is the single
 * source of truth for it, so a third language is covered the day it is added
 * rather than the day somebody remembers this file.
 *
 * Run from the repository root: node scripts/assert-message-parity.mjs
 */

import { readFileSync } from 'node:fs';

const LOCALES_MODULE = 'src/i18n/locales.ts';
const MESSAGES = 'src/messages';

/** How many names are printed per mismatch before the rest are counted. */
const PRINT_LIMIT = 20;

function fail(message) {
  console.error(`message parity: ${message}`);
  process.exit(1);
}

/** The locale set, taken from the module that declares it. */
function locales() {
  const source = readFileSync(LOCALES_MODULE, 'utf8');
  const block = source.match(/export const LOCALES = \[([\s\S]*?)\] as const;/);
  if (!block) fail(`LOCALES was not found in ${LOCALES_MODULE}`);

  const found = [...block[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  if (found.length < 2) {
    fail(`${LOCALES_MODULE} declares ${found.length} locale(s), so there is no parity to check`);
  }
  return found;
}

/**
 * Every message in a catalogue, by dotted path.
 *
 * `groups` is kept alongside the leaves so that a key which is a message in one
 * language and a group of messages in another is reported as the shape mistake
 * it is, rather than as an unrelated pair of missing keys.
 */
function flatten(value, path, leaves, groups) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (path) groups.add(path);
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, leaves, groups);
    }
    return;
  }
  leaves.set(path, value);
}

function catalogue(locale) {
  const file = `${MESSAGES}/${locale}.json`;

  // A locale declared in LOCALES with no catalogue is its own mistake, and a
  // different one from a catalogue that will not parse, so the two are told
  // apart rather than both reported as bad JSON.
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    fail(`${LOCALES_MODULE} declares the locale "${locale}" but ${file} is missing — ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${file} could not be parsed as JSON — ${error.message}`);
  }

  const leaves = new Map();
  const groups = new Set();
  flatten(parsed, '', leaves, groups);
  if (leaves.size === 0) fail(`${file} holds no messages`);

  const unreadable = [...leaves]
    .filter(([, text]) => typeof text !== 'string' || text.trim() === '')
    .map(([key]) => key);
  if (unreadable.length) {
    report(`${file} has keys that hold no readable text`, unreadable);
    fail('every key must hold a non-empty string');
  }

  return { file, leaves, groups };
}

/** One mismatch, with the list capped so a CI log stays readable. */
function report(heading, names) {
  console.error(`  ${heading} (${names.length}):`);
  const sorted = [...names].sort();
  for (const name of sorted.slice(0, PRINT_LIMIT)) console.error(`    ${name}`);
  if (sorted.length > PRINT_LIMIT) {
    console.error(`    … and ${sorted.length - PRINT_LIMIT} more`);
  }
}

const [reference, ...others] = locales().map(catalogue);

let mismatched = false;

for (const other of others) {
  const shape = [...other.leaves.keys()]
    .filter((key) => reference.groups.has(key))
    .concat([...reference.leaves.keys()].filter((key) => other.groups.has(key)));
  if (shape.length) {
    report('a message in one catalogue and a group of messages in the other', shape);
    mismatched = true;
  }

  const missingHere = [...reference.leaves.keys()].filter((key) => !other.leaves.has(key));
  const missingThere = [...other.leaves.keys()].filter((key) => !reference.leaves.has(key));

  if (missingHere.length) {
    report(`in ${reference.file} but not in ${other.file}`, missingHere);
    mismatched = true;
  }
  if (missingThere.length) {
    report(`in ${other.file} but not in ${reference.file}`, missingThere);
    mismatched = true;
  }

  // Same keys in the same order, which `docs/ARCHITECTURE.md` already states the
  // catalogues are kept in, and which is what makes the two files reviewable
  // side by side. Only the first position is reported: one key in the wrong
  // place shifts every key after it, so a full list would be a page of noise
  // about a single edit. Skipped when a key is missing, because the shift is
  // then the symptom and the missing key above is the cause.
  if (!missingHere.length && !missingThere.length) {
    const here = [...reference.leaves.keys()];
    const there = [...other.leaves.keys()];
    const at = here.findIndex((key, index) => key !== there[index]);
    if (at !== -1) {
      console.error(`  the keys are ordered differently, from position ${at + 1}:`);
      console.error(`    ${reference.file}: ${here[at]}`);
      console.error(`    ${other.file}: ${there[at]}`);
      mismatched = true;
    }
  }
}

if (mismatched) {
  fail('the catalogues differ — every key must exist in all of them, in the same order');
}

const files = [reference, ...others].map(({ file }) => file).join(', ');
console.log(`message parity: ${reference.leaves.size} keys, identical in ${files}`);
