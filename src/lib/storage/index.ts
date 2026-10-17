import { isDemoMode, serverEnv } from '@/lib/config';

import { r2StorageDriver } from './r2';
import { supabaseStorageDriver } from './supabase';
import { StorageConfigurationError, type StorageDriver } from './types';

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

export * from './types';
