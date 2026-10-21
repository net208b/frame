import { z } from 'zod';

import { isValidLatitude, isValidLongitude } from '@/lib/geo';

import { countryCode, optionalText, requiredText } from './fields';

/**
 * Location submission schema.
 *
 * This schema decides whether a submission is *readable*, not whether it is
 * true. Nothing here can establish that a place exists, that it is accessible,
 * or that the photograph was taken there, so the automated checks in
 * `lib/geo.ts` produce signals for a moderator and approval stays a human
 * decision.
 *
 * Coordinates reach this schema because a member put them here. When they were
 * read from EXIF, the upload wizard asked first: GPS found in a file is never
 * submitted on the member's behalf.
 */

/**
 * One message covers a missing coordinate and an unreadable one, because after
 * coercion the two are the same failure and a member fixes them the same way.
 */
const LATITUDE_MESSAGE = 'Latitude must be a number between -90 and 90.';
const LONGITUDE_MESSAGE = 'Longitude must be a number between -180 and 180.';

export const latitudeSchema = z.coerce
  .number({ error: LATITUDE_MESSAGE })
  .refine(isValidLatitude, { error: LATITUDE_MESSAGE });

export const longitudeSchema = z.coerce
  .number({ error: LONGITUDE_MESSAGE })
  .refine(isValidLongitude, { error: LONGITUDE_MESSAGE });

export const locationSubmissionSchema = z.object({
  proposedName: requiredText({ label: 'Location name', min: 2, max: 120 }),
  city: requiredText({ label: 'City', max: 80 }),
  country: requiredText({ label: 'Country', max: 80 }),
  countryCode: countryCode(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  /** Context for the moderator: access, opening hours, anything they should know. */
  note: optionalText({ label: 'Note for the moderator', max: 600 }),
  /**
   * The photograph this proposal came with (0034). Approval credits it to the
   * new place; the database refuses a photograph that is not the proposer's.
   */
  photographId: z.uuid('A photograph id must be a UUID.').optional(),
});

export type LocationSubmissionInput = z.infer<typeof locationSubmissionSchema>;
