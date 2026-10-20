import { z } from 'zod';

import { displayNameSchema, usernameSchema } from './auth';
import { validationCode } from './codes';

/**
 * Settings schemas.
 *
 * Every limit here is also a check constraint on `profiles` (migrations 0002
 * and 0010), and has to be: a member can write their own row directly with the
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

    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      context.addIssue({ code: 'custom', message: validationCode('website.invalid') });
      return z.NEVER;
    }

    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname.includes('.')) {
      context.addIssue({ code: 'custom', message: validationCode('website.invalid') });
      return z.NEVER;
    }

    const href = url.toString();
    if (href.length > PROFILE_LIMITS.website) {
      context.addIssue({ code: 'custom', message: validationCode('website.max') });
      return z.NEVER;
    }
    return href;
  });

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
  website: websiteSchema,
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
