'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Avatar } from '@/components/photographer/Avatar';
import { useToast } from '@/components/system/Toast';
import { ReportDialog } from '@/components/system/ReportDialog';
import { TranslationBlock, Translated } from '@/components/translation/AutoTranslated';
import { anyTranslation } from '@/lib/translation/applies';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { DEFAULT_LOCALE, INTL_LOCALES, isLocale } from '@/i18n/locales';
import { Link, useRouter } from '@/i18n/navigation';
import { COMMENT_POLICY } from '@/lib/config';
import { cn, formatRelative } from '@/lib/utils';
import {
  deleteComment,
  editComment,
  hideComment,
  postComment,
  unhideComment,
} from '@/server/actions/comments';
import type { CritiquePreference, PhotographComment, PhotographThread } from '@/types/domain';

/**
 * The conversation under a photograph.
 *
 * Everything the buttons here allow is also decided by the database — this
 * component only ever shows a control the server would honour anyway, and a
 * refused write comes back as a toast rather than a broken thread. After any
 * change it asks the server for a fresh render (`router.refresh()`): the thread
 * is small, and a re-read is both simpler and more honest than stitching the
 * new state together on the client.
 *
 * Replies go one level deep, which is the whole shape the data model allows: a
 * comment, and the answers to it.
 */

interface ThreadViewer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentThreadProps {
  photographId: string;
  slug: string;
  photographTitle: string;
  thread: PhotographThread;
  viewer: ThreadViewer | null;
  isOwner: boolean;
  isModerator: boolean;
  /** The photographer's stated wish for how their work is discussed. */
  ownerCritique: CritiquePreference | null;
  ownerName: string;
}

export function CommentThread({
  photographId,
  slug,
  photographTitle,
  thread,
  viewer,
  isOwner,
  isModerator,
  ownerCritique,
  ownerName,
}: CommentThreadProps) {
  const t = useTranslations('comments');
  const signedIn = viewer !== null;
  const loginHref = `/login?next=${encodeURIComponent(`/photographs/${slug}`)}`;

  return (
    <section
      aria-labelledby="comments-heading"
      className="mx-auto mt-16 w-full max-w-2xl lg:mt-24"
    >
      <h2 id="comments-heading" className="text-section font-bold">
        {t('heading')}{' '}
        <span className="text-muted">· {t('count', { count: thread.count })}</span>
      </h2>

      {ownerCritique ? (
        <p className="mt-3 rounded-card border border-line bg-surface-sunken px-4 py-3 text-meta leading-relaxed text-ink-soft">
          {t(`critique.${ownerCritique}`, { name: ownerName })}
        </p>
      ) : null}

      {signedIn ? (
        <div className="mt-7">
          <CommentForm
            mode="new"
            photographId={photographId}
            parentId={null}
            viewer={viewer}
            placeholder={t('placeholder')}
            submitLabel={t('post')}
          />
        </div>
      ) : (
        <p className="mt-7 rounded-card border border-line bg-surface px-4 py-4 text-body text-muted">
          <Link href={loginHref} className="font-semibold text-ink underline underline-offset-2">
            {t('signInToComment')}
          </Link>
        </p>
      )}

      {thread.comments.length > 0 ? (
        <ol className="mt-10 space-y-8">
          {thread.comments.map((comment) => (
            <li key={comment.id}>
              <CommentNode
                comment={comment}
                photographId={photographId}
                photographTitle={photographTitle}
                viewer={viewer}
                isOwner={isOwner}
                isModerator={isModerator}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-10 text-body text-muted">{t('empty')}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* One comment, and its replies                                             */
/* ------------------------------------------------------------------------ */

function CommentNode({
  comment,
  photographId,
  photographTitle,
  viewer,
  isOwner,
  isModerator,
  isReply = false,
}: {
  comment: PhotographComment;
  photographId: string;
  photographTitle: string;
  viewer: ThreadViewer | null;
  isOwner: boolean;
  isModerator: boolean;
  isReply?: boolean;
}) {
  const t = useTranslations('comments');
  const locale = useLocale();
  const intlLocale = INTL_LOCALES[isLocale(locale) ? locale : DEFAULT_LOCALE];
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hideReason, setHideReason] = useState('');

  const isMine = viewer !== null && viewer.id === comment.author.id;
  const isLive = !comment.isDeleted && !comment.isHidden;

  const canEdit = isMine && isLive;
  const canDelete = (isMine || isOwner || isModerator) && !comment.isDeleted;
  const canHide = (isOwner || isModerator) && isLive;
  // The mirror of the database's rule: a moderator restores anything, the
  // photographer only what they hid themselves.
  const canUnhide =
    comment.isHidden &&
    !comment.isDeleted &&
    (isModerator || (isOwner && viewer !== null && comment.hiddenById === viewer.id));
  const canReport = viewer !== null && !isMine && isLive;
  const canReply = viewer !== null && !isReply && isLive;

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (result.message) toast.show(result.message, 'success');
          setEditing(false);
          setReplying(false);
          setConfirmingDelete(false);
          setHiding(false);
          setHideReason('');
          router.refresh();
        } else {
          toast.show(result.error ?? t('actions.commentFailed'), 'danger');
        }
      } catch {
        toast.show(t('actions.commentFailed'), 'danger');
      }
    });
  }

  return (
    <article className={cn('flex gap-3', isReply && 'ml-6 sm:ml-11')}>
      <Avatar src={comment.author.avatarUrl} name={comment.author.displayName} size={isReply ? 32 : 40} decorative />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={`/photographers/${comment.author.username}`}
            className="text-body font-semibold text-ink transition-colors duration-150 hover:text-accent-strong"
          >
            {comment.author.displayName}
          </Link>
          <span className="text-caption text-muted">
            {formatRelative(comment.createdAt, new Date(), intlLocale)}
          </span>
          {comment.editedAt && !comment.isDeleted ? (
            <span className="text-caption text-muted">· {t('edited')}</span>
          ) : null}
        </div>

        {comment.isDeleted ? (
          <p className="mt-1 text-body italic text-muted">{t('deleted')}</p>
        ) : comment.isHidden ? (
          <div className="mt-1">
            <p className="text-body italic text-muted">{t('hidden')}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-body text-ink-soft">
              {comment.body}
            </p>
            {comment.hiddenReason ? (
              <p className="mt-1 text-caption text-muted">{comment.hiddenReason}</p>
            ) : null}
            {canUnhide ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unhideComment(comment.id))}
                className="mt-2 text-caption font-semibold text-ink-soft transition-colors duration-150 hover:text-ink disabled:opacity-60"
              >
                {t('unhide')}
              </button>
            ) : null}
          </div>
        ) : editing ? (
          <div className="mt-2">
            <CommentForm
              mode="edit"
              commentId={comment.id}
              initialBody={comment.body}
              viewer={viewer}
              placeholder={t('placeholder')}
              submitLabel={t('save')}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <TranslationBlock
            className="mt-1"
            locale={locale}
            available={anyTranslation(locale, comment.translations.body)}
          >
            <Translated
              as="p"
              className="whitespace-pre-wrap break-words text-body leading-relaxed text-ink"
              original={comment.body}
              translation={comment.translations.body}
            />
          </TranslationBlock>
        )}

        {/* Controls. Hidden while an inline form for this comment is open. */}
        {!editing && !comment.isDeleted ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption font-semibold text-muted">
            {canReply ? (
              <button
                type="button"
                onClick={() => setReplying((open) => !open)}
                className="transition-colors duration-150 hover:text-ink"
              >
                {t('reply')}
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="transition-colors duration-150 hover:text-ink"
              >
                {t('edit')}
              </button>
            ) : null}
            {canHide ? (
              <button
                type="button"
                onClick={() => setHiding((open) => !open)}
                className="transition-colors duration-150 hover:text-ink"
              >
                {t('hide')}
              </button>
            ) : null}
            {canDelete ? (
              confirmingDelete ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteComment(comment.id))}
                    className="text-danger transition-colors duration-150 hover:text-danger disabled:opacity-60"
                  >
                    {t('confirmDelete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="transition-colors duration-150 hover:text-ink"
                  >
                    {t('cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="transition-colors duration-150 hover:text-danger"
                >
                  {t('delete')}
                </button>
              )
            ) : null}
            {canReport ? (
              <ReportDialog
                subjectType="comment"
                subjectId={comment.id}
                subjectLabel={t('reportSubject', {
                  name: comment.author.displayName,
                  title: photographTitle,
                })}
                triggerLabel={t('report')}
                triggerVariant="ghost"
              />
            ) : null}
          </div>
        ) : null}

        {/* The owner's or a moderator's reason for hiding this comment. */}
        {hiding ? (
          <div className="mt-3 rounded-card border border-line bg-surface-sunken p-3">
            <TextAreaField
              label={t('hideReason')}
              value={hideReason}
              maxLength={500}
              rows={2}
              onChange={(event) => setHideReason(event.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="danger"
                loading={pending}
                onClick={() => run(() => hideComment({ commentId: comment.id, reason: hideReason }))}
              >
                {t('hide')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHiding(false)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        {/* An inline reply box. */}
        {replying ? (
          <div className="mt-3">
            <CommentForm
              mode="new"
              photographId={photographId}
              parentId={comment.id}
              viewer={viewer}
              placeholder={t('replyPlaceholder', { name: comment.author.displayName })}
              submitLabel={t('post')}
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : null}

        {comment.replies.length > 0 ? (
          <ol className="mt-5 space-y-6">
            {comment.replies.map((reply) => (
              <li key={reply.id}>
                <CommentNode
                  comment={reply}
                  photographId={photographId}
                  photographTitle={photographTitle}
                  viewer={viewer}
                  isOwner={isOwner}
                  isModerator={isModerator}
                  isReply
                />
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* The one textarea form, for a new comment, a reply, or an edit             */
/* ------------------------------------------------------------------------ */

type FormMode =
  | { mode: 'new'; photographId: string; parentId: string | null; commentId?: never; initialBody?: never }
  | { mode: 'edit'; commentId: string; initialBody: string; photographId?: never; parentId?: never };

function CommentForm({
  viewer,
  placeholder,
  submitLabel,
  onCancel,
  ...mode
}: FormMode & {
  viewer: ThreadViewer | null;
  placeholder: string;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const t = useTranslations('comments');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(mode.mode === 'edit' ? mode.initialBody : '');

  const trimmed = body.trim();
  const tooLong = body.length > COMMENT_POLICY.maxLength;
  const canSubmit = trimmed.length > 0 && !tooLong && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const result =
          mode.mode === 'edit'
            ? await editComment({ commentId: mode.commentId, body: trimmed })
            : await postComment({
                photographId: mode.photographId,
                parentId: mode.parentId,
                body: trimmed,
              });
        if (result.ok) {
          if (result.message) toast.show(result.message, 'success');
          if (mode.mode === 'new') setBody('');
          onCancel?.();
          router.refresh();
        } else {
          toast.show(result.error, 'danger');
        }
      } catch {
        toast.show(t('actions.commentFailed'), 'danger');
      }
    });
  }

  return (
    <div className="flex gap-3">
      {viewer ? (
        <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={40} decorative className="mt-0.5" />
      ) : null}
      <div className="min-w-0 flex-1">
        <TextAreaField
          label={placeholder}
          hideLabel
          placeholder={placeholder}
          value={body}
          rows={mode.mode === 'new' && mode.parentId === null ? 3 : 2}
          maxLength={COMMENT_POLICY.maxLength + 200}
          onChange={(event) => setBody(event.target.value)}
          error={tooLong ? t('limit', { max: COMMENT_POLICY.maxLength }) : null}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" loading={pending} disabled={!canSubmit} onClick={submit}>
            {pending ? t('posting') : submitLabel}
          </Button>
          {onCancel ? (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t('cancel')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
