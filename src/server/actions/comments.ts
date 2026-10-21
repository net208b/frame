'use server';

import {
  fail,
  failFromZod,
  ok,
  NOT_CONFIGURED_MESSAGE,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer, getViewerSuspension } from '@/lib/auth';
import { COMMENT_POLICY, isDemoMode } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import {
  commentIdSchema,
  editCommentSchema,
  postCommentSchema,
} from '@/lib/validation/comment';

/**
 * Comments.
 *
 * Everything these actions do is also guaranteed by the database — migration
 * 0022 is the real boundary, and a member writing their own rows with the
 * public key cannot get past it. The work here is the courtesy layer: a signed
 * reason to refuse before the write, a rate limit keyed on the account, and a
 * revalidation of the pages the comment appears on. When the database refuses
 * anyway, its error code is turned into a sentence rather than shown raw.
 *
 * The thread itself is read by the page, through `photographThread`, under the
 * viewer's own row-level security — so a hidden comment never even reaches a
 * reader who is not its author, the photograph's owner or a moderator. None of
 * that is re-decided here.
 */

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Postgres error codes the database raises for a refused comment. */
const RLS_OR_RULE = new Set(['42501', '23514', 'P0002']);

/**
 * The slug of the photograph a comment belongs to, for revalidation. Looked up
 * rather than trusted from the client: the revalidated path has to be the real
 * one, and the id is the only thing the caller supplied.
 */
async function slugForPhotograph(
  supabase: SupabaseClient,
  photographId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('photographs')
    .select('slug')
    .eq('id', photographId)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

async function slugForComment(
  supabase: SupabaseClient,
  commentId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('photograph_comments')
    .select('photographs!photograph_id(slug)')
    .eq('id', commentId)
    .maybeSingle();
  const photograph = data?.photographs as { slug?: string } | { slug?: string }[] | null;
  const row = Array.isArray(photograph) ? photograph.at(0) : photograph;
  return row?.slug ?? null;
}

function revalidate(slug: string | null): void {
  if (slug) revalidateLocalisedPath(`/photographs/${slug}`);
}

/**
 * Post a comment, or a reply to one.
 *
 * The insert runs under the viewer's own privileges, so the insert policy, the
 * reply-rules trigger and the published-photograph check all apply to it.
 */
export async function postComment(input: {
  photographId: string;
  parentId: string | null;
  body: string;
}): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in to join the conversation.', 'unauthenticated');

  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    return fail('Your account cannot post comments at the moment.', 'forbidden');
  }

  const bucket = `comment:${viewer.id}`;
  const perMinute = await checkRateLimit(bucket, COMMENT_POLICY.maxPerMinute, 60);
  if (!perMinute.allowed) {
    return fail(
      `That is a lot of comments at once. Try again in ${perMinute.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }
  const perHour = await checkRateLimit(bucket, COMMENT_POLICY.maxPerHour, 3600);
  if (!perHour.allowed) {
    return fail(
      `You have reached the hourly comment limit. Try again in ${perHour.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }

  const parsed = postCommentSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from('photograph_comments').insert({
    photograph_id: parsed.data.photographId,
    author_id: viewer.id,
    parent_id: parsed.data.parentId,
    body: parsed.data.body,
  });

  if (error) {
    if (RLS_OR_RULE.has(error.code ?? '')) {
      return fail('Comments are for published photographs.', 'forbidden');
    }
    return fail('Your comment could not be saved. Try again in a moment.', 'unknown');
  }

  revalidate(await slugForPhotograph(supabase, parsed.data.photographId));
  return ok(undefined, 'Comment posted.');
}

/**
 * Edit one's own comment. The update policy pins the author and every column
 * but the body, so this cannot be turned into a way to move or un-hide a row.
 */
export async function editComment(input: {
  commentId: string;
  body: string;
}): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in to edit your comment.', 'unauthenticated');

  const bucket = `comment:${viewer.id}`;
  const perMinute = await checkRateLimit(bucket, COMMENT_POLICY.maxPerMinute, 60);
  if (!perMinute.allowed) {
    return fail(
      `That is a lot of edits at once. Try again in ${perMinute.retryAfterSeconds} seconds.`,
      'rate_limited',
    );
  }

  const parsed = editCommentSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('photograph_comments')
    .update({ body: parsed.data.body })
    .eq('id', parsed.data.commentId)
    .eq('author_id', viewer.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return fail('That comment is not yours to change.', 'forbidden');
  }
  if (!data) {
    // No row matched: either it is not the viewer's, or it is deleted or
    // hidden, both of which the update policy excludes.
    return fail('That comment is not yours to change.', 'forbidden');
  }

  revalidate(await slugForComment(supabase, parsed.data.commentId));
  return ok(undefined, 'Comment saved.');
}

/**
 * Delete a comment. The `delete_comment` function clears the body and keeps the
 * row, and decides for itself that the caller is the author, the photograph's
 * owner or a moderator.
 */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in to delete your comment.', 'unauthenticated');

  const parsed = commentIdSchema.safeParse(commentId);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const slug = await slugForComment(supabase, parsed.data);
  const { error } = await supabase.rpc('delete_comment', { p_id: parsed.data });

  if (error) {
    if (RLS_OR_RULE.has(error.code ?? '')) {
      return fail('That comment is not yours to delete.', 'forbidden');
    }
    return fail('That comment could not be deleted. Try again in a moment.', 'unknown');
  }

  revalidate(slug);
  return ok(undefined, 'Comment deleted.');
}

/**
 * Hide a comment. The `hide_comment` function lets only the photograph's owner
 * or a moderator through, and records a moderator's hide in the audit trail.
 */
export async function hideComment(input: {
  commentId: string;
  reason: string | null;
}): Promise<ActionResult> {
  if (isDemoMode()) return fail(NOT_CONFIGURED_MESSAGE, 'not_configured');

  const viewer = await getViewer();
  if (!viewer) return fail('Sign in first.', 'unauthenticated');

  const parsed = commentIdSchema.safeParse(input.commentId);
  if (!parsed.success) return failFromZod(parsed.error);

  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;

  const supabase = await createClient();
  const slug = await slugForComment(supabase, parsed.data);
  const { error } = await supabase.rpc('hide_comment', { p_id: parsed.data, p_reason: reason });

  if (error) {
    if (RLS_OR_RULE.has(error.code ?? '')) {
      return fail('Only the photographer or a moderator can hide a comment.', 'forbidden');
    }
    return fail('That comment could not be hidden. Try again in a moment.', 'unknown');
  }

  revalidate(slug);
  return ok(undefined, 'Comment hidden.');
}
