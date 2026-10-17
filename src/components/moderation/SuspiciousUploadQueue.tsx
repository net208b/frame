import Image from 'next/image';
import Link from 'next/link';

import { DecisionForm, type DecisionOption } from '@/components/moderation/DecisionForm';
import { SignalBadge, UPLOAD_SIGNAL_LABELS } from '@/components/moderation/SignalBadge';
import { Avatar } from '@/components/photographer/Avatar';
import { QueueCapNote } from '@/components/moderation/QueueTabs';
import { SectionHead } from '@/components/ui/SectionHead';
import { EmptyState } from '@/components/ui/states';
import { formatDate, formatRelative } from '@/lib/utils';
import type { SuspiciousUpload } from '@/types/domain';

/**
 * Uploads held for review.
 *
 * The signals on these rows are the easiest thing in the product to misread. A
 * perceptual hash saying two files look alike is a reason to look; it is not
 * evidence that anyone copied anything, and the same hash fires on two
 * photographs of the same shopfront taken a year apart. So the caveat is
 * printed next to that signal rather than left in a policy document, and the
 * decision that holds an upload is as easy to reach as the one that removes it.
 */

const OPTIONS: readonly DecisionOption[] = [
  {
    value: 'approve',
    label: 'Keep and publish',
    effect: 'Clears the review and publishes the photograph.',
    reasonRequired: false,
    reasonAudience: 'internal',
  },
  {
    value: 'request_changes',
    label: 'Hold under review',
    effect:
      'Leaves it unpublished. A photograph has no separate “changes requested” state and no column for a moderator’s note, so the hold is durable but your reason stays in the moderation trail.',
    reasonRequired: true,
    reasonAudience: 'internal',
  },
  {
    value: 'remove_content',
    label: 'Remove the upload',
    effect:
      'Takes it out of FRAME. The reason is stored on the photograph, so the member reads it.',
    reasonRequired: true,
    reasonAudience: 'member',
    destructive: true,
  },
];

export function SuspiciousUploadQueue({ uploads }: { uploads: readonly SuspiciousUpload[] }) {
  return (
    <section aria-labelledby="queue-uploads">
      <SectionHead
        eyebrow="Queue"
        title={<span id="queue-uploads">Uploads to review</span>}
        description="Held before publication. Every signal below is a reason to look, not a finding."
      />

      <QueueCapNote shown={uploads.length} />

      {uploads.length === 0 ? (
        <EmptyState
          title="Nothing is held for review"
          description="No upload is waiting on a decision. Flagged uploads arrive here oldest first."
        />
      ) : (
        <ul className="border-t border-line">
          {uploads.map((upload) => (
            <UploadRow key={upload.id} upload={upload} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadRow({ upload }: { upload: SuspiciousUpload }) {
  const uploadedOn = formatDate(upload.createdAt);
  const hasHashMatch = upload.signals.some((signal) => signal.kind === 'perceptual-hash-match');

  return (
    <li className="border-b border-line py-7 last:border-b-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="flex min-w-0 gap-5">
          <Image
            src={upload.thumbUrl}
            // SuspiciousUpload carries no alt text, so this names what the
            // image is rather than claiming to describe what is in it.
            alt={`Upload held for review: ${upload.title}`}
            width={160}
            height={160}
            sizes="160px"
            className="size-20 shrink-0 rounded-media border border-line object-cover sm:size-[120px]"
          />

          <div className="min-w-0">
            <h3 className="text-title font-bold">{upload.title}</h3>

            <p className="mt-1 text-meta text-muted">
              Uploaded{' '}
              <time dateTime={upload.createdAt} title={uploadedOn ?? undefined}>
                {formatRelative(upload.createdAt)}
              </time>
              {' · not published, so it has no public page yet'}
            </p>

            <p className="mt-3 flex flex-wrap items-center gap-2 text-caption text-muted">
              <Avatar
                src={upload.uploader.avatarUrl}
                name={upload.uploader.displayName}
                size={24}
                decorative
              />
              <span>
                Uploaded by{' '}
                <Link
                  href={`/photographers/${upload.uploader.username}`}
                  className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  {upload.uploader.displayName}
                </Link>
              </span>
            </p>

            {upload.signals.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {upload.signals.map((signal, index) => (
                  <SignalBadge
                    // Derived in the repository rather than stored, so there is
                    // no id; the kind plus its position is the stable key.
                    key={`${signal.kind}-${index}`}
                    severity={signal.severity}
                    label={UPLOAD_SIGNAL_LABELS[signal.kind]}
                    message={signal.message}
                  >
                    {signal.relatedLabel ? (
                      <span className="text-meta text-muted">{signal.relatedLabel}</span>
                    ) : null}
                  </SignalBadge>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-meta text-muted">
                No automated check flagged this upload. It is here because its status is still
                under review.
              </p>
            )}

            {hasHashMatch ? (
              <p className="mt-3 rounded-card bg-warning-bg px-3.5 py-2.5 text-meta leading-relaxed text-warning">
                <span className="font-bold">A similarity match is a signal for review, not
                evidence of infringement.</span>{' '}
                <span className="text-ink-soft">
                  Two photographers can stand in the same place on different days and produce
                  near-identical frames. Compare the files and ask the uploader before deciding
                  anything from this signal alone.
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-7">
          <DecisionForm
            target={{ kind: 'upload', photographId: upload.photographId }}
            subjectLabel={`“${upload.title}” by ${upload.uploader.displayName}`}
            options={OPTIONS}
          />
        </div>
      </div>
    </li>
  );
}
