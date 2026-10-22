#!/usr/bin/env node
/**
 * Compute a perceptual fingerprint (migration 0037) for every stored
 * photograph that does not have one yet.
 *
 * Needed once, for the photographs stored before 0037 existed; from then on
 * the upload computes the fingerprint itself. Safe to run again at any time —
 * a photograph that already has a row is skipped, and the hash is derived from
 * the public display derivative, which is the same input the upload uses, so a
 * value computed here is the value the upload would have stored.
 *
 * Needs the service role: `SUPABASE_URL` (or NEXT_PUBLIC_SUPABASE_URL) and
 * `SUPABASE_SERVICE_ROLE_KEY` (or SUPABASE_SECRET_KEY) in the environment.
 * Nothing is printed but counts and the ids it worked on.
 *
 *   node scripts/backfill-fingerprints.mjs            # do it
 *   node scripts/backfill-fingerprints.mjs --dry-run  # only say what it would do
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.STORAGE_BUCKET ?? 'photographs';
const dryRun = process.argv.includes('--dry-run');

if (!url || !key) {
  console.error('backfill-fingerprints: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// The same algorithm as src/lib/images/fingerprint.ts, kept in step by hand:
// 9×8 grey, each bit "left pixel brighter than the one to its right".
async function dhash(bytes) {
  const { data, info } = await sharp(bytes, { failOn: 'error' })
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 9 || info.height !== 8 || info.channels !== 1) {
    throw new Error(`unexpected grid ${info.width}×${info.height}×${info.channels}`);
  }
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      bits += data[row * 9 + col] > data[row * 9 + col + 1] ? '1' : '0';
    }
  }
  return bits;
}

const { data: images, error } = await supabase
  .from('photograph_images')
  .select('photograph_id, storage_key, photographs!inner(status)')
  .eq('variant', 'display')
  .in('photographs.status', ['published', 'under_review', 'processing']);

if (error) {
  console.error(`backfill-fingerprints: reading photographs failed — ${error.message}`);
  process.exit(1);
}

const { data: existing } = await supabase.from('photograph_fingerprints').select('photograph_id');
const done = new Set((existing ?? []).map((row) => row.photograph_id));

const todo = (images ?? []).filter((row) => !done.has(row.photograph_id));
console.log(`${images?.length ?? 0} stored photographs, ${done.size} already fingerprinted, ${todo.length} to do${dryRun ? ' (dry run)' : ''}`);

let written = 0;
for (const row of todo) {
  const publicUrl = `${url}/storage/v1/object/public/${bucket}/${row.storage_key.replace(/^\/+/, '')}`;
  const response = await fetch(publicUrl);
  if (!response.ok) {
    console.error(`  ${row.photograph_id}: display file answered HTTP ${response.status}`);
    continue;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = await dhash(bytes);
  if (dryRun) {
    console.log(`  ${row.photograph_id}: would store ${hash}`);
    continue;
  }
  const { error: writeError } = await supabase.from('photograph_fingerprints').upsert(
    { photograph_id: row.photograph_id, dhash: hash, method: 'dhash-9x8-display', computed_at: new Date().toISOString() },
    { onConflict: 'photograph_id' },
  );
  if (writeError) {
    console.error(`  ${row.photograph_id}: storing failed — ${writeError.message}`);
    continue;
  }
  written += 1;
  console.log(`  ${row.photograph_id}: stored`);
}
console.log(`${written} fingerprint${written === 1 ? '' : 's'} written`);
