import { AppreciateButton } from '@/components/photo/AppreciateButton';
import { CategoryTag } from '@/components/photo/CategoryTag';
import { cn, formatDate } from '@/lib/utils';
import type { PhotographDetail } from '@/types/domain';

/**
 * The top of the information column: what this photograph is called, what the
 * photographer wanted from it, and the one control this page actually offers.
 *
 * The h1 is the title and nothing else, so the page announces the frame rather
 * than the site.
 */
export function PhotoHeadline({
  photo,
  className,
}: {
  photo: PhotographDetail;
  className?: string;
}) {
  const published = formatDate(photo.publishedAt);
  // The domain type uses null for "signed out", which is what keeps the
  // appreciate control from pretending to be a toggle for a visitor.
  const signedIn = photo.viewerHasAppreciated !== null;

  return (
    <header className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag category={photo.category} tone="surface" />
        {photo.editorsPick ? (
          <span className="inline-flex items-center rounded-pill bg-ink px-2.5 py-1.5 text-eyebrow text-on-ink uppercase">
            Editor’s pick
          </span>
        ) : null}
      </div>

      <h1 className="text-section-fluid mt-4 font-bold">{photo.title}</h1>

      {photo.description ? (
        <p className="mt-4 text-lead text-ink-soft">{photo.description}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <AppreciateButton
          photographId={photo.id}
          slug={photo.slug}
          title={photo.title}
          initialCount={photo.appreciationCount}
          initialHasAppreciated={photo.viewerHasAppreciated}
          signedIn={signedIn}
          variant="inline"
        />

        {published ? (
          <p className="text-meta text-muted">
            Published{' '}
            <time dateTime={photo.publishedAt} className="text-ink-soft">
              {published}
            </time>
          </p>
        ) : null}
      </div>
    </header>
  );
}
