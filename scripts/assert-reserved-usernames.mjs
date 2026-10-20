#!/usr/bin/env node
/**
 * Reserved usernames are enforced in three places, which must agree.
 *
 *   src/lib/validation/auth.ts   RESERVED_USERNAMES, for the Join form and for
 *                                the username field in Settings
 *   handle_new_user()            c_reserved, for accounts whose username the
 *                                trigger chooses — those made through Google,
 *                                Apple, Facebook or X (migration 0009)
 *   is_reserved_username()       for change_username(), the one route by which
 *                                an existing username changes (migration 0010)
 *
 * A name added to one and not the others is a reserved name that can be taken
 * by whichever path was missed. Each carries a "keep in step" comment; this is
 * what makes that comment true.
 *
 * For each SQL function the migration checked is the last one that defines it,
 * since that is the definition in force. A later redefinition without its list
 * fails here, which is the regression this exists to catch. A function no
 * migration defines yet is skipped, so the check can land before 0010 does.
 *
 * Run from the repository root: node scripts/assert-reserved-usernames.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VALIDATION = 'src/lib/validation/auth.ts';
const MIGRATIONS = 'supabase/migrations';

/** Where each SQL list lives, and how to find it inside the function body. */
const SQL_SOURCES = [
  {
    name: 'handle_new_user()',
    defines: /create or replace function public\.handle_new_user\(\)/i,
    list: /c_reserved\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/i,
    required: true,
  },
  {
    name: 'is_reserved_username()',
    defines: /create or replace function public\.is_reserved_username\(/i,
    list: /function public\.is_reserved_username\([\s\S]*?=\s*any\s*\(\s*array\[([\s\S]*?)\]\s*\)/i,
    required: false,
  },
];

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
if (fromForm.size === 0) fail(`RESERVED_USERNAMES in ${VALIDATION} parsed as empty`);

const migrationFiles = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => ({ file, text: readFileSync(join(MIGRATIONS, file), 'utf8') }));

let mismatched = false;
const checked = [];

for (const source of SQL_SOURCES) {
  const current = migrationFiles.filter(({ text }) => source.defines.test(text)).at(-1);

  if (!current) {
    if (source.required) fail(`no migration in ${MIGRATIONS} defines ${source.name}`);
    continue;
  }

  const block = current.text.match(source.list);
  if (!block) {
    fail(`${current.file} defines ${source.name} without its reserved list, so it no longer refuses reserved names`);
  }

  const fromSql = namesIn(block[1]);
  const onlyForm = [...fromForm].filter((name) => !fromSql.has(name)).sort();
  const onlySql = [...fromSql].filter((name) => !fromForm.has(name)).sort();

  if (onlyForm.length) {
    console.error(`  reserved by the form but not by ${source.name} in ${current.file}: ${onlyForm.join(', ')}`);
  }
  if (onlySql.length) {
    console.error(`  reserved by ${source.name} in ${current.file} but not by the form: ${onlySql.join(', ')}`);
  }
  if (onlyForm.length || onlySql.length) mismatched = true;

  checked.push(`${source.name} in ${current.file}`);
}

if (mismatched) fail('the lists differ — add each name to all of them');

console.log(`reserved usernames: ${fromForm.size} names, identical in ${VALIDATION}, ${checked.join(' and ')}`);
