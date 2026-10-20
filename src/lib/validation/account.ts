import { z } from 'zod';

import { isCountryCode } from '@/lib/geo/countries';
import {
  COLLABORATION_STATUSES,
  CRITIQUE_PREFERENCES,
  MAX_PHOTOGRAPHY_STYLES,
  MAX_SOCIAL_LINKS,
  PHOTOGRAPHY_STYLES,
} from '@/types/domain';

import { displayNameSchema, usernameSchema } from './auth';
import { validationCode } from './codes';

/**
 * Settings schemas.
 *
 * Every limit here is also a check constraint on `profiles` (migrations 0002
 * and 0011), and has to be: a member can write their own row directly with the
 * public key, so the form is a courtesy and the database is the rule. The two
 * are written to agree — when they differ, the stricter one is the form, so a
 * member is never told "saved" for a value the database then refuses.
 *
 * Messages are codes resolved under `auth.validation`, like the Join form's;
 * see `codes.ts`.
 */

export const PROFILE_LIMITS = {
  biography: 1200,
  basedIn: 80,
  website: 200,
  gearItems: 12,
  gearItemLength: 60,
  styles: MAX_PHOTOGRAPHY_STYLES,
  socialLinks: MAX_SOCIAL_LINKS,
  socialLinkLength: 200,
} as const;

/** Blank means "not set", which the database stores as null rather than ''. */
function optionalText(max: number, code: string) {
  return z
    .string()
    .trim()
    .max(max, { error: validationCode(code) })
    .transform((value) => (value === '' ? null : value));
}

/**
 * A website, or nothing.
 *
 * "example.com" is read as "https://example.com", because that is what nearly
 * everybody who types it means. After that, only http and https are accepted:
 * the value becomes an href on a public page, and `javascript:` or `data:` there
 * is script, not a website.
 */
const websiteSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value === '') return null;
    return readUrl(value, context, 'website');
  });

/**
 * One URL, read the way a person types one.
 *
 * Shared by the website field and the social links, which have the same two
 * rules for the same reason: the value becomes an href on a public page, so
 * only http and https are accepted, and it has to fit the column. The issue
 * codes differ per field so the form can put the message under the right
 * input — see `codes.ts`.
 */
function readUrl(
  value: string,
  context: z.RefinementCtx,
  field: 'website' | 'socialLinks',
): string | typeof z.NEVER {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    context.addIssue({ code: 'custom', message: validationCode(`${field}.invalid`) });
    return z.NEVER;
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname.includes('.')) {
    context.addIssue({ code: 'custom', message: validationCode(`${field}.invalid`) });
    return z.NEVER;
  }

  const href = url.toString();
  if (href.length > PROFILE_LIMITS.website) {
    context.addIssue({ code: 'custom', message: validationCode(`${field}.max`) });
    return z.NEVER;
  }
  return href;
}

/**
 * One link per line, like the gear field — and checked here rather than by an
 * array schema for the same reason: a problem with the third line is reported
 * against the field the form actually shows, not against `socialLinks.2`.
 *
 * A repeat is dropped rather than refused. Somebody pasting a list twice has
 * made a mistake, not a request.
 */
const socialLinksSchema = z.string().transform((value, context) => {
  const seen = new Set<string>();
  const links: string[] = [];

  for (const line of value.split(/\r?\n/)) {
    const item = line.trim();
    if (!item) continue;

    const href = readUrl(item, context, 'socialLinks');
    if (href === z.NEVER) return z.NEVER;
    if (seen.has(href.toLowerCase())) continue;

    seen.add(href.toLowerCase());
    links.push(href);
  }

  if (links.length > PROFILE_LIMITS.socialLinks) {
    context.addIssue({ code: 'custom', message: validationCode('socialLinks.tooMany') });
    return z.NEVER;
  }
  return links;
});

/** The country the member picked, or nothing. Unknown codes are refused. */
const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value, context) => {
    if (value === '') return null;
    if (!isCountryCode(value)) {
      context.addIssue({ code: 'custom', message: validationCode('countryCode.invalid') });
      return z.NEVER;
    }
    return value;
  });

/**
 * The styles the member ticked.
 *
 * Checkboxes, so the field arrives as zero or more values under one name and is
 * read with `getAll`; anything outside the vocabulary is dropped rather than
 * refused, because the only way to send one is to have edited the form by hand.
 */
const stylesSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]),
  z.array(z.string()).transform((values, context) => {
    const chosen = PHOTOGRAPHY_STYLES.filter((style) => values.includes(style));
    if (chosen.length > PROFILE_LIMITS.styles) {
      context.addIssue({ code: 'custom', message: validationCode('styles.tooMany') });
      return z.NEVER;
    }
    return [...chosen];
  }),
);

/** One of the words, or nothing at all. Silence is not "closed". */
function choiceOrBlank<const T extends readonly string[]>(allowed: T, code: string) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === '') return null;
      if (!(allowed as readonly string[]).includes(value)) {
        context.addIssue({ code: 'custom', message: validationCode(code) });
        return z.NEVER;
      }
      return value as T[number];
    });
}

/**
 * One piece of gear per line. Blank lines are dropped, and a repeat — however
 * it is capitalised — is kept once, so pasting a list twice does not double it.
 *
 * Checked here rather than by an array schema so that a problem with the fourth
 * line is reported against the field, which the form shows, and not against
 * `gear.3`, which no input is called.
 */
const gearSchema = z.string().transform((value, context) => {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const item = line.trim().replace(/\s+/g, ' ');
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    items.push(item);
  }

  if (items.length > PROFILE_LIMITS.gearItems) {
    context.addIssue({ code: 'custom', message: validationCode('gear.tooMany') });
    return z.NEVER;
  }
  if (items.some((item) => item.length > PROFILE_LIMITS.gearItemLength)) {
    context.addIssue({ code: 'custom', message: validationCode('gear.itemMax') });
    return z.NEVER;
  }
  return items;
});

export const profileSchema = z.object({
  displayName: displayNameSchema,
  biography: optionalText(PROFILE_LIMITS.biography, 'biography.max'),
  basedIn: optionalText(PROFILE_LIMITS.basedIn, 'basedIn.max'),
  countryCode: countryCodeSchema,
  website: websiteSchema,
  socialLinks: socialLinksSchema,
  styles: stylesSchema,
  collaboration: choiceOrBlank(COLLABORATION_STATUSES, 'collaboration.invalid'),
  critique: choiceOrBlank(CRITIQUE_PREFERENCES, 'critique.invalid'),
  gear: gearSchema,
});

export const changeUsernameSchema = z.object({
  username: usernameSchema,
});

export const deleteAccountSchema = z.object({
  confirmUsername: z
    .string({ error: validationCode('confirmUsername.required') })
    .trim()
    .toLowerCase()
    .min(1, { error: validationCode('confirmUsername.required') }),
});
