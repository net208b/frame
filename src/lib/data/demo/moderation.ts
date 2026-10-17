import { evaluateLocationSubmission } from '@/lib/geo';
import type {
  LocationSubmission,
  ModerationAction,
  PhotographerSummary,
  Report,
  SuspiciousUpload,
} from '@/types/domain';

import { DEMO_LOCATIONS } from './locations';
import { DEMO_MODERATOR, DEMO_PHOTOGRAPHERS } from './photographers';
import { DEMO_PHOTOGRAPHS } from './photographs';

/**
 * Demo moderation queues.
 *
 * The automated signals attached to each item are produced by the same
 * functions the real pipeline uses, so what a moderator sees here is what they
 * would see in production — including the cases where the checks disagree with
 * each other and a human has to decide.
 */

const [kenji, anna, marco, maya, pim, elliot] = DEMO_PHOTOGRAPHERS;

function summarise(id: string): PhotographerSummary {
  const person = DEMO_PHOTOGRAPHERS.find((item) => item.id === id);
  if (!person) throw new Error(`Demo data error: unknown person "${id}"`);
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
    basedIn: person.basedIn,
  };
}

/** Existing approved places, used by the duplicate check below. */
const existingNearby = DEMO_LOCATIONS.filter((item) => item.coordinates).map((item) => ({
  id: item.id,
  label: `${item.name}, ${item.city}`,
  latitude: item.coordinates!.latitude,
  longitude: item.coordinates!.longitude,
}));

/* ------------------------------------------------------------------------ */
/* Pending location submissions                                              */
/* ------------------------------------------------------------------------ */

interface RawSubmission {
  id: string;
  proposedName: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  note: string | null;
  submittedById: string;
  createdAt: string;
  status?: LocationSubmission['status'];
  rejectionReason?: string | null;
}

const RAW_SUBMISSIONS: RawSubmission[] = [
  {
    id: 'e5a9c400-0000-4000-8000-000000000001',
    proposedName: 'Shinjuku backstreet, east end',
    city: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    // Deliberately ~60 m from an approved location, so the duplicate check fires.
    latitude: 35.694366,
    longitude: 139.699934,
    note: 'Same block as the existing entry but the far end, which has completely different signage.',
    submittedById: kenji!.id,
    createdAt: '2026-10-15T13:20:00.000Z',
  },
  {
    id: 'e5a9c400-0000-4000-8000-000000000002',
    proposedName: 'Harbour steps at dawn',
    city: 'Porto',
    country: 'Portugal',
    countryCode: 'PT',
    latitude: 41.140833,
    longitude: -8.611111,
    note: 'Stone steps down to the river, good light from about 07:00. Public right of way.',
    submittedById: marco!.id,
    createdAt: '2026-10-14T06:05:00.000Z',
  },
  {
    id: 'e5a9c400-0000-4000-8000-000000000003',
    proposedName: 'Rooftop view over the old town',
    city: 'Lisbon',
    country: 'Portugal',
    countryCode: 'PT',
    // Coordinates fall in Spain, not Portugal — the country check should catch it.
    latitude: 40.416775,
    longitude: -3.70379,
    note: 'Best view in the city, you can get up there from the car park.',
    submittedById: pim!.id,
    createdAt: '2026-10-13T19:40:00.000Z',
  },
  {
    id: 'e5a9c400-0000-4000-8000-000000000004',
    proposedName: 'Quiet residential courtyard',
    city: 'Amsterdam',
    country: 'Netherlands',
    countryCode: 'NL',
    latitude: 52.0,
    longitude: 4.0,
    note: 'Lovely courtyard, you have to go through the gate on the left.',
    submittedById: anna!.id,
    createdAt: '2026-10-12T11:15:00.000Z',
  },
];

export const DEMO_LOCATION_SUBMISSIONS: LocationSubmission[] = RAW_SUBMISSIONS.map((raw) => {
  const signals = evaluateLocationSubmission({
    latitude: raw.latitude,
    longitude: raw.longitude,
    countryCode: raw.countryCode,
    existingNearby,
  });

  // A privately accessed courtyard is a judgement call, not a computed one.
  if (raw.id.endsWith('004')) {
    signals.push({
      kind: 'sensitive-area',
      severity: 'high',
      message:
        'Described as reached through a gate into a residential courtyard. Needs confirmation that public access is permitted before any coordinate is published.',
    });
  }

  return {
    id: raw.id,
    proposedName: raw.proposedName,
    city: raw.city,
    country: raw.country,
    countryCode: raw.countryCode,
    latitude: raw.latitude,
    longitude: raw.longitude,
    note: raw.note,
    status: raw.status ?? 'pending',
    submittedBy: summarise(raw.submittedById),
    createdAt: raw.createdAt,
    signals,
    rejectionReason: raw.rejectionReason ?? null,
  };
});

/* ------------------------------------------------------------------------ */
/* Reports                                                                   */
/* ------------------------------------------------------------------------ */

export const DEMO_REPORTS: Report[] = [
  {
    id: 'f6b0d500-0000-4000-8000-000000000001',
    subjectType: 'photograph',
    subjectId: DEMO_PHOTOGRAPHS[6]!.id,
    subjectLabel: DEMO_PHOTOGRAPHS[6]!.title,
    reason: 'copyright',
    details:
      'I believe this is my photograph. It was published on my own site in 2024 under my name. Happy to provide the original raw file and the publication date.',
    status: 'open',
    createdAt: '2026-10-15T08:30:00.000Z',
    reportedBy: null,
  },
  {
    id: 'f6b0d500-0000-4000-8000-000000000002',
    subjectType: 'location',
    subjectId: DEMO_LOCATIONS[4]!.id,
    subjectLabel: `${DEMO_LOCATIONS[4]!.name}, ${DEMO_LOCATIONS[4]!.city}`,
    reason: 'wrong-location',
    details:
      'The pin is about two blocks north of where these photographs were actually taken. Easy to fix.',
    status: 'reviewing',
    createdAt: '2026-10-14T17:05:00.000Z',
    reportedBy: summarise(maya!.id),
  },
  {
    id: 'f6b0d500-0000-4000-8000-000000000003',
    subjectType: 'photograph',
    subjectId: DEMO_PHOTOGRAPHS[19]!.id,
    subjectLabel: DEMO_PHOTOGRAPHS[19]!.title,
    reason: 'privacy',
    details:
      'I work at this diner and I think I am visible in the reflection on the right-hand side. I would rather not be.',
    status: 'open',
    createdAt: '2026-10-13T12:00:00.000Z',
    reportedBy: null,
  },
  {
    id: 'f6b0d500-0000-4000-8000-000000000004',
    subjectType: 'profile',
    subjectId: pim!.id,
    subjectLabel: `@${pim!.username}`,
    reason: 'spam',
    details: 'Posting the same three images with different titles.',
    status: 'dismissed',
    createdAt: '2026-10-05T09:20:00.000Z',
    reportedBy: summarise(elliot!.id),
  },
];

/* ------------------------------------------------------------------------ */
/* Suspicious uploads                                                        */
/* ------------------------------------------------------------------------ */

export const DEMO_SUSPICIOUS_UPLOADS: SuspiciousUpload[] = [
  {
    id: 'a7c1e600-0000-4000-8000-000000000001',
    photographId: DEMO_PHOTOGRAPHS[6]!.id,
    title: DEMO_PHOTOGRAPHS[6]!.title,
    thumbUrl: DEMO_PHOTOGRAPHS[6]!.image.thumbUrl,
    uploader: summarise(maya!.id),
    createdAt: '2026-08-30T18:15:00.000Z',
    signals: [
      {
        kind: 'perceptual-hash-match',
        severity: 'warn',
        message:
          'Perceptual hash is within 6 bits of an image indexed elsewhere. A near-duplicate is a reason to look, not a finding of infringement — crops and re-edits of the same frame score the same way.',
        relatedLabel: 'External index match',
      },
      {
        kind: 'exif-missing',
        severity: 'info',
        message:
          'No EXIF present. Common after an export, and not evidence of anything by itself.',
      },
    ],
  },
  {
    id: 'a7c1e600-0000-4000-8000-000000000002',
    photographId: DEMO_PHOTOGRAPHS[12]!.id,
    title: DEMO_PHOTOGRAPHS[12]!.title,
    thumbUrl: DEMO_PHOTOGRAPHS[12]!.image.thumbUrl,
    uploader: summarise(marco!.id),
    createdAt: '2026-07-04T19:30:00.000Z',
    signals: [
      {
        kind: 'embedded-credit-mismatch',
        severity: 'high',
        message:
          'The IPTC creator field names someone other than the uploading account. Worth asking about; metadata is also routinely inherited from a studio template.',
        relatedLabel: 'IPTC creator: "A. Moreau"',
      },
    ],
  },
  {
    id: 'a7c1e600-0000-4000-8000-000000000003',
    photographId: DEMO_PHOTOGRAPHS[14]!.id,
    title: DEMO_PHOTOGRAPHS[14]!.title,
    thumbUrl: DEMO_PHOTOGRAPHS[14]!.image.thumbUrl,
    uploader: summarise(anna!.id),
    createdAt: '2026-07-27T20:00:00.000Z',
    signals: [
      {
        kind: 'burst-upload',
        severity: 'info',
        message: 'Eleven uploads inside four minutes. Within policy, flagged for visibility only.',
      },
      {
        kind: 'exif-conflict',
        severity: 'warn',
        message:
          'EXIF capture date is three months before the stated shoot date. Usually a camera clock that was never set.',
      },
    ],
  },
];

/* ------------------------------------------------------------------------ */
/* Recent moderation history                                                 */
/* ------------------------------------------------------------------------ */

export const DEMO_MODERATION_ACTIONS: ModerationAction[] = [
  {
    id: 'b8d2f700-0000-4000-8000-000000000001',
    decision: 'approve',
    subjectType: 'location_submission',
    subjectId: DEMO_LOCATIONS[13]!.id,
    reason: null,
    moderator: summarise(DEMO_MODERATOR.id),
    createdAt: '2026-06-03T08:00:00.000Z',
  },
  {
    id: 'b8d2f700-0000-4000-8000-000000000002',
    decision: 'request_changes',
    subjectType: 'location_submission',
    subjectId: 'e5a9c400-0000-4000-8000-000000000002',
    reason:
      'Please confirm whether the steps are a public right of way at dawn, or whether the gate at the top is locked overnight.',
    moderator: summarise(DEMO_MODERATOR.id),
    createdAt: '2026-10-14T09:10:00.000Z',
  },
  {
    id: 'b8d2f700-0000-4000-8000-000000000003',
    decision: 'dismiss',
    subjectType: 'profile',
    subjectId: pim!.id,
    reason:
      'Checked the three uploads. They are different frames from the same evening, which is not spam.',
    moderator: summarise(DEMO_MODERATOR.id),
    createdAt: '2026-10-06T10:00:00.000Z',
  },
];
