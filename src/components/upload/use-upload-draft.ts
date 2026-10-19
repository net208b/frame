'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { UPLOAD_POLICY } from '@/lib/config';
import { readExif, type ExifReadout } from '@/lib/images/exif';
import { locationSubmissionSchema } from '@/lib/validation/location';
import {
  captureSettingsSchema,
  editingDetailsSchema,
  normaliseShutterSpeed,
  publishPhotographSchema,
  uploadDraftSchema,
} from '@/lib/validation/upload';
import type { LocationSummary, PhotoCategory } from '@/types/domain';

import { fileSizeParts } from './limits';

/**
 * The wizard's state, in one place.
 *
 * Three decisions worth explaining:
 *
 * 1. Nothing is persisted. A draft in `localStorage` would outlive the session
 *    and promise a resumption it cannot deliver, because the chosen `File`
 *    cannot be serialised with it: the member would come back to a form full of
 *    their words and no photograph. Holding it in memory is the honest option.
 * 2. Every value is kept as the string the control holds, and validation runs
 *    through the same zod schemas the server uses. The wizard and the server
 *    therefore agree about what a valid aperture is, by construction rather
 *    than by two people writing the same bounds twice.
 * 3. Moving backwards never discards anything. A member who steps back to fix
 *    a title finds their camera settings where they left them.
 */

export const STEP_IDS = [
  'file',
  'describe',
  'place',
  'gear',
  'settings',
  'review',
  'submit',
] as const;

export type StepId = (typeof STEP_IDS)[number];

/** How many steps there are, which every "step N of seven" sentence needs. */
export const STEP_COUNT = STEP_IDS.length;

/**
 * The number a step wears, 1-based, as the member counts them.
 *
 * The title and one-line summary that used to sit beside it here now live at
 * `upload.steps.<id>` in the message catalogues. A step's name is copy, and
 * copy a module holds as a string literal cannot be translated; the number is
 * not copy but the step's position in the sequence, so it stays in code — and
 * it is formatted through the active locale wherever it is read out.
 */
export function stepNumber(step: StepId): number {
  return STEP_IDS.indexOf(step) + 1;
}

export type PlaceMode = 'none' | 'existing' | 'propose';

/** Whether the member has answered the question about the position in the file. */
export type GpsChoice = 'unanswered' | 'used' | 'declined';

export interface CaptureFields {
  cameraBrand: string;
  cameraModel: string;
  lensBrand: string;
  lensModel: string;
  focalLengthMm: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
}

export interface EditingFields {
  software: string;
  notes: string;
}

export interface ProposalFields {
  proposedName: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: string;
  longitude: string;
  note: string;
}

/** Which fields were filled in from the file and have not been edited since. */
export type PrefilledField = keyof CaptureFields;

export interface UploadDraftState {
  /**
   * The draft row's id, once `createDraft` has made one.
   *
   * It lives in the wizard's state rather than in the submit step so that
   * stepping back to fix a title and returning does not create a second draft
   * row — which would occupy one of the member's pending-upload slots and
   * leave an orphan nobody ever publishes.
   */
  photographId: string | null;
  file: File | null;
  previewUrl: string | null;
  exif: ExifReadout | null;
  exifStatus: 'idle' | 'reading' | 'read';
  title: string;
  description: string;
  category: PhotoCategory | '';
  altText: string;
  placeMode: PlaceMode;
  location: LocationSummary | null;
  proposal: ProposalFields;
  gpsChoice: GpsChoice;
  capture: CaptureFields;
  editing: EditingFields;
  /** EXIF holding a capture date is not consent to show it. */
  publishCapturedAt: boolean;
  rightsConfirmed: boolean;
  prefilled: PrefilledField[];
}

const EMPTY_CAPTURE: CaptureFields = {
  cameraBrand: '',
  cameraModel: '',
  lensBrand: '',
  lensModel: '',
  focalLengthMm: '',
  aperture: '',
  shutterSpeed: '',
  iso: '',
};

const EMPTY_PROPOSAL: ProposalFields = {
  proposedName: '',
  city: '',
  country: '',
  countryCode: '',
  latitude: '',
  longitude: '',
  note: '',
};

const INITIAL_STATE: UploadDraftState = {
  photographId: null,
  file: null,
  previewUrl: null,
  exif: null,
  exifStatus: 'idle',
  title: '',
  description: '',
  category: '',
  altText: '',
  placeMode: 'none',
  location: null,
  proposal: EMPTY_PROPOSAL,
  gpsChoice: 'unanswered',
  capture: EMPTY_CAPTURE,
  editing: { software: '', notes: '' },
  publishCapturedAt: false,
  rightsConfirmed: false,
  prefilled: [],
};

/* ------------------------------------------------------------------------ */
/* Validation                                                               */
/* ------------------------------------------------------------------------ */

/**
 * One thing wrong with one field, named rather than written out.
 *
 * The rules still come from the zod schemas the server uses — the wizard and
 * the server cannot disagree about what a valid aperture is, because they parse
 * with the same schema. What a second language changed is that a schema's own
 * message is no longer what the member reads: those messages are built in
 * `lib/validation/fields.ts` from an English label and an English template, and
 * they run on the server as well as here, so there is no locale to build them
 * in. An issue is therefore reduced to a key in the `upload.validation`
 * namespace plus the bound that caused it, and the component renders it in the
 * language the page is in.
 *
 * The bound is read off the issue rather than restated here, so a limit raised
 * in the schema changes the sentence with it.
 */
export interface FieldIssue {
  /** A message key relative to the `upload` namespace. */
  key: string;
  values?: Record<string, string | number>;
}

/** The issues for one step, keyed by the name the control uses. */
export type FieldIssues = Record<string, FieldIssue>;

/** The same, resolved into the active locale, as a control wants them. */
export type FieldErrors = Record<string, string>;

/**
 * Decimals used when a camera's own position is offered as a starting point.
 * Six is roughly 0.1 m, which is the file's own precision; what FRAME publishes
 * is rounded by `LOCATION_POLICY`, and the two are deliberately different
 * numbers for different purposes.
 */
const GPS_DECIMALS = 6;

/**
 * The parts of a zod issue this module reads.
 *
 * Structural rather than imported from zod so the shape of what is relied on is
 * visible: the issue's `code`, and the bound it carries when there is one. Every
 * field is optional except the two every issue has, which means an issue kind
 * this file has not met falls into a field's catch-all message instead of
 * throwing.
 */
interface IssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
  code?: string;
  /** `invalid_type` carries what it wanted — "int" is the one that matters. */
  expected?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

function boundOf(value: number | bigint | undefined): number | null {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/** The accepted extensions as the member reads them: ".jpg, .jpeg, .png, …". */
const ACCEPTED_EXTENSIONS = UPLOAD_POLICY.acceptedExtensions.join(', ');

/**
 * Which message an issue on a given control asks for.
 *
 * `field` is the name the *control* uses, not always the schema path: the
 * editing fields are renamed on the way in (see `collect`) so that the message
 * names the control a member can actually see. A field lists only the rules its
 * schema can break, and anything unrecognised falls through to a sentence that
 * says the answer needs another look — which is weaker copy than a named rule,
 * and is why the named rules are enumerated rather than inferred.
 */
function describeIssue(field: string, issue: IssueLike): FieldIssue {
  const code = issue.code ?? '';
  const min = boundOf(issue.minimum);
  const max = boundOf(issue.maximum);
  const notWhole = code === 'invalid_type' && issue.expected === 'int';

  switch (field) {
    case 'title':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.titleMax', values: { max } };
      }
      return { key: 'validation.titleRequired' };

    case 'category':
      return { key: 'validation.categoryRequired' };

    case 'altText':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.altTextMax', values: { max } };
      }
      if (code === 'too_small' && min !== null) {
        return { key: 'validation.altTextMin', values: { min } };
      }
      // `requiredText` reports a missing value as a type error, and the member
      // fixes that the same way they fix a short one.
      return { key: 'validation.altTextMin', values: { min: 10 } };

    case 'description':
      return { key: 'validation.descriptionMax', values: { max: max ?? 2_000 } };

    case 'proposedName':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.proposedNameMax', values: { max } };
      }
      return { key: 'validation.proposedNameMin', values: { min: min ?? 2 } };

    case 'city':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.cityMax', values: { max } };
      }
      return { key: 'validation.cityRequired' };

    case 'country':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.countryMax', values: { max } };
      }
      return { key: 'validation.countryRequired' };

    case 'countryCode':
      return { key: 'validation.countryCodeFormat' };

    case 'latitude':
      return { key: 'validation.latitudeInvalid' };

    case 'longitude':
      return { key: 'validation.longitudeInvalid' };

    case 'note':
      return { key: 'validation.noteMax', values: { max: max ?? 600 } };

    case 'cameraBrand':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.cameraBrandMax', values: { max } };
      }
      return { key: 'validation.cameraBrandInvalid' };

    case 'cameraModel':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.cameraModelMax', values: { max } };
      }
      return { key: 'validation.cameraModelInvalid' };

    case 'lensBrand':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.lensBrandMax', values: { max } };
      }
      return { key: 'validation.lensBrandInvalid' };

    case 'lensModel':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.lensModelMax', values: { max } };
      }
      return { key: 'validation.lensModelInvalid' };

    case 'focalLengthMm':
      if (code === 'too_small' && min !== null) {
        return { key: 'validation.focalLengthMin', values: { min } };
      }
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.focalLengthMax', values: { max } };
      }
      if (notWhole) return { key: 'validation.focalLengthWhole' };
      return { key: 'validation.focalLengthNumber' };

    case 'aperture':
      if (code === 'too_small' && min !== null) {
        return { key: 'validation.apertureMin', values: { min } };
      }
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.apertureMax', values: { max } };
      }
      return { key: 'validation.apertureNumber' };

    case 'shutterSpeed':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.shutterSpeedMax', values: { max } };
      }
      return { key: 'validation.shutterSpeedFormat' };

    case 'iso':
      if (code === 'too_small' && min !== null) {
        return { key: 'validation.isoMin', values: { min } };
      }
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.isoMax', values: { max } };
      }
      if (notWhole) return { key: 'validation.isoWhole' };
      return { key: 'validation.isoNumber' };

    case 'editingSoftware':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.editingSoftwareMax', values: { max } };
      }
      return { key: 'validation.editingSoftwareInvalid' };

    case 'editingNotes':
      if (code === 'too_big' && max !== null) {
        return { key: 'validation.editingNotesMax', values: { max } };
      }
      return { key: 'validation.editingNotesInvalid' };

    default:
      return { key: 'validation.generic' };
  }
}

/**
 * The one message for step 1, where three schema paths describe one control.
 *
 * The member chose a file, not a name, a type and a size, so all three report
 * against the drop zone — and which of the three failed decides what the
 * sentence says.
 */
function describeFileIssue(issue: IssueLike): FieldIssue {
  const code = issue.code ?? '';
  const path = String(issue.path[0] ?? '');
  const max = boundOf(issue.maximum);

  if (path === 'fileName') {
    // The extension check is a `refine`, which reports as a custom issue.
    if (code === 'custom') {
      return { key: 'validation.fileExtension', values: { extensions: ACCEPTED_EXTENSIONS } };
    }
    if (code === 'too_big' && max !== null) {
      return { key: 'validation.fileNameTooLong', values: { max } };
    }
    return { key: 'validation.fileNameMissing' };
  }

  if (path === 'byteSize') {
    if (code === 'too_big') {
      return {
        key: 'validation.fileTooLarge',
        values: fileSizeParts(UPLOAD_POLICY.maxFileBytes),
      };
    }
    if (code === 'too_small') return { key: 'validation.fileEmpty' };
    return { key: 'validation.fileSizeUnknown' };
  }

  // `contentType`, and anything the schema grows later: the accepted formats
  // are the only thing worth saying about a file FRAME cannot read.
  return { key: 'validation.fileType' };
}

/**
 * Collect a schema's issues into one message per field.
 *
 * `rename` maps a schema path onto the name the control actually uses, so the
 * editing fields can live in their own schema and still report against
 * `editingSoftware` and `editingNotes` in the form. The renamed name is also
 * what picks the message, so the sentence names the control rather than the
 * schema property behind it.
 */
function collect(
  issues: readonly IssueLike[],
  into: FieldIssues,
  rename: Record<string, string> = {},
): void {
  for (const issue of issues) {
    const path = issue.path.map((segment) => String(segment)).join('.');
    const key = rename[path] ?? (path.length > 0 ? path : '_form');
    if (into[key] === undefined) into[key] = describeIssue(key, issue);
  }
}

const fileFactsSchema = uploadDraftSchema.pick({
  fileName: true,
  contentType: true,
  byteSize: true,
});

const describeSchema = publishPhotographSchema.pick({
  title: true,
  description: true,
  category: true,
  altText: true,
});

const gearSchema = captureSettingsSchema.pick({
  cameraBrand: true,
  cameraModel: true,
  lensBrand: true,
  lensModel: true,
});

const exposureSchema = captureSettingsSchema.pick({
  focalLengthMm: true,
  aperture: true,
  shutterSpeed: true,
  iso: true,
});

/** The per-step rules. Returns one issue per field, keyed by control name. */
export function validateStep(step: StepId, state: UploadDraftState): FieldIssues {
  const errors: FieldIssues = {};

  if (step === 'file') {
    if (!state.file) {
      errors.file = { key: 'validation.fileMissing' };
      return errors;
    }
    const parsed = fileFactsSchema.safeParse({
      fileName: state.file.name,
      contentType: state.file.type,
      byteSize: state.file.size,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      if (first !== undefined) errors.file = describeFileIssue(first);
    }
    return errors;
  }

  if (step === 'describe') {
    const parsed = describeSchema.safeParse({
      title: state.title,
      description: state.description,
      category: state.category,
      altText: state.altText,
    });
    if (!parsed.success) collect(parsed.error.issues, errors);
    return errors;
  }

  if (step === 'place') {
    if (state.placeMode === 'existing' && !state.location) {
      errors.location = { key: 'validation.locationRequired' };
    }
    if (state.placeMode === 'propose') {
      const parsed = locationSubmissionSchema.safeParse(state.proposal);
      if (!parsed.success) collect(parsed.error.issues, errors);
    }
    return errors;
  }

  if (step === 'gear') {
    const parsed = gearSchema.safeParse(state.capture);
    if (!parsed.success) collect(parsed.error.issues, errors);
    return errors;
  }

  if (step === 'settings') {
    const exposure = exposureSchema.safeParse(state.capture);
    if (!exposure.success) collect(exposure.error.issues, errors);

    const editing = editingDetailsSchema.safeParse(state.editing);
    if (!editing.success) {
      collect(editing.error.issues, errors, {
        software: 'editingSoftware',
        notes: 'editingNotes',
      });
    }
    return errors;
  }

  if (step === 'review') {
    if (!state.rightsConfirmed) {
      errors.rightsConfirmed = { key: 'validation.rightsConfirmedRequired' };
    }
    return errors;
  }

  return errors;
}

/* ------------------------------------------------------------------------ */
/* Payloads                                                                 */
/* ------------------------------------------------------------------------ */

export interface DraftPayload {
  fileName: string;
  contentType: string;
  byteSize: number;
  category: string;
  title: string;
  altText: string;
}

export interface PublishPayload {
  photographId: string;
  title: string;
  altText: string;
  description: string;
  category: string;
  locationId: string | null;
  capturedAt: string | null;
  capture: CaptureFields;
  editing: EditingFields;
  rightsConfirmed: boolean;
  exif: ExifReadout | null;
  shareExifGps: boolean;
}

export function draftPayload(state: UploadDraftState): DraftPayload | null {
  if (!state.file) return null;
  return {
    fileName: state.file.name,
    contentType: state.file.type,
    byteSize: state.file.size,
    category: state.category,
    title: state.title,
    altText: state.altText,
  };
}

export function publishPayload(state: UploadDraftState, photographId: string): PublishPayload {
  return {
    photographId,
    title: state.title,
    altText: state.altText,
    description: state.description,
    category: state.category,
    // A proposed place is not a place yet, so the photograph publishes with no
    // location rather than with one that has not been reviewed.
    locationId: state.placeMode === 'existing' ? (state.location?.id ?? null) : null,
    capturedAt: state.publishCapturedAt ? (state.exif?.capturedAt ?? null) : null,
    capture: state.capture,
    editing: state.editing,
    rightsConfirmed: state.rightsConfirmed,
    exif: state.exif,
    // Only ever true because the member chose it on the place step.
    shareExifGps: state.gpsChoice === 'used',
  };
}

export function proposalPayload(state: UploadDraftState): ProposalFields | null {
  return state.placeMode === 'propose' ? state.proposal : null;
}

/* ------------------------------------------------------------------------ */
/* The hook                                                                 */
/* ------------------------------------------------------------------------ */

export interface UploadDraft {
  state: UploadDraftState;
  step: StepId;
  stepIndex: number;
  /** Errors for the step the member is on, shown only once they have tried. */
  errors: FieldErrors;
  /**
   * The same errors, without waiting for an attempt.
   *
   * Step 1 uses this for the drop zone: choosing a file is itself the attempt,
   * and the answer is already known, so holding the message back until the
   * member presses continue would be withholding it. Everything else waits, so
   * an untouched form does not open covered in red.
   */
  immediateErrors: FieldErrors;
  dirty: boolean;
  /**
   * True once the photograph has actually been published or sent for review.
   * The wizard locks the rail on it, so a finished upload cannot be walked
   * back through and submitted a second time.
   */
  submitted: boolean;
  /** The furthest step reached, so the progress rail can offer it again. */
  furthestIndex: number;
  setFile: (file: File | null) => void;
  update: (patch: Partial<UploadDraftState>) => void;
  updateCapture: (patch: Partial<CaptureFields>) => void;
  updateEditing: (patch: Partial<EditingFields>) => void;
  updateProposal: (patch: Partial<ProposalFields>) => void;
  answerGps: (choice: GpsChoice) => void;
  /** Records the draft row the server created, so a retry reuses it. */
  setPhotographId: (photographId: string) => void;
  goTo: (step: StepId) => void;
  next: () => void;
  back: () => void;
  markSubmitted: () => void;
  /** Clear everything and return to step 1, for starting a second upload. */
  reset: () => void;
  isPrefilled: (field: PrefilledField) => boolean;
}

/** Which capture fields a readout can fill in, with the value it would write. */
function prefillFrom(exif: ExifReadout): { capture: CaptureFields; filled: PrefilledField[] } {
  const capture: CaptureFields = {
    cameraBrand: exif.cameraBrand ?? '',
    cameraModel: exif.cameraModel ?? '',
    lensBrand: exif.lensBrand ?? '',
    lensModel: exif.lensModel ?? '',
    focalLengthMm: exif.focalLengthMm === null ? '' : String(exif.focalLengthMm),
    aperture: exif.aperture === null ? '' : String(exif.aperture),
    shutterSpeed: exif.shutterSpeed ?? '',
    iso: exif.iso === null ? '' : String(exif.iso),
  };

  const filled = (Object.keys(capture) as PrefilledField[]).filter(
    (field) => capture[field].length > 0,
  );

  return { capture, filled };
}

/** Nothing wrong, as a value, so the memo below has a stable empty result. */
const NO_ERRORS: FieldErrors = {};

export function useUploadDraft(): UploadDraft {
  const t = useTranslations('upload');
  const [state, setState] = useState<UploadDraftState>(INITIAL_STATE);
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [attempted, setAttempted] = useState<Partial<Record<StepId, boolean>>>({});
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Each new readout supersedes the last, so a member who swaps files quickly
  // cannot end up with the previous file's camera settings.
  const exifRun = useRef(0);
  // The live object URL, held outside state so the unmount cleanup can revoke
  // it without touching a component that is already going away.
  const previewRef = useRef<string | null>(null);

  const step: StepId = STEP_IDS[stepIndex] ?? 'file';

  const update = useCallback((patch: Partial<UploadDraftState>) => {
    setDirty(true);
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const updateCapture = useCallback((patch: Partial<CaptureFields>) => {
    setDirty(true);
    setState((current) => ({
      ...current,
      capture: { ...current.capture, ...patch },
      // A field the member has touched is their value now, so the "read from
      // the file" marker comes off it.
      prefilled: current.prefilled.filter((field) => !(field in patch)),
    }));
  }, []);

  const updateEditing = useCallback((patch: Partial<EditingFields>) => {
    setDirty(true);
    setState((current) => ({ ...current, editing: { ...current.editing, ...patch } }));
  }, []);

  const updateProposal = useCallback((patch: Partial<ProposalFields>) => {
    setDirty(true);
    setState((current) => ({ ...current, proposal: { ...current.proposal, ...patch } }));
  }, []);

  const setFile = useCallback((file: File | null) => {
    setDirty(true);
    exifRun.current += 1;
    const run = exifRun.current;

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    const previewUrl = previewRef.current;

    setState((current) => {
      return {
        ...current,
        file,
        previewUrl,
        exif: null,
        exifStatus: file ? 'reading' : 'idle',
        // A new file means a new set of camera facts; anything the member typed
        // over the old prefill is cleared with it rather than silently kept.
        capture: EMPTY_CAPTURE,
        prefilled: [],
        publishCapturedAt: false,
        gpsChoice: 'unanswered',
      };
    });

    if (!file) return;

    void readExif(file).then((exif) => {
      if (exifRun.current !== run) return;
      const { capture, filled } = prefillFrom(exif);
      setState((current) => ({
        ...current,
        exif,
        exifStatus: 'read',
        capture,
        prefilled: filled,
      }));
    });
  }, []);

  const answerGps = useCallback((choice: GpsChoice) => {
    setDirty(true);
    setState((current) => {
      const gps = current.exif?.gps ?? null;
      if (gps === null) return { ...current, gpsChoice: choice };

      const asFields = {
        latitude: gps.latitude.toFixed(GPS_DECIMALS),
        longitude: gps.longitude.toFixed(GPS_DECIMALS),
      };

      if (choice === 'used') {
        // The position is copied into the proposal only here, on an explicit
        // choice. Nothing in the wizard fills these two fields on its own.
        return {
          ...current,
          gpsChoice: 'used',
          placeMode: 'propose',
          proposal: { ...current.proposal, ...asFields },
        };
      }

      // Withdrawing the choice takes the position back out, unless the member
      // has since typed something else there. Leaving a declined coordinate in
      // the form would submit the very thing they said no to.
      const untouched =
        current.proposal.latitude === asFields.latitude &&
        current.proposal.longitude === asFields.longitude;

      return {
        ...current,
        gpsChoice: choice,
        proposal: untouched
          ? { ...current.proposal, latitude: '', longitude: '' }
          : current.proposal,
      };
    });
  }, []);

  // Not a member edit, so it deliberately leaves `dirty` alone.
  const setPhotographId = useCallback((photographId: string) => {
    setState((current) => ({ ...current, photographId }));
  }, []);

  const goTo = useCallback((target: StepId) => {
    const index = STEP_IDS.indexOf(target);
    if (index < 0) return;
    setStepIndex(index);
    setFurthestIndex((current) => Math.max(current, index));
  }, []);

  const next = useCallback(() => {
    setAttempted((marks) => ({ ...marks, [step]: true }));

    if (Object.keys(validateStep(step, state)).length > 0) return;

    // The exposure schema normalises what a photographer writes, so the member
    // sees the value FRAME will publish before they leave the step.
    if (step === 'settings' && state.capture.shutterSpeed.trim().length > 0) {
      const normalised = normaliseShutterSpeed(state.capture.shutterSpeed);
      if (normalised !== null && normalised !== state.capture.shutterSpeed) {
        setState((current) => ({
          ...current,
          capture: { ...current.capture, shutterSpeed: normalised },
        }));
      }
    }

    const index = Math.min(stepIndex + 1, STEP_IDS.length - 1);
    setStepIndex(index);
    setFurthestIndex((furthest) => Math.max(furthest, index));
  }, [state, step, stepIndex]);

  const back = useCallback(() => {
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const markSubmitted = useCallback(() => {
    setSubmitted(true);
    setDirty(false);
  }, []);

  /**
   * Back to an empty wizard.
   *
   * Used after a published upload, so a member can send a second photograph
   * without reloading, and after a discarded draft, where the row and its
   * objects are gone and keeping the form would describe something that no
   * longer exists. The preview is revoked here because nothing else will:
   * `setFile` only revokes the URL it is replacing.
   */
  const reset = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    // Supersede any EXIF read still in flight from the file being cleared.
    exifRun.current += 1;
    setState(INITIAL_STATE);
    setStepIndex(0);
    setFurthestIndex(0);
    setAttempted({});
    setDirty(false);
    setSubmitted(false);
  }, []);

  // Revoke the preview when the wizard unmounts; `setFile` handles replacement.
  useEffect(
    () => () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    },
    [],
  );

  // Leaving with work in progress loses it, because nothing is persisted, so
  // the browser is asked to confirm.
  useEffect(() => {
    if (!dirty || submitted) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers show their own wording; assigning returnValue is what still
      // triggers the prompt across all of them.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, submitted]);

  const immediateErrors = useMemo(() => {
    const issues = validateStep(step, state);
    const messages: FieldErrors = {};
    for (const [field, issue] of Object.entries(issues)) {
      messages[field] = t(issue.key, issue.values);
    }
    return messages;
  }, [step, state, t]);

  const errors = attempted[step] ? immediateErrors : NO_ERRORS;

  const isPrefilled = useCallback(
    (field: PrefilledField) => state.prefilled.includes(field),
    [state.prefilled],
  );

  return {
    state,
    step,
    stepIndex,
    errors,
    immediateErrors,
    dirty,
    submitted,
    furthestIndex,
    setFile,
    update,
    updateCapture,
    updateEditing,
    updateProposal,
    answerGps,
    setPhotographId,
    goTo,
    next,
    back,
    markSubmitted,
    reset,
    isPrefilled,
  };
}
