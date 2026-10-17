'use server';

import { z } from 'zod';

import {
  fail,
  failFromZod,
  NOT_CONFIGURED_MESSAGE,
  ok,
  type ActionResult,
} from '@/lib/action-result';
import { getViewer, getViewerSuspension, type Viewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getCollections } from '@/lib/data/repository';
import { checkRateLimit } from '@/lib/rate-limit';
import { revalidateLocalisedPath } from '@/lib/revalidate';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';
import {
  collectionIdSchema,
  collectionItemSchema,
  collectionSchema,
} from '@/lib/validation/collection';
import { optionalIdentifier } from '@/lib/validation/fields';
import type { CollectionVisibility } from '@/types/domain';

/**
 * Collections: a member's own grouping of photographs and places.
 *
 * Every action in this module runs the same gauntlet — capability, identity,
 * suspension, rate limit, validation, ownership, write — and returns an
 * `ActionResult` rather than throwing, because every one of those refusals is
 * an expected outcome rather than a bug.
 *
 * Two things are load-bearing and easy to get wrong:
 *
 * - Ownership is read from the database on every call. A hidden button is a
 *   courtesy; `owner_id` plus the row-level security policies in migration
 *   0007 are the permission check, and the write is filtered on `owner_id` a
 *   second time so a policy regression cannot turn into someone else's data
 *   being edited.
 * - Nothing reports a success it did not make. A write that matches no row
 *   comes back as a refusal, and an unreadable reply says so plainly instead
 *   of inventing the value the caller wanted.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Postgres unique violation. On `collections` that can only be the slug. */
const UNIQUE_VIOLATION = '23505';

/* ------------------------------------------------------------------------ */
/* Guards                                                                    */
/* ------------------------------------------------------------------------ */

type Authorised = { ok: true; viewer: Viewer } | { ok: false; result: ActionResult<never> };

/**
 * Capability, identity and suspension, in that order.
 *
 * `getViewer()` deliberately still returns a suspended member so the pages
 * they can reach can explain the suspension, which is why the suspension is
 * checked separately here before anything is written.
 */
async function authorise(): Promise<Authorised> {
  if (isDemoMode()) {
    return { ok: false, result: fail(NOT_CONFIGURED_MESSAGE, 'not_configured') };
  }

  const viewer = await getViewer();
  if (!viewer) {
    return {
      ok: false,
      result: fail('Sign in to keep collections of your own.', 'unauthenticated'),
    };
  }

  const suspension = await getViewerSuspension();
  if (suspension?.isSuspended) {
    return {
      ok: false,
      result: fail(
        suspension.reason
          ? `This account is suspended, so its collections cannot be changed. Reason recorded: ${suspension.reason}`
          : 'This account is suspended, so its collections cannot be changed.',
        'forbidden',
      ),
    };
  }

  return { ok: true, viewer };
}

interface LimitWindow {
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Limits per account, never per address: one carrier NAT is shared by a city.
 *
 * Renaming and deleting are rarer than saving, so the two families have their
 * own allowances. Each window carries its own bucket name because the database
 * limiter records one hit per allowed call keyed on the bucket alone — reusing
 * one name across two windows would charge every call twice.
 */
const LIMITS: Record<'record' | 'item' | 'read', readonly LimitWindow[]> = {
  record: [
    { name: 'record-minute', limit: 10, windowSeconds: 60 },
    { name: 'record-hour', limit: 40, windowSeconds: 3600 },
  ],
  item: [
    { name: 'item-minute', limit: 40, windowSeconds: 60 },
    { name: 'item-hour', limit: 400, windowSeconds: 3600 },
  ],
  read: [{ name: 'read-minute', limit: 120, windowSeconds: 60 }],
};

async function limit(
  scope: keyof typeof LIMITS,
  viewerId: string,
): Promise<ActionResult<never> | null> {
  for (const window of LIMITS[scope]) {
    const verdict = await checkRateLimit(
      `collections:${window.name}:${viewerId}`,
      window.limit,
      window.windowSeconds,
    );
    if (!verdict.allowed) {
      return fail(
        `That is a lot of collection activity in a short time. Try again in ${verdict.retryAfterSeconds} seconds.`,
        'rate_limited',
      );
    }
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Row readers                                                               */
/* ------------------------------------------------------------------------ */

const collectionRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  owner_id: z.string().min(1),
  item_count: z.number().int().nonnegative().nullish(),
});

const writtenRowSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
});

const itemRowSchema = z.object({ id: z.string().min(1) });

interface OwnedCollection {
  id: string;
  slug: string;
  title: string;
  itemCount: number;
}

type Ownership =
  | { ok: true; collection: OwnedCollection }
  | { ok: false; result: ActionResult<never> };

/**
 * Confirm the signed-in member owns the collection they are about to change.
 *
 * Someone else's *private* collection is filtered out by row-level security, so
 * it arrives here indistinguishable from one that was never created — and
 * "not found" is the right answer, because confirming its existence is not
 * ours to do.
 */
async function ownedCollection(
  supabase: Supabase,
  collectionId: string,
  viewerId: string,
): Promise<Ownership> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, slug, title, owner_id, item_count')
    .eq('id', collectionId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      result: fail('That collection could not be read. Try again in a moment.', 'unknown'),
    };
  }
  if (!data) {
    return { ok: false, result: fail('That collection could not be found.', 'not_found') };
  }

  const row = collectionRowSchema.safeParse(data);
  if (!row.success) {
    return {
      ok: false,
      result: fail('That collection could not be read, so nothing was changed.', 'unknown'),
    };
  }
  if (row.data.owner_id !== viewerId) {
    return {
      ok: false,
      result: fail('That collection belongs to someone else, so it cannot be changed.', 'forbidden'),
    };
  }

  return {
    ok: true,
    collection: {
      id: row.data.id,
      slug: row.data.slug,
      title: row.data.title,
      itemCount: row.data.item_count ?? 0,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Addresses                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * How many addresses to try before giving up.
 *
 * `collections.slug` is unique across the whole table, not per owner, and
 * another member's private collection may hold the address this member's title
 * produces — invisible to any query we are allowed to run. So the clash is
 * caught as the constraint violation it is and retried with a suffix, which
 * also makes the uniqueness the database's job rather than a racy pre-check.
 */
const SLUG_ATTEMPTS = 4;

/** Four random base-36 characters: the alphabet the SQL slug check allows. */
function slugSuffix(): string {
  const generated = Math.random().toString(36).slice(2, 6).replace(/[^a-z0-9]/g, '');
  return generated.length > 0 ? generated : 'x1';
}

function addressAttempt(base: string, attempt: number): string {
  if (attempt === 0) return base;
  // slugify() re-applies the charset and the length ceiling, so a long title
  // plus a suffix cannot produce an address the database will reject.
  return slugify(`${base.slice(0, 60)}-${slugSuffix()}`);
}

/* ------------------------------------------------------------------------ */
/* Create                                                                    */
/* ------------------------------------------------------------------------ */

export async function createCollection(
  input: unknown,
): Promise<ActionResult<{ collectionId: string; slug: string }>> {
  const authorised = await authorise();
  if (!authorised.ok) return authorised.result;
  const { viewer } = authorised;

  const limited = await limit('record', viewer.id);
  if (limited) return limited;

  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const { title, description, visibility, slug } = parsed.data;

  const supabase = await createClient();

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from('collections')
      .insert({
        owner_id: viewer.id,
        slug: addressAttempt(slug, attempt),
        title,
        description,
        visibility,
      })
      .select('id, slug')
      .maybeSingle();

    if (error) {
      if (error.code !== UNIQUE_VIOLATION) {
        return fail('That collection could not be created. Try again in a moment.', 'unknown');
      }
      continue;
    }

    const row = writtenRowSchema.safeParse(data);
    if (!row.success) {
      // The insert went through; only the reply is unreadable. Say so rather
      // than returning an address the caller would navigate to blindly.
      revalidateCollection(viewer.username);
      return fail(
        'The collection was created, but its address could not be read back. Reload the collections page to open it.',
        'unknown',
      );
    }

    revalidateCollection(viewer.username, row.data.slug);
    return ok(
      { collectionId: row.data.id, slug: row.data.slug },
      `“${title}” is ready for its first entry.`,
    );
  }

  return fail(
    'That title keeps producing an address that is already taken. Try a slightly different title.',
    'conflict',
  );
}

/* ------------------------------------------------------------------------ */
/* Update                                                                    */
/* ------------------------------------------------------------------------ */

export async function updateCollection(
  input: unknown,
): Promise<ActionResult<{ collectionId: string; slug: string }>> {
  const authorised = await authorise();
  if (!authorised.ok) return authorised.result;
  const { viewer } = authorised;

  const limited = await limit('record', viewer.id);
  if (limited) return limited;

  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const { collectionId, title, description, visibility, slug } = parsed.data;

  if (!collectionId) {
    return fail('The form did not say which collection to change.', 'validation', {
      _form: 'The form did not say which collection to change. Reload the page and try again.',
    });
  }

  const supabase = await createClient();
  const owned = await ownedCollection(supabase, collectionId, viewer.id);
  if (!owned.ok) return owned.result;
  const previousSlug = owned.collection.slug;

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    // Keeping the existing address is not a clash with itself: Postgres allows
    // an update that leaves a unique column at the value it already holds.
    const address = addressAttempt(slug, attempt);

    const { data, error } = await supabase
      .from('collections')
      .update({ slug: address, title, description, visibility })
      .eq('id', collectionId)
      // Second gate: row-level security already restricts this, and the filter
      // means a policy regression cannot widen it to someone else's row.
      .eq('owner_id', viewer.id)
      .select('id, slug')
      .maybeSingle();

    if (error) {
      if (error.code !== UNIQUE_VIOLATION) {
        return fail('That collection could not be updated. Try again in a moment.', 'unknown');
      }
      continue;
    }

    const row = writtenRowSchema.safeParse(data);
    if (!row.success) {
      // No row came back, so nothing was written — the database refused the
      // update even though the ownership read allowed it.
      return fail(
        'That collection could not be updated, so nothing was changed. Reload the page and try again.',
        'forbidden',
      );
    }

    revalidateCollection(viewer.username, previousSlug, row.data.slug);

    return ok(
      { collectionId: row.data.id, slug: row.data.slug },
      row.data.slug === previousSlug
        ? `“${title}” is updated.`
        : `“${title}” is updated, and its address is now /collections/${row.data.slug}.`,
    );
  }

  return fail(
    'That title keeps producing an address that is already taken. Try a slightly different title or address.',
    'conflict',
  );
}

/* ------------------------------------------------------------------------ */
/* Delete                                                                    */
/* ------------------------------------------------------------------------ */

export async function deleteCollection(
  input: unknown,
): Promise<ActionResult<{ collectionId: string }>> {
  const authorised = await authorise();
  if (!authorised.ok) return authorised.result;
  const { viewer } = authorised;

  const limited = await limit('record', viewer.id);
  if (limited) return limited;

  const parsed = collectionIdSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const owned = await ownedCollection(supabase, parsed.data.collectionId, viewer.id);
  if (!owned.ok) return owned.result;

  // Only the grouping goes. `collection_items` cascades from this row and
  // nothing in it references a photograph or a place by anything other than its
  // id, so the photographs and the places themselves are untouched.
  const { data, error } = await supabase
    .from('collections')
    .delete()
    .eq('id', owned.collection.id)
    .eq('owner_id', viewer.id)
    .select('id');

  if (error) {
    return fail('That collection could not be deleted. Try again in a moment.', 'unknown');
  }
  if (!Array.isArray(data) || data.length === 0) {
    return fail(
      'That collection could not be deleted, so it is still there. Reload the page and try again.',
      'forbidden',
    );
  }

  revalidateCollection(viewer.username, owned.collection.slug);

  return ok(
    { collectionId: owned.collection.id },
    `“${owned.collection.title}” is deleted. The photographs and places it held are unaffected.`,
  );
}

/* ------------------------------------------------------------------------ */
/* Items                                                                     */
/* ------------------------------------------------------------------------ */

const subjectRowSchema = z.object({
  id: z.string().min(1),
  status: z.string().nullish(),
});

/**
 * The one thing an entry points at.
 *
 * The schema already guarantees exactly one of the two ids is present; this
 * turns that guarantee into a value the query builders can use without
 * re-deciding which column to filter on in four places.
 */
interface Subject {
  kind: 'photograph' | 'location';
  column: 'photograph_id' | 'location_id';
  table: 'photographs' | 'locations';
  /** The status a subject must have before it is worth saving. */
  requiredStatus: 'published' | 'approved';
  id: string;
}

function resolveSubject(input: {
  photographId: string | null;
  locationId: string | null;
}): Subject | null {
  if (input.photographId) {
    return {
      kind: 'photograph',
      column: 'photograph_id',
      table: 'photographs',
      requiredStatus: 'published',
      id: input.photographId,
    };
  }
  if (input.locationId) {
    return {
      kind: 'location',
      column: 'location_id',
      table: 'locations',
      requiredStatus: 'approved',
      id: input.locationId,
    };
  }
  return null;
}

/**
 * Refuse a subject that would never appear in the collection.
 *
 * The repository leaves an unpublished photograph or an unapproved place out of
 * a collection page rather than rendering an empty card, so saving one would
 * report a success the member could never see. Row-level security decides what
 * is readable at all; this decides what is worth saving.
 */
async function subjectRefusal(
  supabase: Supabase,
  subject: Subject,
): Promise<ActionResult<never> | null> {
  const { data, error } = await supabase
    .from(subject.table)
    .select('id, status')
    .eq('id', subject.id)
    .maybeSingle();

  if (error) {
    return fail('That could not be checked just now. Try again in a moment.', 'unknown');
  }

  const row = subjectRowSchema.safeParse(data);
  if (!row.success) {
    return fail(
      subject.kind === 'photograph'
        ? 'That photograph could not be found.'
        : 'That place could not be found.',
      'not_found',
    );
  }

  if (row.data.status !== subject.requiredStatus) {
    return fail(
      subject.kind === 'photograph'
        ? 'Only a published photograph can be saved to a collection.'
        : 'Only an approved place can be saved to a collection.',
      'conflict',
    );
  }

  return null;
}

export async function addToCollection(
  input: unknown,
): Promise<ActionResult<{ itemId: string | null; alreadyPresent: boolean }>> {
  const authorised = await authorise();
  if (!authorised.ok) return authorised.result;
  const { viewer } = authorised;

  const limited = await limit('item', viewer.id);
  if (limited) return limited;

  const parsed = collectionItemSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const { collectionId, photographId, locationId, note } = parsed.data;

  const subject = resolveSubject({ photographId, locationId });
  if (!subject) return fail('Nothing was chosen to save.', 'validation');

  const supabase = await createClient();
  const owned = await ownedCollection(supabase, collectionId, viewer.id);
  if (!owned.ok) return owned.result;

  const refusal = await subjectRefusal(supabase, subject);
  if (refusal) return refusal;

  const { data, error } = await supabase
    .from('collection_items')
    .insert({
      collection_id: collectionId,
      photograph_id: photographId,
      location_id: locationId,
      note,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // UNIQUE(collection_id, photograph_id) and UNIQUE(collection_id,
    // location_id) are what actually keep an entry from being added twice, and
    // hitting one means the state the member asked for is already true.
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await existingItemId(supabase, collectionId, subject);
      revalidateCollection(viewer.username, owned.collection.slug);
      return ok(
        { itemId: existing, alreadyPresent: true },
        `Already saved in “${owned.collection.title}”.`,
      );
    }
    return fail('That could not be saved. Try again in a moment.', 'unknown');
  }

  const row = itemRowSchema.safeParse(data);
  revalidateCollection(viewer.username, owned.collection.slug);

  return ok(
    { itemId: row.success ? row.data.id : null, alreadyPresent: false },
    `Saved to “${owned.collection.title}”.`,
  );
}

export async function removeFromCollection(
  input: unknown,
): Promise<ActionResult<{ removed: boolean }>> {
  const authorised = await authorise();
  if (!authorised.ok) return authorised.result;
  const { viewer } = authorised;

  const limited = await limit('item', viewer.id);
  if (limited) return limited;

  const parsed = collectionItemSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const { collectionId, photographId, locationId } = parsed.data;

  const subject = resolveSubject({ photographId, locationId });
  if (!subject) return fail('Nothing was chosen to remove.', 'validation');

  const supabase = await createClient();
  const owned = await ownedCollection(supabase, collectionId, viewer.id);
  if (!owned.ok) return owned.result;

  const { data, error } = await supabase
    .from('collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq(subject.column, subject.id)
    .select('id');

  if (error) {
    return fail('That could not be removed. Try again in a moment.', 'unknown');
  }

  revalidateCollection(viewer.username, owned.collection.slug);
  const removed = Array.isArray(data) && data.length > 0;

  return removed
    ? ok({ removed: true }, `Removed from “${owned.collection.title}”.`)
    : ok(
        { removed: false },
        `That entry was no longer in “${owned.collection.title}”, so nothing was removed.`,
      );
}

/** Best-effort read of the id of an entry that was already there. */
async function existingItemId(
  supabase: Supabase,
  collectionId: string,
  subject: Subject,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('collection_items')
    .select('id')
    .eq('collection_id', collectionId)
    .eq(subject.column, subject.id)
    .maybeSingle();

  if (error) return null;

  const row = itemRowSchema.safeParse(data);
  return row.success ? row.data.id : null;
}

/**
 * Every surface that renders a collection or its size.
 *
 * Three of them, and the third is easy to forget: the owner's profile lists
 * their public collections with an entry count each, so it goes stale when a
 * collection is created, renamed, deleted, or has an entry added or removed.
 * The photograph and the place themselves are not affected — nothing
 * server-rendered on either page depends on who has saved it.
 */
function revalidateCollection(username: string, ...slugs: string[]): void {
  revalidateLocalisedPath('/collections');
  revalidateLocalisedPath(`/photographers/${username}`);
  for (const slug of new Set(slugs)) {
    if (slug.length > 0) revalidateLocalisedPath(`/collections/${slug}`);
  }
}

/* ------------------------------------------------------------------------ */
/* Save targets                                                              */
/* ------------------------------------------------------------------------ */

/** One row in the save dialog: a collection, and whether it already holds this. */
export interface CollectionSaveTarget {
  id: string;
  slug: string;
  title: string;
  visibility: CollectionVisibility;
  itemCount: number;
  contains: boolean;
}

const saveTargetSubjectSchema = z
  .object({
    photographId: optionalIdentifier('Photograph'),
    locationId: optionalIdentifier('Location'),
  })
  .refine((value) => value.photographId !== null || value.locationId !== null, {
    error: 'Choose the photograph or the place to look for.',
    path: ['photographId'],
  })
  .refine((value) => value.photographId === null || value.locationId === null, {
    error: 'Look for a photograph or a place, not both.',
    path: ['photographId'],
  });

const membershipRowSchema = z.object({ collection_id: z.string().min(1) });

/**
 * The viewer's own collections, with the ones already holding this subject
 * marked.
 *
 * This read lives beside the writes because the control that needs it is a
 * client component whose props are fixed by the shared contract: it cannot be
 * handed private collections by a server parent, and a member's private
 * collections must never travel through a public route. The list itself comes
 * from the repository, which is the only read API the UI may use; only the
 * membership flags, which the repository does not expose, are queried here.
 */
export async function listSaveTargets(
  input: unknown,
): Promise<ActionResult<CollectionSaveTarget[]>> {
  const authorised = await authorise();
  if (!authorised.ok) return authorised.result;
  const { viewer } = authorised;

  const limited = await limit('read', viewer.id);
  if (limited) return limited;

  const parsed = saveTargetSubjectSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const subject = resolveSubject(parsed.data);
  if (!subject) return fail('Nothing was chosen to look for.', 'validation');

  const mine = await getCollections({ ownerId: viewer.id, includePrivate: true });
  if (mine.length === 0) return ok([]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('collection_items')
    .select('collection_id')
    .eq(subject.column, subject.id)
    .in(
      'collection_id',
      mine.map((collection) => collection.id),
    );

  if (error) {
    // Returning the list with every box unticked would misreport what is
    // already saved, which is worse than saying the read failed.
    return fail('Your collections could not be read just now. Try again in a moment.', 'unknown');
  }

  const holding = new Set<string>();
  for (const row of Array.isArray(data) ? data : []) {
    const parsedRow = membershipRowSchema.safeParse(row);
    if (parsedRow.success) holding.add(parsedRow.data.collection_id);
  }

  return ok(
    mine.map((collection) => ({
      id: collection.id,
      slug: collection.slug,
      title: collection.title,
      visibility: collection.visibility,
      itemCount: collection.itemCount,
      contains: holding.has(collection.id),
    })),
  );
}
