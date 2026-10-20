#!/usr/bin/env node
/**
 * Reserved usernames are enforced in two places, which must agree.
 *
 *   src/lib/validation/auth.ts   RESERVED_USERNAMES, for the Join form
 *   supabase/migrations/*.sql    c_reserved in handle_new_user(), for accounts
 *                                whose username the trigger chooses — those
 *                                made through Google, Apple, Facebook or X
 *
 * A name added to one and not the other is a reserved name that can be taken
 * by whichever path was missed. Both sides carry a "keep in step" comment;
 * this is what makes that comment true.
 *
 * The migration checked is the last one that defines handle_new_user(), since
 * that is the definition in force. A later redefinition without a c_reserved
 * list fails here too, which is the regression this exists to catch.
 *
 * Run from the repository root: node scripts/assert-reserved-usernames.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VALIDATION = 'src/lib/validation/auth.ts';
const MIGRATIONS = 'supabase/migrations';

function fail(message) {
  console.error(`reserved usernames: ${message}`);
  process.exit(1);
}

/** The quoted names inside a block, with line comments removed first. */
function namesIn(block) {
  const withoutComments = block.replace(/--[^\n]*|\/\/[^\n]*/g, '');
  return new Set([...withoutComments.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
}

const ts = readFileSync(VALIDATION, 'utf8');
const tsBlock = ts.match(/export const RESERVED_USERNAMES = \[([\s\S]*?)\] as const;/);
if (!tsBlock) fail(`RESERVED_USERNAMES was not found in ${VALIDATION}`);
const fromForm = namesIn(tsBlock[1]);

const definingFiles = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .filter((file) =>
    /create or replace function public\.handle_new_user\(\)/i.test(
      readFileSync(join(MIGRATIONS, file), 'utf8'),
    ),
  );
const current = definingFiles.at(-1);
if (!current) fail(`no migration in ${MIGRATIONS} defines handle_new_user()`);

const sql = readFileSync(join(MIGRATIONS, current), 'utf8');
const sqlBlock = sql.match(/c_reserved\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/i);
if (!sqlBlock) {
  fail(`${current} defines handle_new_user() without a c_reserved list, so the trigger no longer refuses reserved names`);
}
const fromTrigger = namesIn(sqlBlock[1]);

const onlyForm = [...fromForm].filter((name) => !fromTrigger.has(name)).sort();
const onlyTrigger = [...fromTrigger].filter((name) => !fromForm.has(name)).sort();

if (fromForm.size === 0) fail(`RESERVED_USERNAMES in ${VALIDATION} parsed as empty`);

if (onlyForm.length || onlyTrigger.length) {
  if (onlyForm.length) {
    console.error(`  reserved by the form but not by ${current}: ${onlyForm.join(', ')}`);
  }
  if (onlyTrigger.length) {
    console.error(`  reserved by ${current} but not by the form: ${onlyTrigger.join(', ')}`);
  }
  fail('the two lists differ — add each name to both');
}

console.log(`reserved usernames: ${fromForm.size} names, identical in ${VALIDATION} and ${current}`);
