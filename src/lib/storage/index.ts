import { isDemoMode, serverEnv } from '@/lib/config';

import { r2StorageDriver } from './r2';
import { supabaseStorageDriver } from './supabase';
import { StorageConfigurationError, StorageRequestError, type StorageDriver } from './types';

/**
 * Pick the storage driver from configuration.
 *
 * Which provider holds the photographs is a deployment decision, so it is read
 * from `STORAGE_PROVIDER` and nothing above this module knows the answer. When
 * the selected provider is not fully configured this throws and names the
 * variable to set, because an upload that appears to work and quietly stores
 * nothing is the worst of the available failures.
 */
export function storageDriver(): StorageDriver {
  if (typeof window !== 'undefined') {
    throw new StorageConfigurationError(
      'storageDriver() must never be called from client-side code: it reads provider secrets.',
    );
  }

  if (isDemoMode()) {
    throw new StorageConfigurationError(
      'Uploads need a database and a storage bucket. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See docs/ENVIRONMENT.md.',
      'NEXT_PUBLIC_SUPABASE_URL',
    );
  }

  const { storageProvider } = serverEnv();

  switch (storageProvider) {
    case 'supabase':
      return supabaseStorageDriver();
    case 'r2':
      return r2StorageDriver();
    default:
      // `serverEnv()` asserts the variable into the union without checking it,
      // so an unrecognised value reaches here at runtime even though the type
      // says it cannot.
      throw new StorageConfigurationError(
        `STORAGE_PROVIDER is set to "${String(storageProvider)}", which is not a provider FRAME supports. Use supabase or r2. See docs/ENVIRONMENT.md.`,
        'STORAGE_PROVIDER',
      );
  }
}

/**
 * Write bytes the server already holds, through the same grant a browser gets.
 *
 * Most objects in FRAME never pass through this process: a photograph is 25 MB
 * of somebody's camera output and goes straight from their browser to the
 * provider with a signed URL, which is the whole reason that endpoint exists.
 * An avatar is different — it is a 256-pixel square this server just produced
 * from bytes it already has in memory, and asking the browser to upload it
 * again would be a second round trip to move 40 kilobytes.
 *
 * It goes through `createSignedUpload` rather than adding a `put` to the driver
 * interface, so both providers keep exactly one code path for writing an object
 * and both keep enforcing `assertSignableUpload` on the key. The grant is
 * scoped to these bytes and this content type, as any other grant is.
 */
export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const driver = storageDriver();
  const grant = await driver.createSignedUpload({
    key,
    contentType,
    maxBytes: bytes.byteLength,
  });

  const response = await fetch(grant.url, {
    method: grant.method,
    headers: grant.headers,
    // A fresh ArrayBuffer, because a Uint8Array view over a larger buffer would
    // otherwise send the whole buffer.
    body: bytes.slice().buffer as ArrayBuffer,
  });

  if (!response.ok) {
    throw new StorageRequestError(
      `Storage refused the upload of ${key}: ${response.status} ${response.statusText}.`,
    );
  }

  return driver.publicUrl(key);
}

export * from './types';
