import { z } from 'zod';

import { COMMENT_MAX_LENGTH } from '@/types/domain';

import { requiredText } from './fields';

/**
 * A comment, and a reply to one.
 *
 * The body is the only thing a member types. Everything else — which
 * photograph, which parent — is an id the page already holds, validated as a
 * UUID so a malformed reference is turned away before it reaches a query. The
 * length here matches the `photograph_comments_body_length` check in migration
 * 0022; the database is the one that actually enforces it, and this is the
 * courtesy that saves a round trip.
 */

const body = requiredText({ label: 'Comment', max: COMMENT_MAX_LENGTH });

export const postCommentSchema = z.object({
  photographId: z.uuid('A photograph id must be a UUID.'),
  /** Null for a top-level comment; the parent comment's id for a reply. */
  parentId: z.uuid('A comment id must be a UUID.').nullable(),
  body,
});

export const editCommentSchema = z.object({
  commentId: z.uuid('A comment id must be a UUID.'),
  body,
});

export const commentIdSchema = z.uuid('A comment id must be a UUID.');

export type PostCommentInput = z.infer<typeof postCommentSchema>;
export type EditCommentInput = z.infer<typeof editCommentSchema>;
