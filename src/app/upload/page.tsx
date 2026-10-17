import type { Metadata } from 'next';

import { CapabilityNotice } from '@/components/system/DemoNotice';
import { Eyebrow } from '@/components/ui/SectionHead';
import { Notice } from '@/components/ui/states';
import { UploadWizard } from '@/components/upload/UploadWizard';
import { getViewer, requireViewer } from '@/lib/auth';
import { capabilities, isDemoMode, UPLOAD_POLICY } from '@/lib/config';
import { buildMetadata } from '@/lib/seo';
import { StorageConfigurationError, storageDriver } from '@/lib/storage';
import { formatFileSize } from '@/lib/utils';

/**
 * The upload wizard's page.
 *
 * `noIndex` because this is a member's workspace: there is nothing here for a
 * search engine, and a draft in progress is nobody else's business.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Upload a photograph',
  description:
    'Add a street photograph to FRAME: the file, what is in the frame, where and how it was made, and the rights declaration that lets FRAME show it.',
  path: '/upload',
  noIndex: true,
});

/**
 * Whether storage can actually accept a file right now.
 *
 * `capabilities().uploads` goes true as soon as a database is configured, so it
 * cannot tell whether the *selected* provider has its credentials: with
 * `STORAGE_PROVIDER=r2` and no R2 keys it reports uploads as available while
 * `storageDriver()` throws. Constructing the driver is a pure read of the
 * environment with no network call, so asking it directly is the honest check,
 * and its own message names the variable to set.
 */
function storageReadiness(): { ready: boolean; reason: string | null } {
  try {
    storageDriver();
    return { ready: true, reason: null };
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return { ready: false, reason: error.message };
    }
    throw error;
  }
}

export default async function UploadPage() {
  const demo = isDemoMode();
  // Repeated from the layout rather than relied upon: the session is read once
  // per request and cached, so this costs nothing and the page does not depend
  // on a parent layout having been rendered this time round.
  const viewer = demo ? await getViewer() : await requireViewer('/upload');

  const storage = storageReadiness();
  const capabilityFlagIsOptimistic = capabilities().uploads && !storage.ready;

  return (
    <div>
      <header>
        <Eyebrow>Upload</Eyebrow>
        <h1 className="mt-2.5 text-section-fluid font-bold">
          Add a <span className="font-serif font-normal italic">photograph</span>
        </h1>
        <p className="mt-3.5 max-w-[46rem] text-lead text-muted">
          Seven steps: the file, what is in the frame, where it was made, what it was made with,
          how it was exposed and edited, a look over everything, and the rights declaration. You
          can move back and forth freely — nothing leaves your machine until the last step.
        </p>
        {viewer ? (
          <p className="mt-2.5 text-meta text-muted-soft">
            {`Uploading as ${viewer.displayName} (@${viewer.username}). Photographs up to ${formatFileSize(UPLOAD_POLICY.maxFileBytes)}, at least ${UPLOAD_POLICY.minPixelWidth} by ${UPLOAD_POLICY.minPixelHeight} pixels.`}
          </p>
        ) : null}
      </header>

      <CapabilityNotice
        capability="uploads"
        action="Uploading a photograph"
        className="mt-7"
      />

      {capabilityFlagIsOptimistic && storage.reason !== null ? (
        <Notice tone="warning" title="Image storage is not ready" className="mt-7">
          <p>
            A database is configured, but the storage provider this deployment selected is not
            usable, so a file sent from this page would have nowhere to land. {storage.reason}
          </p>
          <p className="mt-2">
            The wizard below still works as a design review. Step seven will refuse rather than
            report an upload that did not happen.
          </p>
        </Notice>
      ) : null}

      <UploadWizard uploadsConfigured={storage.ready} />
    </div>
  );
}
