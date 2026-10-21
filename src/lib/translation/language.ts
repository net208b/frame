import { LOCALES } from '@/i18n/locales';

/**
 * Which of FRAME's two languages a piece of member-written text is in.
 *
 * WHY THE SCRIPT AND NOT A DETECTION SERVICE. FRAME is bilingual in exactly
 * two languages, and those two are written in different scripts. Thai occupies
 * one contiguous Unicode block (U+0E00–U+0E7F) that no Latin-script language
 * uses, so "does this contain Thai letters" answers the only question we have
 * to ask — for free, offline, deterministically, and without sending a single
 * character to anybody in order to find out what language it is in.
 *
 * A probabilistic detector would be worse here in both directions: it would
 * cost a network round trip to learn something the bytes already say, and it
 * would occasionally guess Lao or Vietnamese for a short Thai string and
 * translate it from the wrong language.
 *
 * MIXED TEXT counts as Thai. A Thai sentence almost always carries some Latin
 * — a camera model, a street name, a hashtag — while an English sentence
 * carries Thai letters only when it is really a Thai sentence with an English
 * word in it. So any Thai letter at all means Thai, and that is the right
 * asymmetry: translating "Leica M6 ที่สยาม" from Thai gives English, while
 * translating it from English would give back the same string unchanged.
 */

export type Language = (typeof LOCALES)[number];

/** U+0E00–U+0E7F, the Thai block. Nothing else uses it. */
const THAI = /[฀-๿]/;

export function isThai(text: string): boolean {
  return THAI.test(text);
}

export function languageOf(text: string): Language {
  return THAI.test(text) ? 'th' : 'en';
}

/** The language a given text should be translated INTO. */
export function otherLanguage(language: Language): Language {
  return language === 'th' ? 'en' : 'th';
}

/**
 * Whether a string is worth translating at all.
 *
 * Text with no letters in either script — "2024", "f/1.4", "—", an emoji — is
 * the same in both languages, and sending it to a translator spends a request
 * to get it back unchanged, or worse, to get a number "translated" into a
 * different numeral system. A title that is purely a camera model is left
 * exactly as its author typed it.
 */
const LETTER = /[\p{Letter}]/u;

export function worthTranslating(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  return trimmed.length > 0 && LETTER.test(trimmed);
}
