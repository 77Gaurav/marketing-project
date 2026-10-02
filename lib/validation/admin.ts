import { z } from 'zod';
import { BRAND_STATUSES, STORE_STATUSES } from '@/lib/db/types';
import {
  LOCATION_LIMIT,
  emailField,
  fieldErrorsFrom,
  nameField,
  optionalNameField,
  optionalPhoneField,
  phoneField,
  websiteField,
} from '@/lib/validation/fields';

/**
 * Contracts for the admin console.
 *
 * Same contract-first arrangement as the campaign form: the console and the API import these same
 * schemas, so a field cannot pass in the browser and fail on the server. The field-level rules are
 * shared with the campaign form via `lib/validation/fields.ts`, because they are the same facts
 * written to the same columns.
 *
 * Safe to import from `'use client'` — no server-only modules below this line.
 */

/**
 * Login credentials.
 *
 * The username is trimmed but the password deliberately is not: a password with a leading space is a
 * legitimate password, and silently stripping it would lock out the one person who chose it. Lengths
 * are bounded only to keep an unbounded string out of the comparison.
 */
export const adminCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Enter your username')
    .max(64, 'Username is too long'),
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(200, 'Password is too long'),
});

export type AdminCredentials = z.output<typeof adminCredentialsSchema>;

/**
 * A brand added by an operator rather than through the campaign form.
 *
 * There is no owner account behind these: an admin creating a brand is recording a customer that
 * exists offline, so `owner_user_id` is left null and the contact details are the only way to reach
 * them. Status defaults to ACTIVE rather than PENDING_REVIEW — a brand an operator typed in by hand
 * has already been reviewed; it did not arrive through a self-service form.
 */
export const adminBrandSchema = z.object({
  name: nameField('Brand name'),
  website: websiteField,
  contactName: nameField('Contact name'),
  contactEmail: emailField,
  contactPhone: phoneField,
  status: z.enum(BRAND_STATUSES).default('ACTIVE'),
});

export type AdminBrandInput = z.input<typeof adminBrandSchema>;
export type AdminBrandDraft = z.output<typeof adminBrandSchema>;

/**
 * Screen count.
 *
 * Accepts a numeric string as well as a number, because a hand-written request sends `"4"` where the
 * console sends `4`, and rejecting the former would make the API stricter than its own form for no
 * benefit. The output is always a number, so the value reaching the repository and the database
 * CHECK constraint has one type and one set of rules.
 */
const screenCountField = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? Number.NaN : Number(trimmed);
  },
  z
    .number({ error: 'Enter how many screens this venue has' })
    .int('Screens must be a whole number')
    .min(0, 'Screens cannot be negative')
    .max(100_000, 'That looks like a typo — screens must be 100,000 or fewer'),
);

/**
 * A venue added by an operator.
 *
 * `contact_name` and `contact_phone` are nullable in the schema, `contact_email` is not: it is the
 * one field a store cannot do without, since it is how the network reaches the venue about a screen
 * going down. `location` and `screen_count` are required for the same reason the admin list shows
 * them — a venue with neither cannot be matched to a campaign.
 */
export const adminStoreSchema = z.object({
  name: nameField('Store name'),
  location: z
    .string()
    .trim()
    .min(2, 'Enter where this venue is')
    .max(LOCATION_LIMIT, `Location must be ${LOCATION_LIMIT} characters or fewer`),
  screenCount: screenCountField,
  website: websiteField,
  contactName: optionalNameField('Contact name'),
  contactEmail: emailField,
  contactPhone: optionalPhoneField,
  status: z.enum(STORE_STATUSES).default('ACTIVE'),
});

export type AdminStoreInput = z.input<typeof adminStoreSchema>;
export type AdminStoreDraft = z.output<typeof adminStoreSchema>;

export { fieldErrorsFrom };
