import { serverEnv } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import {
  AVATAR_FOLDER,
  assertSignableUpload,
  encodeKeyPath,
  isOriginalKey,
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
  const originalsBucket = env.originalsBucket;
  const origin = env.supabaseUrl.replace(/\/+$/, '');

  // The key decides the bucket (0031): an upload's original goes to the
  // private bucket, everything served goes to the public one. Every caller
  // already builds keys with storageKeys(), so none of them has to know.
  const bucketFor = (key: string) => (isOriginalKey(key) ? originalsBucket : bucket);

  return {
    name: 'supabase',

    async createSignedUpload(input) {
      assertSignableUpload(input);

      const supabase = await createClient();
      const { data, error } = await supabase.storage
        .from(bucketFor(input.key))
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
     * Served files only. The public bucket is public-read: the derivatives are
     * published photographs. An original has no public address at all — it
     * lives in the private bucket — so asking for one is a bug in the caller.
     */
    publicUrl(key) {
      if (isOriginalKey(key)) {
        throw new StorageRequestError(`Refusing a public address for ${key}: an original is never served.`);
      }
      return `${origin}/storage/v1/object/public/${bucket}/${encodeKeyPath(key)}`;
    },

    /**
     * Read an original back for processing, as the member — the private
     * bucket lets them read their own prefix and nobody else's. Null when it
     * is not there, including the moment between the upload finishing and the
     * object becoming readable; the caller retries.
     */
    async readOriginal(key) {
      if (!isOriginalKey(key)) {
        throw new StorageRequestError(`Refusing to read ${key} as an original.`);
      }
      const supabase = await createClient();
      const { data, error } = await supabase.storage.from(originalsBucket).download(key);
      if (error !== null || data === null) {
        console.error(`FRAME storage: reading ${key} failed — ${error?.message ?? 'no data'}`);
        return null;
      }
      return new Uint8Array(await data.arrayBuffer());
    },

    async remove(keys, options = {}) {
      if (keys.length === 0) return;

      for (const key of keys) {
        if (parseStorageKey(key) === null) {
          throw new StorageRequestError(
            `Refusing to delete "${key}": it is not a key this app writes.`,
          );
        }
      }

      // As the member unless the caller says otherwise; see StorageDriver.remove.
      const supabase = options.asService ? createAdminClient() : await createClient();

      // One request per bucket: an original and its derivatives live apart.
      const byBucket = new Map<string, string[]>();
      for (const key of keys) {
        const target = bucketFor(key);
        byBucket.set(target, [...(byBucket.get(target) ?? []), key]);
      }

      for (const [target, targetKeys] of byBucket) {
        const { error } = await supabase.storage.from(target).remove(targetKeys);
        if (error !== null) {
          throw new StorageRequestError('Supabase Storage refused to delete those objects.', {
            cause: error,
          });
        }
      }

      /*
       * "No error" does not mean "deleted". Storage applies the bucket's RLS
       * policies to a delete, and an object the policy does not let this member
       * delete is not refused — it is simply left out, and the call succeeds
       * with nothing removed. Without the delete policy (migration 0008), every
       * removal here would report success and leave the files publicly
       * reachable; deleting an account would then tell a member their
       * photographs were gone while their old addresses still served them.
       * That is not hypothetical: it is what happened, in a local test, before
       * this check existed.
       *
       * So the folders are listed afterwards, in each bucket, and any key still
       * there is an error. The response's own list of deleted objects cannot
       * answer this: a key that never existed is absent from it too, and a
       * draft has no derivatives yet.
       *
       * The listing uses the service role, which RLS does not filter. Listed
       * as the member, it would go through the read policy, and a bucket
       * missing that too would list as empty and pass — the same false success
       * one step later. This is the one read in the app that has to see past
       * the policies, because its whole job is to check what they did; it
       * reads, and writes nothing. Without a service-role key the member's own
       * client is used, and the log says the check is weaker.
       */
      let verifier: typeof supabase = supabase;
      try {
        verifier = createAdminClient();
      } catch {
        console.warn(
          'FRAME storage: no service-role key, so deletions are confirmed through the read policy and cannot see past it. Set SUPABASE_SERVICE_ROLE_KEY.',
        );
      }

      for (const [target, targetKeys] of byBucket) {
        const byFolder = new Map<string, Set<string>>();
        for (const key of targetKeys) {
          const parsed = parseStorageKey(key);
          if (!parsed) continue;
          // An avatar has no photograph id; its folder is `<owner>/avatars`.
          // (Listing `<owner>/null` here, as this check once did, found
          // nothing and so passed whether or not the avatar was gone.)
          const folder = parsed.photographId
            ? `${parsed.ownerId}/${parsed.photographId}`
            : `${parsed.ownerId}/${AVATAR_FOLDER}`;
          const leaves = byFolder.get(folder) ?? new Set<string>();
          leaves.add(parsed.leaf);
          byFolder.set(folder, leaves);
        }

        for (const [folder, leaves] of byFolder) {
          const { data: listed, error: listError } = await verifier.storage
            .from(target)
            .list(folder, { limit: 100 });
          if (listError !== null) {
            throw new StorageRequestError(`Could not confirm the objects in ${folder} were deleted.`, {
              cause: listError,
            });
          }
          const remaining = (listed ?? []).filter((object) => leaves.has(object.name));
          if (remaining.length > 0) {
            throw new StorageRequestError(
              `Supabase Storage reported ${folder} deleted, but ${remaining.length} object(s) remain. Check the bucket's delete policy.`,
            );
          }
        }
      }
    },
  };
}
