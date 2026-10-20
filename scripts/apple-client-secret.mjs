#!/usr/bin/env node
/**
 * Make the client secret Supabase needs for Sign in with Apple.
 *
 * Apple does not issue a client secret. It issues a private key (a .p8 file),
 * and the secret is a JWT signed with that key — which Apple refuses once it
 * is more than six months old. So this has to be run again twice a year, and
 * if nobody does, the Apple button stops working without any error on FRAME's
 * side: the identity service simply gets refused.
 *
 * It runs here, on your machine, so the private key never leaves it. The
 * common alternative is pasting the .p8 into a web page that makes the JWT for
 * you, which hands the key that signs in as your app to whoever runs the page.
 *
 *   node scripts/apple-client-secret.mjs \
 *     --key ~/Downloads/AuthKey_ABC123DEFG.p8 \
 *     --key-id ABC123DEFG \
 *     --team-id TEAM123456 \
 *     --services-id com.worldofstreetphoto.frame.web
 *
 * Paste the printed JWT into Supabase → Authentication → Providers → Apple →
 * Secret Key, and put the printed renewal date in a calendar.
 *
 * Nothing is written anywhere. The JWT is printed to stdout only.
 */

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

/** Apple's ceiling is six months; a day short of it, so a slow paste still fits. */
const LIFETIME_SECONDS = 15_777_000 - 86_400;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Missing --${name}. Run with --key, --key-id, --team-id and --services-id.`);
    process.exit(1);
  }
  return value;
}

const keyPath = argument('key').replace(/^~(?=\/)/, homedir());
const keyId = argument('key-id');
const teamId = argument('team-id');
const servicesId = argument('services-id');

let privateKey;
try {
  privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'));
} catch (error) {
  console.error(`Could not read a private key from ${keyPath}: ${error.message}`);
  process.exit(1);
}

if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
  console.error(`${keyPath} is not a P-256 EC key. Apple's .p8 files are; is this the right file?`);
  process.exit(1);
}

const base64url = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

const now = Math.floor(Date.now() / 1000);
const expires = now + LIFETIME_SECONDS;

const header = { alg: 'ES256', kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp: expires,
  aud: 'https://appleid.apple.com',
  sub: servicesId,
};

const signingInput = `${base64url(header)}.${base64url(payload)}`;
// ES256 in a JWS is the raw r‖s pair, not the DER structure Node produces by
// default — which is what `ieee-p1363` asks for.
const signature = sign('sha256', Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
}).toString('base64url');

console.log(`${signingInput}.${signature}`);
console.error('');
console.error(`Valid until ${new Date(expires * 1000).toISOString().slice(0, 10)}.`);
console.error('Make a new one before then, or Sign in with Apple stops working on FRAME.');
