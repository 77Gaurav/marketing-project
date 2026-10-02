import { z } from 'zod';

/**
 * Field validators shared by every form in the product.
 *
 * The campaign form and the admin console validate the same underlying facts — a person's name, an
 * email, a phone number, a website — and those facts are backed by the same TEXT columns with the same
 * CHECK constraints. Defining them once here is what stops the two forms from drifting into accepting
 * different things, which is the kind of divergence that only surfaces as a 422 from a submission the
 * user believes they filled in correctly.
 *
 * Two properties are load-bearing and easy to break:
 *
 *   1. Every schema must accept its own output. The client submits the *parsed* value, so a blank
 *      optional field arrives at the API as `null` rather than `''`. An input type narrower than the
 *      output type rejects the payload its own client just produced.
 *   2. Normalisation happens before validation, so "  Ada@Example.COM " and "ada@example.com" are one
 *      identity by the time they reach the unique index on `users.email`.
 *
 * Safe to import from `'use client'` — no server-only modules below this line.
 */

export const MAX_EMAIL_LENGTH = 254;

/** Upper bounds shared with the TEXT columns in db/migrations. */
export const NAME_LIMIT = 120;
export const PHONE_LIMIT = 32;
export const URL_LIMIT = 2048;
export const DESCRIPTION_LIMIT = 2000;
export const LOCATION_LIMIT = 200;

export const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(NAME_LIMIT, `${label} must be ${NAME_LIMIT} characters or fewer`);

/** Optional counterpart to {@link nameField}: empty and absent both mean "not provided". */
export const optionalNameField = (label: string) =>
  z
    .string()
    .trim()
    .max(NAME_LIMIT, `${label} must be ${NAME_LIMIT} characters or fewer`)
    .nullish()
    .transform((value) => (value === null || value === undefined || value === '' ? null : value));

/**
 * Trimmed, lowercased, then validated as an address.
 *
 * Normalising before validating means "  Ada@Example.COM " and "ada@example.com" are the same
 * identity all the way down to the unique index on `users.email`.
 */
export const emailField = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH, 'Email is too long')
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/**
 * Deliberately loose about punctuation and strict about digits.
 *
 * Phone formats differ by country and an over-tight pattern rejects valid numbers in the regions we
 * are least able to lose. Six digits minimum is the floor for a dialable number.
 */
export const phoneField = z
  .string()
  .trim()
  .min(6, 'Enter a phone number we can reach you on')
  .max(PHONE_LIMIT, 'Phone number is too long')
  .refine(
    (value) => (value.match(/\d/g) ?? []).length >= 6,
    'Enter a phone number with at least 6 digits',
  );

/** Optional phone: `stores.contact_phone` is nullable, so absence has to be expressible. */
export const optionalPhoneField = z
  .string()
  .trim()
  .max(PHONE_LIMIT, 'Phone number is too long')
  .nullish()
  .transform((value) => (value === null || value === undefined || value === '' ? null : value))
  .refine(
    (value) => value === null || (value.match(/\d/g) ?? []).length >= 6,
    'Enter a phone number with at least 6 digits',
  );

/**
 * Optional URL, normalised on the way through.
 *
 * People type `example.com` far more often than they type `https://example.com`, so a bare host gets
 * the scheme added rather than an error. Both an empty field and an absent one become `null`, which
 * keeps the optional column in the database genuinely null.
 *
 * `nullish()` rather than `optional()`, and that distinction is load-bearing: the form submits the
 * output of this schema, so a blank website arrives at the API as `null`, and an input type that
 * accepted only `string | undefined` would reject that payload with a message no user could act on.
 */
export const websiteField = z
  .string()
  .trim()
  .max(URL_LIMIT, 'Website is too long')
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === '') return null;
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  })
  .refine(
    (value) => {
      if (value === null) return true;
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Enter a valid website, for example https://yourbrand.com' },
  );

/**
 * Flatten a ZodError into `{ fieldName: firstMessage }`, which is the shape both form state and the
 * API error body want. Keys are the leaf field, so `video.bytes` lands under that key and the
 * dropzone can point at the right control.
 */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
