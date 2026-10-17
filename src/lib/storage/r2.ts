import { createHash, createHmac } from 'node:crypto';

import { serverEnv } from '@/lib/config';

import {
  assertSignableUpload,
  encodeKeyPath,
  parseStorageKey,
  SIGNED_UPLOAD_TTL_SECONDS,
  StorageConfigurationError,
  StorageRequestError,
  type StorageDriver,
} from './types';

/**
 * Cloudflare R2 driver, signing S3-compatible requests with SigV4 by hand.
 *
 * The signature is implemented here rather than with an SDK because the AWS
 * JavaScript SDK is a large dependency for four HMACs, and this project adds no
 * dependency it does not need. The steps below follow the AWS "Signature
 * Version 4 for presigned URLs" procedure in order, and
 * `presignR2Request` is exported so that procedure can be exercised against
 * AWS's own published test vector rather than only against a live bucket.
 *
 * What a presigned PUT can and cannot promise, stated plainly because the UI
 * must not imply more:
 *
 * - The content type is pinned. It is a signed header, so a client that sends
 *   a different one gets a signature mismatch and writes nothing.
 * - The maximum size is not pinned. SigV4 can sign an exact `content-length`,
 *   but it has no way to express a range, and R2 does not support the POST
 *   policy form that carries `content-length-range`. The ceiling is therefore
 *   enforced by the short expiry on the grant and by `verifyImageBytes`
 *   rejecting the bytes that actually arrived, before anything is attached or
 *   published.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';
/** R2 has a single region and names it `auto`. */
const R2_REGION = 'auto';
const S3_SERVICE = 's3';
/** A presigned request does not hash a body, and says so in the signature. */
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/**
 * `encodeURIComponent` leaves `!'()*` alone; the canonical request requires
 * them percent-encoded, and one stray character changes the signature.
 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Code-unit ordering, which is what the canonical request requires.
 * `localeCompare` would be locale-dependent and could reorder a header or a
 * query parameter on one machine and not another.
 */
function compareFirst(a: readonly [string, string], b: readonly [string, string]): number {
  if (a[0] === b[0]) return 0;
  return a[0] < b[0] ? -1 : 1;
}

/** `2024-03-12T18:40:00.000Z` becomes `20240312T184000Z`. */
function timestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export interface PresignInput {
  method: 'GET' | 'PUT' | 'DELETE';
  /** The request host, which is also a signed header. */
  host: string;
  /** The canonical path, already percent-encoded per segment. */
  canonicalPath: string;
  /** Pins the media type of the body, when there is one. */
  contentType?: string;
  expiresInSeconds: number;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  /** Injectable so the signature is reproducible under test. */
  now?: Date;
}

/** Build a presigned URL. Signs nothing it was not asked to sign. */
export function presignR2Request(input: PresignInput): string {
  const region = input.region ?? R2_REGION;
  const service = input.service ?? S3_SERVICE;
  const { amzDate, dateStamp } = timestamps(input.now ?? new Date());

  // Step 1 — the headers this grant pins. `host` always; `content-type` when
  // there is a body, which is what stops a grant issued for a JPEG being used
  // to write something else. Canonical form is lowercase name, trimmed value,
  // sorted by name.
  const headers: Array<[string, string]> = [['host', input.host]];
  if (input.contentType !== undefined) headers.push(['content-type', input.contentType]);
  headers.sort(compareFirst);
  const canonicalHeaders = headers.map(([name, value]) => `${name}:${value.trim()}\n`).join('');
  const signedHeaders = headers.map(([name]) => name).join(';');

  // Step 2 — the query string carries the credential scope and the signed
  // header list, encoded and sorted by key.
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const queryParameters: Array<[string, string]> = [
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${input.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];
  const canonicalQuery = queryParameters
    .map(([name, value]): [string, string] => [encodeRfc3986(name), encodeRfc3986(value)])
    .sort(compareFirst)
    .map(([name, value]) => `${name}=${value}`)
    .join('&');

  // Step 3 — the canonical request, then the string to sign over it.
  const canonicalRequest = [
    input.method,
    input.canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join('\n');

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // Step 4 — the signing key walks the secret through the scope, so a leaked
  // signature is useless outside that day, region and service.
  const dateKey = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return `https://${input.host}${input.canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Accepts `images.example.com` or `https://images.example.com`. */
function publicOrigin(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicHost: string;
}

function requireVariable(value: string | null, variable: string): string {
  if (value === null || value.trim().length === 0) {
    throw new StorageConfigurationError(
      `STORAGE_PROVIDER is set to r2 but ${variable} is not set. See docs/ENVIRONMENT.md.`,
      variable,
    );
  }
  return value;
}

/**
 * Read the R2 variables, naming the first one that is missing. A
 * half-configured provider is worse than an unconfigured one: it fails at the
 * moment a member presses Upload rather than when the driver is built.
 */
function r2Credentials(): R2Credentials {
  const { r2 } = serverEnv();
  return {
    accountId: requireVariable(r2.accountId, 'R2_ACCOUNT_ID'),
    accessKeyId: requireVariable(r2.accessKeyId, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: requireVariable(r2.secretAccessKey, 'R2_SECRET_ACCESS_KEY'),
    publicHost: publicOrigin(requireVariable(r2.publicHost, 'NEXT_PUBLIC_IMAGE_HOST')),
  };
}

export function r2StorageDriver(): StorageDriver {
  const env = serverEnv();
  const credentials = r2Credentials();
  const bucket = env.storageBucket;
  const host = `${credentials.accountId}.r2.cloudflarestorage.com`;
  const canonicalPathFor = (key: string) => `/${encodeKeyPath(bucket)}/${encodeKeyPath(key)}`;

  return {
    name: 'r2',

    async createSignedUpload(input) {
      assertSignableUpload(input);

      return {
        url: presignR2Request({
          method: 'PUT',
          host,
          canonicalPath: canonicalPathFor(input.key),
          contentType: input.contentType,
          expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        }),
        method: 'PUT',
        // Sent verbatim or the signature will not verify.
        headers: { 'content-type': input.contentType },
        expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
      };
    },

    publicUrl(key) {
      return `${credentials.publicHost}/${encodeKeyPath(key)}`;
    },

    async remove(keys) {
      for (const key of keys) {
        if (parseStorageKey(key) === null) {
          throw new StorageRequestError(
            `Refusing to delete "${key}": it is not a key this app writes.`,
          );
        }
      }

      // One signed DELETE per key, in sequence: a batch delete would mean
      // signing an MD5-checksummed POST body for no real gain at this volume.
      for (const key of keys) {
        const url = presignR2Request({
          method: 'DELETE',
          host,
          canonicalPath: canonicalPathFor(key),
          expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        });

        const response = await fetch(url, { method: 'DELETE' });
        // A missing object is the state we were asking for, so 404 is success.
        if (!response.ok && response.status !== 404) {
          throw new StorageRequestError(
            `R2 refused to delete ${key} (${response.status} ${response.statusText}).`,
          );
        }
      }
    },
  };
}
