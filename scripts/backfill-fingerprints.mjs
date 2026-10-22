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
 * Talks to PostgREST and Storage over plain fetch rather than through
 * supabase-js: the client's realtime module wants a WebSocket, which Node 20
 * does not provide, and a one-off script that reads two tables and writes one
 * has no use for a realtime connection in the first place.
 *
 * Needs the service role: `SUPABASE_URL` (or NEXT_PUBLIC_SUPABASE_URL) and
 * `SUPABASE_SERVICE_ROLE_KEY` (or SUPABASE_SECRET_KEY) in the environment.
 * Nothing is printed but counts and the ids it worked on.
 *
 *   node scripts/backfill-fingerprints.mjs            # do it
 *   node scripts/backfill-fingerprints.mjs --dry-run  # only say what it would do
 */
import sharp from 'sharp';

const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.STORAGE_BUCKET ?? 'photographs';
const dryRun = process.argv.includes('--dry-run');

if (!url || !key) {
  console.error('backfill-fingerprints: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

/** One PostgREST call. A non-2xx answer is an error with the body in it. */
async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${path} answered HTTP ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text.length > 0 ? JSON.parse(text) : null;
}

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

const images = await rest(
  'photograph_images?select=photograph_id,storage_key,photographs!inner(status)' +
    '&variant=eq.display&photographs.status=in.(published,under_review,processing)',
);
const existing = await rest('photograph_fingerprints?select=photograph_id');
const done = new Set((existing ?? []).map((row) => row.photograph_id));

const todo = (images ?? []).filter((row) => !done.has(row.photograph_id));
console.log(
  `${images?.length ?? 0} stored photographs, ${done.size} already fingerprinted, ${todo.length} to do${dryRun ? ' (dry run)' : ''}`,
);

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
    console.log(`  ${row.photograph_id}: would store a ${hash.length}-bit fingerprint`);
    continue;
  }
  try {
    await rest('photograph_fingerprints', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        photograph_id: row.photograph_id,
        dhash: hash,
        method: 'dhash-9x8-display',
        computed_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error(`  ${row.photograph_id}: storing failed — ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  written += 1;
  console.log(`  ${row.photograph_id}: stored`);
}
console.log(`${written} fingerprint${written === 1 ? '' : 's'} written`);
