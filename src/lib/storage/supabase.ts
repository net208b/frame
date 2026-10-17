import { serverEnv } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

import {
  assertSignableUpload,
  encodeKeyPath,
  parseStorageKey,
  StorageRequestError,
  type StorageDriver,
} from './types';

/**
 * Supabase Storage driver.
 *
 * The client is the cookie-bound one, so row-level security decides whether
 * this member may write this key. That keeps one answer to "who may write
 * here" rather than two — an RLS policy and a second set of checks in this
 * file that could disagree with it.
 *
 * Two limits worth stating plainly, because the UI must not imply otherwise:
 *
 * 1. Supabase fixes the lifetime of a signed upload token at two hours and
 *    offers no way to shorten it, so that is the figure reported on the grant.
 * 2. A signed upload URL carries no per-grant size or type limit. The ceiling
 *    is a bucket setting (`file_size_limit`, `allowed_mime_types`), which
 *    docs/EXTERNAL-SERVICES.md requires to match UPLOAD_POLICY, and the bytes
 *    that actually arrive are checked by `verifyImageBytes` before any
 *    derivative is attached or anything is published.
 */

/** Fixed by the Storage API, not by us. */
const SUPABASE_SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

/** Derivatives are immutable once written, so they may be cached hard. */
const CACHE_CONTROL = `max-age=${365 * 24 * 60 * 60}`;

export function supabaseStorageDriver(): StorageDriver {
  const env = serverEnv();
  const bucket = env.storageBucket;
  const origin = env.supabaseUrl.replace(/\/+$/, '');

  return {
    name: 'supabase',

    async createSignedUpload(input) {
      assertSignableUpload(input);

      const supabase = await createClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        // Upsert so a retry after a dropped connection succeeds instead of
        // stranding the draft behind a key that already exists.
        .createSignedUploadUrl(input.key, { upsert: true });

      if (error !== null || data === null) {
        throw new StorageRequestError(
          `Supabase Storage refused to sign an upload for ${input.key}.`,
          { cause: error },
        );
      }

      return {
        url: data.signedUrl,
        method: 'PUT',
        headers: {
          'content-type': input.contentType,
          'cache-control': CACHE_CONTROL,
          'x-upsert': 'true',
        },
        expiresInSeconds: SUPABASE_SIGNED_UPLOAD_TTL_SECONDS,
      };
    },

    /**
     * Assumes the bucket is public-read, which is how FRAME configures it: the
     * derivatives are published photographs. A private bucket would need signed
     * download URLs instead, which is a repository-level change, not a string
     * built here.
     */
    publicUrl(key) {
      return `${origin}/storage/v1/object/public/${bucket}/${encodeKeyPath(key)}`;
    },

    async remove(keys) {
      if (keys.length === 0) return;

      for (const key of keys) {
        if (parseStorageKey(key) === null) {
          throw new StorageRequestError(
            `Refusing to delete "${key}": it is not a key this app writes.`,
          );
        }
      }

      const supabase = await createClient();
      const { error } = await supabase.storage.from(bucket).remove([...keys]);
      if (error !== null) {
        throw new StorageRequestError('Supabase Storage refused to delete those objects.', {
          cause: error,
        });
      }
    },
  };
}
