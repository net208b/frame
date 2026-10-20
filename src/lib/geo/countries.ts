/**
 * Countries, for the one place a member says which one they work from.
 *
 * WHY A LIST AT ALL. `locations.country_code` is written by whoever submits a
 * place and checked by a moderator; a profile has no moderator, so the field
 * has to be a choice rather than two typed letters. The list is the assigned
 * ISO 3166-1 alpha-2 set, which is also what the database stores.
 *
 * WHY NO NAMES IN THIS FILE. The names come from `Intl.DisplayNames`, which
 * ships with the runtime and knows every one of these in both of FRAME's
 * languages — so a Thai reader sees "ญี่ปุ่น" and an English reader "Japan"
 * without this project maintaining 249 names twice and getting some of them
 * politically wrong. The codes are the data; the words are the platform's.
 *
 * A code the runtime cannot name comes back as the code itself. That is the
 * honest fallback: better two letters a reader can look up than a blank where a
 * country should be.
 */

/**
 * Every assigned alpha-2 code, as one string for the sake of the diff — a
 * 249-line array would bury any future change to the list in noise.
 */
const ASSIGNED = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`;

export const COUNTRY_CODES: readonly string[] = ASSIGNED.trim().split(/\s+/);

const KNOWN = new Set(COUNTRY_CODES);

/** Whether a stored or submitted value is a code this list knows. */
export function isCountryCode(value: string | null | undefined): boolean {
  return typeof value === 'string' && KNOWN.has(value.toUpperCase());
}

/**
 * The country's name in the reader's language, or the bare code when the
 * runtime has no name for it.
 */
export function countryName(code: string, locale = 'en'): string {
  const upper = code.toUpperCase();
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
    return names.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/**
 * The flag, as the two regional indicator symbols for the code.
 *
 * Not an image and not an icon font: the characters are the standard way to
 * write a flag, they inherit the text colour and size, and they cost nothing to
 * load. A platform without flag glyphs — Windows, mostly — draws the two
 * letters instead, which is still the country, which is why the name is always
 * printed beside it rather than relying on the glyph to say it.
 */
export function countryFlag(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export interface CountryOption {
  code: string;
  name: string;
}

/**
 * The list for a `<select>`, sorted by name in the reader's language.
 *
 * Built on the server and passed to the form, so the options are in the HTML:
 * the Settings form works before hydration, and 249 options cost less than the
 * code to fetch them would.
 */
export function countryOptions(locale = 'en'): CountryOption[] {
  const collator = new Intl.Collator(locale);
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    collator.compare(a.name, b.name),
  );
}
