import type { ExifReadout } from './exif';

/**
 * The camera-only rule: FRAME publishes photographs that carry a camera's own
 * record of how they were made, and nothing from a phone.
 *
 * ONE PLACE FOR THE POLICY. What is required, what counts as a phone, and how
 * a verdict is reached all live here, so the wizard can tell a member before
 * they upload exactly what the server will decide after — the two run the same
 * function on the same readout. The server's run is the one that counts: it
 * reads the file that actually arrived, and its verdict is what the database
 * trigger (migration 0021) checks before a photograph can go to review.
 *
 * WHAT THIS IS NOT. EXIF is written by whatever software touched the file
 * last and can be rewritten in seconds, so a pass here is a policy being met,
 * not proof of provenance. It keeps casual phone uploads out and asks for the
 * record a camera makes; it does not establish who took the picture. The
 * moderators' record keeps every field the file carried, serials included, so a
 * forged block is at least a forged block somebody can look at.
 *
 * WHO IT LETS THROUGH, and who not. A digital camera with any lens, manual
 * included, passes on what the body always writes. A scanned negative has no
 * camera record and is admitted when the member says it is film — flagged, to
 * a person, as every upload already goes to a person. A phone is refused
 * whatever was ticked. A digital export that stripped its metadata is refused
 * and told how to export again, because the camera did write the record and
 * the file simply no longer carries it.
 */

export type RequiredExifField =
  | 'cameraBrand'
  | 'cameraModel'
  | 'aperture'
  | 'shutterSpeed'
  | 'iso'
  | 'focalLengthMm'
  | 'capturedAt';

/**
 * `scanner`: a film scanner or a lab minilab wrote the record — the make a
 * genuine scan from film carries, and the one thing a phone picture with its
 * metadata stripped does not. Not proof; a scanner's make is as forgeable as a
 * camera's. It is what a declared film scan is expected to look like.
 */
export type DeviceClass = 'camera' | 'phone' | 'scanner' | 'unknown';

export interface ExifVerdict {
  /**
   * `camera`: a camera's record, complete. `film`: no usable camera record,
   * but the member declared a film scan and the file is not a phone's — it
   * goes to a person, flagged. `rejected`: a phone, or a digital file missing
   * what a camera always writes.
   */
  verdict: 'camera' | 'film' | 'rejected';
  deviceClass: DeviceClass;
  /** Required fields the file did not carry, in policy order. Empty on `camera`. */
  missing: RequiredExifField[];
}

export const EXIF_GATE = {
  /**
   * What a digital camera ALWAYS writes, whatever lens is on it: who made it,
   * which body, the shutter, the ISO and the moment. Aperture and focal
   * length are deliberately not here — a manual or adapted lens leaves both
   * blank, and a Leica M with a Voigtländer on the front is exactly the kind
   * of camera this site is for. Both are still read, kept and shown.
   * Order is the order the member is told.
   */
  required: [
    'cameraBrand',
    'cameraModel',
    'shutterSpeed',
    'iso',
    'capturedAt',
  ] as const satisfies readonly RequiredExifField[],

  /**
   * Makes that are phones, as EXIF spells them (matched on the first word,
   * case-insensitively). Sony is deliberately absent — it makes both, and its
   * phones are caught by model and lens below.
   */
  phoneMakes: [
    'apple',
    'samsung',
    'google',
    'xiaomi',
    'redmi',
    'poco',
    'huawei',
    'honor',
    'oppo',
    'vivo',
    'oneplus',
    'realme',
    'motorola',
    'nokia',
    'hmd',
    'lg',
    'htc',
    'asus',
    'zte',
    'tecno',
    'infinix',
    'nothing',
    'fairphone',
    'meizu',
    'lenovo',
  ],

  /** Model names that are phones even when the make is ambiguous. */
  phoneModels:
    /\b(iphone|ipad|galaxy|pixel|redmi|poco|nexus|xperia|xq-[a-z]{2}\d|sm-[a-z]\d{3}|mi\s?\d{1,2}|cph\d{4}|rmx\d{4}|v\d{4}[a-z]?)\b/i,

  /** A lens described the way a phone describes its own cameras. */
  phoneLenses: /\b(back|front|rear|selfie)\b.*\b(camera|lens)\b|\b(triple|dual|quad|wide|ultra ?wide|telephoto) camera\b/i,

  /** Software fields a phone OS writes. */
  phoneSoftware: /^(ios|iphone os|android|one ui|hyperos|miui|coloros|oxygenos|emui|harmonyos)\b/i,

  /**
   * Makes that are scanners or minilabs, as they spell themselves. Nikon,
   * Canon and Kodak are deliberately absent — all three made cameras — and
   * their scanners are caught by model below (Coolscan, CanoScan, Pakon).
   */
  scannerMakes: ['epson', 'noritsu', 'plustek', 'pacific', 'reflecta', 'microtek', 'imacon', 'hasselblad'],

  scannerModels:
    /\b(coolscan|ls-\d{3,4}|super coolscan|canoscan|perfection|gt-x\d{3}|v\d{3}\b|frontier|sp-?\d{3,4}|opticfilm|flextight|pakon|f-?\d{3}\b|imagemate|primefilm|scanmaker|qss-?\d{2,3})\b/i,
} as const;

const firstWord = (value: string | null): string =>
  (value ?? '').trim().toLowerCase().split(/[\s,./-]+/)[0] ?? '';

/** Which kind of device the readout describes, from the fields a phone cannot help writing. */
export function classifyDevice(readout: ExifReadout): DeviceClass {
  const make = firstWord(readout.cameraBrand);
  const model = readout.cameraModel ?? '';
  const lens = readout.lensModel ?? '';
  const software = readout.software ?? '';

  if ((EXIF_GATE.phoneMakes as readonly string[]).includes(make)) return 'phone';
  if (EXIF_GATE.phoneModels.test(model)) return 'phone';
  if (EXIF_GATE.phoneLenses.test(lens)) return 'phone';
  if (EXIF_GATE.phoneSoftware.test(software)) return 'phone';

  // A scanner before a camera: an Epson with a model of "Perfection V850" is
  // what a scan from film carries, and it will never have a shutter or an ISO.
  if ((EXIF_GATE.scannerMakes as readonly string[]).includes(make)) return 'scanner';
  if (EXIF_GATE.scannerModels.test(model)) return 'scanner';

  // A make and a model, and none of the phone tells: a camera, as far as the
  // file can say.
  if (readout.cameraBrand && readout.cameraModel) return 'camera';
  return 'unknown';
}

/** Which required fields the readout lacks, in policy order. */
export function missingRequired(readout: ExifReadout): RequiredExifField[] {
  return EXIF_GATE.required.filter((field) => {
    const value = readout[field];
    return value === null || value === undefined || value === '';
  });
}

/**
 * The verdict, the same on the browser's readout and the server's.
 *
 * A phone is refused outright, whatever else it carried; a file that is not a
 * phone must carry every required field. `unknown` — no make or model at all —
 * fails on the missing fields and is reported as such, because "we could not
 * tell what took this" is the honest sentence for a stripped export.
 */
export function assessCameraEvidence(
  readout: ExifReadout,
  options: { filmDeclared?: boolean } = {},
): ExifVerdict {
  const deviceClass = classifyDevice(readout);
  const missing = missingRequired(readout);
  // A phone is a phone whatever box was ticked.
  if (deviceClass === 'phone') return { verdict: 'rejected', deviceClass, missing };
  if (missing.length === 0) return { verdict: 'camera', deviceClass, missing: [] };
  // No usable camera record. A declared film scan is admitted to review with
  // its flag on, for a person to look at; anything else is refused and told
  // what was missing.
  if (options.filmDeclared) return { verdict: 'film', deviceClass, missing };
  return { verdict: 'rejected', deviceClass, missing };
}
